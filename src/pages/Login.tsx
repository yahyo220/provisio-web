import { Leaf } from 'lucide-react'
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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--gesso-bg)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: 'var(--gesso-surface)',
          border: '1px solid var(--gesso-divider)',
          borderRadius: 'var(--gesso-radius-lg)',
          padding: 32,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div className="brand-mark">
            <Leaf />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Provisio</div>
            <div style={{ fontSize: 13, color: 'var(--gesso-fg-muted)' }}>Admin</div>
          </div>
        </div>

        {deniedMessage && (
          <div
            style={{
              background: 'rgba(200,40,40,0.08)',
              color: '#c02828',
              borderRadius: 'var(--gesso-radius-md)',
              padding: '10px 14px',
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {deniedMessage}
            <button
              type="button"
              onClick={() => signOut()}
              style={{ display: 'block', marginTop: 8, background: 'none', border: 'none', color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
            >
              Выйти и войти под другим аккаунтом
            </button>
          </div>
        )}

        {!deniedMessage && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input id="login-email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="login-password">Пароль</label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <div style={{ color: '#c02828', fontSize: 13 }}>{error}</div>}
            <Button type="submit" variant="primary" block disabled={busy}>
              {busy ? 'Входим…' : 'Войти'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
