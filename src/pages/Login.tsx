import { Leaf, Lock, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import Button from '../components/ui/Button'
import { useAuth } from '../store/AuthContext'

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
    <div className="login-scene">
      <div className="login-scene-glow login-scene-glow-a" />
      <div className="login-scene-glow login-scene-glow-b" />
      <div className="login-scene-glow login-scene-glow-c" />

      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark">
            <Leaf />
          </div>
          <div>
            <div className="login-brand-name">Freshline</div>
            <div className="login-brand-sub">Панель управления</div>
          </div>
        </div>

        {deniedMessage ? (
          <div className="login-denied">
            {deniedMessage}
            <button type="button" className="login-denied-link" onClick={() => signOut()}>
              Выйти и войти под другим аккаунтом
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <label className="login-input-box" htmlFor="login-email">
              <Mail className="login-input-icon" />
              <input
                id="login-email"
                type="email"
                required
                autoComplete="username"
                placeholder=" "
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <span>Email</span>
            </label>

            <label className="login-input-box" htmlFor="login-password">
              <Lock className="login-input-icon" />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                placeholder=" "
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span>Пароль</span>
            </label>

            {error && <div className="login-error">{error}</div>}

            <Button type="submit" variant="primary" block disabled={busy}>
              {busy ? 'Входим…' : 'Войти'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
