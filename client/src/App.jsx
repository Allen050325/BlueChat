import { useEffect, useMemo, useState } from 'react'
import * as sdk from 'matrix-js-sdk'
import './App.css'

const HOMESERVER_URL = 'http://localhost:8008'

function App() {
  const [username, setUsername] = useState('allen')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [userId, setUserId] = useState('')
  const [matrixClient, setMatrixClient] = useState(null)

  async function handleLogin() {
    try {
      setStatus('Signing in...')
      setUserId('')

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

      const authenticatedClient = sdk.createClient({
        baseUrl: HOMESERVER_URL,
        accessToken: response.access_token,
        userId: response.user_id,
      })

      setMatrixClient(authenticatedClient)
      setUserId(response.user_id)
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
    if (matrixClient) {
      matrixClient.stopClient()
    }

    setMatrixClient(null)
    setUserId('')
    setPassword('')
    setStatus('')
  }

  if (matrixClient && userId) {
    return (
      <ChatShell
        client={matrixClient}
        userId={userId}
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

function ChatShell({ client, userId, onLogout }) {
  const [rooms, setRooms] = useState([])
  const [selectedRoomId, setSelectedRoomId] = useState('')
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [syncStatus, setSyncStatus] = useState('Starting Matrix sync...')
  const [sendStatus, setSendStatus] = useState('')

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.roomId === selectedRoomId),
    [rooms, selectedRoomId],
  )

  function readMessagesFromRoom(room) {
    if (!room) {
      setMessages([])
      return
    }

    const events = room.getLiveTimeline().getEvents()

    const roomMessages = events
      .filter((event) => event.getType() === 'm.room.message')
      .map((event) => {
        const content = event.getContent()
        const sender = event.getSender()

        return {
          id: event.getId() || `${sender}-${event.getTs()}`,
          sender,
          body: content.body || '[Encrypted or unsupported message]',
          timestamp: event.getTs(),
          isMine: sender === userId,
        }
      })

    setMessages(roomMessages)
  }

  useEffect(() => {
    let isMounted = true

    async function startMatrixSync() {
      try {
        client.startClient({
          initialSyncLimit: 50,
        })

        client.once('sync', (state) => {
          if (!isMounted) return

          if (state === 'PREPARED') {
            const joinedRooms = client.getRooms()

            setRooms(joinedRooms)

            if (joinedRooms.length > 0) {
              const firstRoomId = joinedRooms[0].roomId
              setSelectedRoomId(firstRoomId)
              readMessagesFromRoom(joinedRooms[0])
            }

            setSyncStatus(`Loaded ${joinedRooms.length} room(s).`)
          } else {
            setSyncStatus(`Sync state: ${state}`)
          }
        })

        client.on('Room.timeline', (event, room, toStartOfTimeline) => {
          if (!isMounted || toStartOfTimeline) return
          if (!room || room.roomId !== selectedRoomId) return
          if (event.getType() !== 'm.room.message') return

          readMessagesFromRoom(room)
        })
      } catch (error) {
        console.error(error)
        setSyncStatus('Failed to start Matrix sync.')
      }
    }

    startMatrixSync()

    return () => {
      isMounted = false
      client.removeAllListeners('Room.timeline')
      client.stopClient()
    }
  }, [client, selectedRoomId])

  useEffect(() => {
    if (selectedRoom) {
      readMessagesFromRoom(selectedRoom)
    }
  }, [selectedRoomId, selectedRoom])

  async function handleSendMessage() {
    const trimmed = draft.trim()

    if (!trimmed || !selectedRoomId) {
      return
    }

    try {
      setSendStatus('Sending...')

      await client.sendTextMessage(selectedRoomId, trimmed)

      setDraft('')
      setSendStatus('Sent.')
    } catch (error) {
      console.error(error)

      const message =
        error?.data?.error ||
        error?.errcode ||
        error?.message ||
        'Unknown send error'

      setSendStatus(`Send failed: ${message}`)
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
            <p>{userId}</p>
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
              onClick={() => setSelectedRoomId(room.roomId)}
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

              {selectedRoom && (
                <p className="room-id">
                  Room ID: {selectedRoom.roomId}
                </p>
              )}
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
                </article>
              ))}
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
