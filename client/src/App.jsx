import { useEffect, useMemo, useRef, useState } from 'react'
import * as sdk from 'matrix-js-sdk'
import './App.css'

const HOMESERVER_URL = 'http://localhost:8008'

function App() {
  const [username, setUsername] = useState('allen')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [session, setSession] = useState(null)

  async function handleLogin() {
    try {
      setStatus('Signing in...')

      const client = sdk.createClient({
        baseUrl: HOMESERVER_URL,
      })

      const response = await client.loginRequest({
        type: 'm.login.password',
        identifier: {
          type: 'm.id.user',
          user: username,
        },
        password,
      })

      setSession({
        userId: response.user_id,
        accessToken: response.access_token,
      })

      setStatus('')
    } catch (error) {
      console.error(error)

      const message =
        error?.data?.error ||
        error?.errcode ||
        error?.message ||
        'Unknown login error'

      setStatus(`Login failed: ${message}`)
    }
  }

  function handleLogout() {
    setSession(null)
    setPassword('')
    setStatus('')
  }

  if (session) {
    return (
      <ChatShell
        session={session}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <main className="page">
      <section className="card">
        <div className="logo">B</div>

        <h1>BlueChat</h1>
        <p className="subtitle">
          A local Matrix-powered messaging prototype.
        </p>

        <form className="form">
          <label>
            Username
            <input
              type="text"
              placeholder="allen"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button type="button" onClick={handleLogin}>
            Sign in
          </button>
        </form>

        <p className="hint">
          Homeserver: {HOMESERVER_URL}
        </p>

        {status && <p className="status">{status}</p>}
      </section>
    </main>
  )
}

function ChatShell({ session, onLogout }) {
  const [rooms, setRooms] = useState([])
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [messagesByRoom, setMessagesByRoom] = useState({})
  const [draft, setDraft] = useState('')
  const [syncStatus, setSyncStatus] = useState('Starting Matrix sync...')
  const [sendStatus, setSendStatus] = useState('')
  const [sinceToken, setSinceToken] = useState('')

  const selectedRoomIdRef = useRef('')
  const messageEndRef = useRef(null)

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.roomId === selectedRoomId),
    [rooms, selectedRoomId],
  )

  const messages = messagesByRoom[selectedRoomId] || []

  function formatTime(timestamp) {
    if (!timestamp) return ''

    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function getRoomName(roomId, roomData, previousRooms = []) {
    const previousRoom = previousRooms.find((room) => room.roomId === roomId)

    const stateEvents = roomData?.state?.events || []
    const timelineEvents = roomData?.timeline?.events || []
    const allEvents = [...stateEvents, ...timelineEvents]

    const nameEvent = allEvents
      .slice()
      .reverse()
      .find((event) => event.type === 'm.room.name')

    const canonicalAliasEvent = allEvents
      .slice()
      .reverse()
      .find((event) => event.type === 'm.room.canonical_alias')

    return (
      nameEvent?.content?.name ||
      canonicalAliasEvent?.content?.alias ||
      previousRoom?.name ||
      roomId
    )
  }

  function extractMessages(roomId, roomData) {
    const timelineEvents = roomData?.timeline?.events || []

    return timelineEvents
      .filter((event) => event.type === 'm.room.message')
      .map((event) => ({
        id: event.event_id,
        sender: event.sender,
        body: event.content?.body || '[Encrypted or unsupported message]',
        timestamp: event.origin_server_ts,
        isMine: event.sender === session.userId,
      }))
  }

  async function syncOnce(currentSinceToken = '') {
    const params = new URLSearchParams({
      timeout: '1000',
    })

    if (currentSinceToken) {
      params.set('since', currentSinceToken)
    }

    const response = await fetch(
      `${HOMESERVER_URL}/_matrix/client/v3/sync?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
        },
      },
    )

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`)
    }

    const data = await response.json()
    const joinedRooms = data?.rooms?.join || {}

    const nextRooms = Object.entries(joinedRooms).map(([roomId, roomData]) => ({
      roomId,
      name: getRoomName(roomId, roomData, rooms),
    }))

    if (nextRooms.length > 0) {
      setRooms((previousRooms) => {
        const merged = [...previousRooms]

        for (const room of nextRooms) {
          const index = merged.findIndex((item) => item.roomId === room.roomId)

          if (index === -1) {
            merged.push(room)
          } else {
            merged[index] = {
              ...merged[index],
              ...room,
            }
          }
        }

        return merged
      })

      if (!selectedRoomIdRef.current) {
        selectedRoomIdRef.current = nextRooms[0].roomId
        setSelectedRoomId(nextRooms[0].roomId)
      }
    }

    setMessagesByRoom((previousMessagesByRoom) => {
      const updated = { ...previousMessagesByRoom }

      for (const [roomId, roomData] of Object.entries(joinedRooms)) {
        const newMessages = extractMessages(roomId, roomData)

        if (newMessages.length === 0) {
          continue
        }

        const oldMessages = updated[roomId] || []
        const map = new Map()

        for (const message of oldMessages) {
          map.set(message.id, message)
        }

        for (const message of newMessages) {
          map.set(message.id, message)
        }

        updated[roomId] = Array.from(map.values()).sort(
          (a, b) => a.timestamp - b.timestamp,
        )
      }

      return updated
    })

    setSyncStatus(`Loaded ${Object.keys(joinedRooms).length} updated room(s).`)
    setSinceToken(data.next_batch || currentSinceToken)

    return data.next_batch || currentSinceToken
  }

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId
  }, [selectedRoomId])

  useEffect(() => {
    let isMounted = true
    let intervalId = null
    let latestSinceToken = ''

    async function runSync() {
      try {
        latestSinceToken = await syncOnce(latestSinceToken)

        if (!isMounted) {
          return
        }
      } catch (error) {
        console.error(error)
        setSyncStatus(error.message || 'Sync failed.')
      }
    }

    runSync()

    intervalId = window.setInterval(() => {
      runSync()
    }, 1000)

    return () => {
      isMounted = false

      if (intervalId) {
        window.clearInterval(intervalId)
      }
    }
  }, [session.accessToken])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    })
  }, [messages])

  async function handleSendMessage() {
    const trimmed = draft.trim()

    if (!trimmed || !selectedRoomId) {
      return
    }

    try {
      setSendStatus('Sending...')

      const txnId = `bluechat-${Date.now()}`

      const response = await fetch(
        `${HOMESERVER_URL}/_matrix/client/v3/rooms/${encodeURIComponent(selectedRoomId)}/send/m.room.message/${txnId}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            msgtype: 'm.text',
            body: trimmed,
          }),
        },
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Send failed: ${response.status}`)
      }

      setDraft('')
      setSendStatus('')

      await syncOnce(sinceToken)
    } catch (error) {
      console.error(error)
      setSendStatus(`Send failed: ${error.message}`)
    }
  }

  function handleDraftKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <main className="chat-app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="mini-logo">B</div>
          <div>
            <h2>BlueChat</h2>
            <p>{session.userId}</p>
          </div>
        </div>

        <section className="room-section">
          <p className="section-title">Rooms</p>

          {rooms.length === 0 && (
            <p className="empty-room-list">{syncStatus}</p>
          )}

          {rooms.map((room) => (
            <button
              key={room.roomId}
              className={room.roomId === selectedRoomId ? 'room active' : 'room'}
              type="button"
              onClick={() => {
                selectedRoomIdRef.current = room.roomId
                setSelectedRoomId(room.roomId)
              }}
            >
              <span>#</span>
              {room.name || room.roomId}
            </button>
          ))}
        </section>

        <button className="logout" type="button" onClick={onLogout}>
          Logout
        </button>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div>
            <h1>{selectedRoom?.name || 'No room selected'}</h1>
            <p>{syncStatus}</p>
          </div>
        </header>

        <div className="message-area real-messages">
          {messages.length === 0 ? (
            <div className="empty-state">
              <h2>No messages yet</h2>
              <p>
                Select a room or send the first message from BlueChat.
              </p>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={message.isMine ? 'message mine' : 'message'}
                >
                  <p className="message-sender">{message.sender}</p>
                  <p className="message-body">{message.body}</p>
                  <p className="message-time">{formatTime(message.timestamp)}</p>
                </article>
              ))}
              <div ref={messageEndRef} />
            </div>
          )}
        </div>

        <footer className="composer">
          <input
            placeholder="Type a message..."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleDraftKeyDown}
          />
          <button type="button" onClick={handleSendMessage}>
            Send
          </button>
          {sendStatus && <p className="send-status">{sendStatus}</p>}
        </footer>
      </section>
    </main>
  )
}

export default App
