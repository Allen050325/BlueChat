import { useState } from 'react'
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
      setStatus('Signed in successfully.')
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
    setMatrixClient(null)
    setUserId('')
    setPassword('')
    setStatus('')
  }

  if (matrixClient && userId) {
    return <ChatShell userId={userId} onLogout={handleLogout} />
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

function ChatShell({ userId, onLogout }) {
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

          <button className="room active" type="button">
            <span>#</span>
            BlueChat Test Room
          </button>

          <button className="room" type="button">
            <span>#</span>
            General
          </button>
        </section>

        <button className="logout" type="button" onClick={onLogout}>
          Logout
        </button>
      </aside>

      <section className="chat-panel">
        <header className="chat-header">
          <div>
            <h1>BlueChat Test Room</h1>
            <p>Matrix client connected as {userId}</p>
          </div>
        </header>

        <div className="message-area">
          <div className="empty-state">
            <h2>Welcome to BlueChat</h2>
            <p>
              Login is working. The next step is loading real Matrix rooms and messages.
            </p>
          </div>
        </div>

        <footer className="composer">
          <input placeholder="Message composer placeholder" disabled />
          <button type="button" disabled>
            Send
          </button>
        </footer>
      </section>
    </main>
  )
}

export default App
