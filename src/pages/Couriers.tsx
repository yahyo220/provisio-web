import { Check, KeyRound, Plus, Truck } from 'lucide-react'
import { useState } from 'react'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import { useData } from '../store/DataContext'

export default function Couriers() {
  const { driverRows, addCourier } = useData()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim() || !email.trim() || password.length < 6) {
      setError('Укажите имя, email и пароль (минимум 6 символов).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await addCourier({ name: name.trim(), phone: phone.trim(), email: email.trim(), password })
      setOpen(false)
      setName('')
      setPhone('')
      setEmail('')
      setPassword('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <h1>Курьеры</h1>
          <p>Аккаунты для доставщиков — вход в приложение под своим логином и паролем.</p>
        </div>
        <div className="header-actions">
          <Button variant="primary" icon={<Plus />} onClick={() => setOpen(true)}>
            Добавить курьера
          </Button>
        </div>
      </div>

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Курьер</th>
                <th>Телефон</th>
                <th>Вход в приложение</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {driverRows.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">Пока нет курьеров</div>
                  </td>
                </tr>
              )}
              {driverRows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="prod-cell">
                      <div className="avatar">
                        <Truck style={{ width: 16, height: 16 }} />
                      </div>
                      <div className="prod-name">{d.name}</div>
                    </div>
                  </td>
                  <td>
                    <span className="unit-muted">{d.phone || '—'}</span>
                  </td>
                  <td>
                    {d.hasLogin ? (
                      <span className="cat-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <KeyRound style={{ width: 13, height: 13 }} /> Настроен
                      </span>
                    ) : (
                      <span className="unit-muted">Нет логина</span>
                    )}
                  </td>
                  <td>
                    <span className="cat-tag">{d.active ? 'Активен' : 'Отключён'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <Modal
          title="Новый курьер"
          onClose={() => setOpen(false)}
          footer={
            <Button variant="primary" icon={<Check />} onClick={handleCreate} disabled={busy}>
              {busy ? 'Создаём…' : 'Создать аккаунт'}
            </Button>
          }
        >
          <Card style={{ marginBottom: 0 }}>
            <div className="field">
              <label htmlFor="c-name">Имя</label>
              <input id="c-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="c-phone">Телефон</label>
              <input id="c-phone" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="c-email">Email для входа</label>
              <input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="c-pass">Пароль</label>
              <input id="c-pass" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <div style={{ color: '#c02828', fontSize: 13 }}>{error}</div>}
          </Card>
        </Modal>
      )}
    </>
  )
}
