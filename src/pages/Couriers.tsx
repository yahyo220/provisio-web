import { Check, ClipboardList, KeyRound, Plus, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import { isLoginLocked } from '../lib/loginLock'
import type { PickOrder } from '../lib/pickList'
import { useData } from '../store/DataContext'
import PickListModal from './couriers/PickListModal'

export default function Couriers() {
  const { driverRows, addCourier, updateDriver, deliveries, orders } = useData()
  const [open, setOpen] = useState(false)
  const [pickFor, setPickFor] = useState<string | null>(null)

  // Per courier: orders assigned to them and not collected from the
  // warehouse yet (delivery scheduled or delayed, order still live) — what
  // the pick list ("сборочный лист") covers.
  const toPickUp = useMemo(() => {
    const orderById = new Map(orders.map((o) => [o.id, o]))
    const byDriver = new Map<string, PickOrder[]>()
    for (const d of deliveries) {
      if (!d.driverId || !d.orderDbId || (d.status !== 'scheduled' && d.status !== 'delayed')) continue
      const order = orderById.get(d.orderDbId)
      if (!order || order.status === 'cancelled' || order.status === 'delivered') continue
      const list = byDriver.get(d.driverId) ?? []
      list.push({ id: order.id, orderNumber: order.orderNumber, customer: order.customer, address: d.address })
      byDriver.set(d.driverId, list)
    }
    for (const list of byDriver.values()) list.sort((a, b) => (a.orderNumber ?? 0) - (b.orderNumber ?? 0))
    return byDriver
  }, [deliveries, orders])
  const pickDriver = driverRows.find((d) => d.id === pickFor)
  const [unlockingId, setUnlockingId] = useState<string | null>(null)

  async function handleUnlock(id: string) {
    setUnlockingId(id)
    try {
      await updateDriver(id, { loginLockedAt: null })
    } finally {
      setUnlockingId(null)
    }
  }
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim() || !login.trim() || password.length < 6) {
      setError('Укажите имя, логин и пароль (минимум 6 символов).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await addCourier({ name: name.trim(), phone: phone.trim(), login: login.trim(), password })
      setOpen(false)
      setName('')
      setPhone('')
      setLogin('')
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
                <th style={{ textAlign: 'right' }}>Сборочный лист</th>
              </tr>
            </thead>
            <tbody>
              {driverRows.length === 0 && (
                <tr>
                  <td colSpan={5}>
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
                    {isLoginLocked(d.loginLockedAt) ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="cat-tag" style={{ color: 'var(--danger, #d33)' }}>
                          Заблокирован
                        </span>
                        <Button variant="ghost" onClick={() => handleUnlock(d.id)} disabled={unlockingId === d.id}>
                          {unlockingId === d.id ? 'Разблокируем…' : 'Разблокировать'}
                        </Button>
                      </div>
                    ) : (
                      <span className="cat-tag">{d.active ? 'Активен' : 'Отключён'}</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {(toPickUp.get(d.id)?.length ?? 0) > 0 ? (
                      <Button variant="ghost" icon={<ClipboardList />} onClick={() => setPickFor(d.id)}>
                        Заказов: {toPickUp.get(d.id)!.length}
                      </Button>
                    ) : (
                      <span className="unit-muted">нечего забирать</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pickDriver && toPickUp.get(pickDriver.id) && (
        <PickListModal courier={pickDriver.name} orders={toPickUp.get(pickDriver.id)!} onClose={() => setPickFor(null)} />
      )}

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
              <label htmlFor="c-login">Логин для входа</label>
              <input id="c-login" type="text" value={login} onChange={(e) => setLogin(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="c-pass">Пароль</label>
              <input id="c-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <div style={{ color: '#c02828', fontSize: 13 }}>{error}</div>}
          </Card>
        </Modal>
      )}
    </>
  )
}
