import { Leaf, Lock, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../store/AuthContext'
import '../styles/login.css'

export default function Login({ deniedMessage }: { deniedMessage?: string }) {
  const { signIn, signOut } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await signIn(email.trim(), password)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="login-page">
      <div className="login-wrapper">
        <div className="login-form-box">
          <div className="login-brand-row">
            <Leaf />
          </div>
          <h2>Freshline</h2>

          {deniedMessage ? (
            <div className="login-denied">
              {deniedMessage}
              <button type="button" className="login-denied-link" onClick={() => signOut()}>
                Выйти и войти под другим аккаунтом
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="login-input-box">
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <label htmlFor="login-email">Email</label>
                <span className="login-icon">
                  <Mail size={18} />
                </span>
              </div>

              <div className="login-input-box">
                <input
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <label htmlFor="login-password">Пароль</label>
                <span className="login-icon">
                  <Lock size={18} />
                </span>
              </div>

              {error && <div className="login-error">{error}</div>}

              <button type="submit" className="login-btn" disabled={busy}>
                {busy ? 'Входим…' : 'Войти'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
