import { useState } from 'react'
import * as sdk from 'matrix-js-sdk'
import './App.css'

const HOMESERVER_URL = 'http://localhost:8008'

function App() {
  const [username, setUsername] = useState('allen')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [userId, setUserId] = useState('')

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
        {userId && <p className="status success">Logged in as {userId}</p>}
      </section>
    </main>
  )
}

export default App
