import { ArrowLeft, Check, Mail, MapPin, Phone, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import StatusBadge from '../components/ui/StatusBadge'
import Switch from '../components/ui/Switch'
import { useLanguage } from '../i18n/LanguageContext'
import type { CustomerRow } from '../lib/types'
import { useData } from '../store/DataContext'

// Same three choices as the app's registration screen.
const STAFF_ROLES = ['Повар', 'Бармен', 'Руководитель']

const PRICE_TIER_LABEL: Record<CustomerRow['priceTier'], string> = {
  with_price: 'С ценой',
  no_price: 'Без цены (скрыта)',
  external: 'Для внешних клиентов',
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const { customers } = useData()
  const { t } = useLanguage()
  const customer = customers.find((c) => c.id === id)

  if (!customer) {
    return (
      <div className="empty-state">
        <p>{t('customerDetail.notFound')}</p>
        <Link to="/customers" className="btn btn-ghost" style={{ marginTop: 16, display: 'inline-flex' }}>
          {t('customerDetail.backToCustomers')}
        </Link>
      </div>
    )
  }

  // This page is always framed as the company's (top-level) page — a staff
  // member's own row only ever supplies which person the selector below
  // starts on, never its own separate page identity.
  const root = customer.parentCustomerId ? (customers.find((c) => c.id === customer.parentCustomerId) ?? customer) : customer

  return <CustomerDetailForm key={root.id} root={root} initialSelectedId={customer.id} />
}

function CustomerDetailForm({ root, initialSelectedId }: { root: CustomerRow; initialSelectedId: string }) {
  const { customers, updateCustomer, addCustomer } = useData()
  const { t, customerType } = useLanguage()

  // Company-level fields — always the root account's, regardless of which
  // person is selected below.
  const [name, setName] = useState(root.name)
  const [contact, setContact] = useState(root.contact)
  const [location, setLocation] = useState(root.location)
  const [type, setType] = useState(root.type)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState(initialSelectedId)
  const selected = customers.find((c) => c.id === selectedId) ?? root
  const staff = customers.filter((c) => c.parentCustomerId === root.id)
  const group = [root, ...staff]
  const roleSlots = STAFF_ROLES.map((role) => ({
    role,
    member: root.staffRole === role ? root : staff.find((s) => s.staffRole === role),
  }))
  const emptyRoles = roleSlots.filter((s) => !s.member).map((s) => s.role)

  const [addOpen, setAddOpen] = useState(false)
  const [addRole, setAddRole] = useState(emptyRoles[0] ?? STAFF_ROLES[0])
  const [addName, setAddName] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addLogin, setAddLogin] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleAddStaff() {
    if (!addName.trim() || !addLogin.trim() || addPassword.length < 8) {
      setAddError('Укажите имя, логин и пароль (минимум 8 символов).')
      return
    }
    setAddBusy(true)
    setAddError(null)
    try {
      await addCustomer({
        name: addName.trim(),
        type: root.type,
        contact: addName.trim(),
        phone: addPhone.trim(),
        email: '',
        location: root.location,
        staffRole: addRole,
        priceTier: addRole === 'Руководитель' ? 'with_price' : 'no_price',
        login: addLogin.trim(),
        password: addPassword,
        parentCustomerId: root.id,
      })
      setAddOpen(false)
      setAddName('')
      setAddPhone('')
      setAddLogin('')
      setAddPassword('')
    } catch (err) {
      setAddError((err as Error).message)
    } finally {
      setAddBusy(false)
    }
  }

  async function handleSave() {
    if (saving) return
    if (!name.trim()) {
      setSaveError(t('common.nameRequired'))
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await updateCustomer(root.id, { name, contact, location, type })
      setSaved(true)
    } catch {
      setSaveError(t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="header">
        <div className="back-row">
          <Link to="/customers" className="back-btn" aria-label={t('customerDetail.backToCustomers')}>
            <ArrowLeft />
          </Link>
          <div>
            <h1>{root.name}</h1>
            <p className="order-meta" style={{ fontSize: 14, color: 'var(--gesso-fg-muted)', marginTop: 8 }}>
              {root.id} · {customerType(root.type)} · {root.orders} {t('nav.orders').toLowerCase()} · {root.spent}{' '}
              {t('customerDetail.lifetimeSpend')}
            </p>
          </div>
        </div>
        <div className="header-actions">
          <Button variant="primary" icon={<Check />} onClick={handleSave} disabled={saving}>
            {saving ? 'Сохраняем…' : t('common.saveChanges')}
          </Button>
        </div>
      </div>

      {saved && (
        <div
          style={{
            background: 'rgba(30,92,62,0.08)',
            color: 'var(--gesso-accent)',
            borderRadius: 'var(--gesso-radius-md)',
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {t('common.changesSaved')}
        </div>
      )}

      {saveError && (
        <div
          style={{
            background: 'rgba(192,40,40,0.08)',
            color: 'var(--gesso-danger, #c02828)',
            borderRadius: 'var(--gesso-radius-md)',
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {saveError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {emptyRoles.length > 0 && (
          <Button
            variant="ghost"
            icon={<Plus />}
            onClick={() => {
              setAddRole(emptyRoles[0])
              setAddError(null)
              setAddOpen(true)
            }}
          >
            Добавить сотрудника
          </Button>
        )}
        <div className="select-wrap">
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {group.map((m) => (
              <option key={m.id} value={m.id}>
                {m.staffRole || 'Основной аккаунт'} · {m.contact || m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {addOpen && (
        <Modal
          title="Добавить сотрудника"
          onClose={() => setAddOpen(false)}
          footer={
            <Button variant="primary" icon={<Check />} onClick={handleAddStaff} disabled={addBusy}>
              {addBusy ? 'Создаём…' : 'Создать аккаунт'}
            </Button>
          }
        >
          {addError && <div style={{ color: 'var(--gesso-danger, #c02828)', fontSize: 14, marginBottom: 12 }}>{addError}</div>}
          <div className="field">
            <label htmlFor="as-role">Должность</label>
            <div className="select-wrap">
              <select id="as-role" value={addRole} onChange={(e) => setAddRole(e.target.value)}>
                {emptyRoles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="as-name">Имя</label>
            <input id="as-name" type="text" value={addName} onChange={(e) => setAddName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="as-phone">Телефон</label>
            <input id="as-phone" type="tel" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="as-login">Логин</label>
            <input id="as-login" type="text" value={addLogin} onChange={(e) => setAddLogin(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="as-password">Пароль</label>
            <input
              id="as-password"
              type="password"
              placeholder="минимум 8 символов"
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
            />
          </div>
        </Modal>
      )}

      <section className="detail-grid">
        <div className="detail-col">
          <Card>
            <p className="section-label">{t('customerDetail.companyDetails')}</p>

            <div className="field">
              <label htmlFor="cd-name">{t('customerDetail.companyName')}</label>
              <input id="cd-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="cd-type">{t('common.type')}</label>
                <input id="cd-type" type="text" value={type} onChange={(e) => setType(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cd-contact">{t('customerDetail.contactPerson')}</label>
                <input id="cd-contact" type="text" value={contact} onChange={(e) => setContact(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="cd-loc">{t('common.location')}</label>
              <input id="cd-loc" type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </Card>
        </div>

        <PersonPanel key={selected.id} person={selected} />
      </section>
    </>
  )
}

// Everything specific to whichever person is picked in the selector above —
// keyed by their id in the parent, so every piece of local state here
// (price tier draft, role draft, toggle states) starts fresh per person
// instead of carrying over from whoever was selected before.
function PersonPanel({ person }: { person: CustomerRow }) {
  const { orders, updateCustomer } = useData()
  const { t } = useLanguage()

  const [active, setActive] = useState(person.status === 'active')
  const [activeBusy, setActiveBusy] = useState(false)
  const [priceTier, setPriceTier] = useState(person.priceTier)
  const [priceTierBusy, setPriceTierBusy] = useState(false)
  const [approving, setApproving] = useState(false)
  const [bankTransferEnabled, setBankTransferEnabled] = useState(person.bankTransferEnabled)
  const [bankTransferBusy, setBankTransferBusy] = useState(false)
  const [cashEnabled, setCashEnabled] = useState(person.cashEnabled)
  const [cashBusy, setCashBusy] = useState(false)
  const [loginLockedAt, setLoginLockedAt] = useState(person.loginLockedAt)
  const [unlocking, setUnlocking] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [editingRole, setEditingRole] = useState(false)
  const [roleDraft, setRoleDraft] = useState(person.staffRole || '')
  const [roleSaving, setRoleSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const personOrders = orders.filter((o) => o.customerId === person.id)

  async function handleActiveToggle(next: boolean) {
    setActiveBusy(true)
    setActive(next)
    try {
      await updateCustomer(person.id, { status: next ? 'active' : 'inactive' })
    } catch {
      setActive(!next)
      setError(t('common.saveFailed'))
    } finally {
      setActiveBusy(false)
    }
  }

  async function handlePriceTierChange(next: CustomerRow['priceTier']) {
    const prev = priceTier
    setPriceTierBusy(true)
    setPriceTier(next)
    try {
      await updateCustomer(person.id, { priceTier: next })
    } catch {
      setPriceTier(prev)
      setError(t('common.saveFailed'))
    } finally {
      setPriceTierBusy(false)
    }
  }

  async function handleRoleSave() {
    setRoleSaving(true)
    try {
      await updateCustomer(person.id, { staffRole: roleDraft })
      setEditingRole(false)
    } catch {
      setError(t('common.saveFailed'))
    } finally {
      setRoleSaving(false)
    }
  }

  async function handleApprove() {
    setApproving(true)
    try {
      await updateCustomer(person.id, { approvalStatus: 'approved', priceTier })
    } catch {
      setError(t('common.saveFailed'))
    } finally {
      setApproving(false)
    }
  }

  async function handleBankTransferToggle(next: boolean) {
    setBankTransferBusy(true)
    setBankTransferEnabled(next)
    try {
      await updateCustomer(person.id, { bankTransferEnabled: next })
    } catch {
      setBankTransferEnabled(!next)
      setError(t('common.saveFailed'))
    } finally {
      setBankTransferBusy(false)
    }
  }

  async function handleCashToggle(next: boolean) {
    setCashBusy(true)
    setCashEnabled(next)
    try {
      await updateCustomer(person.id, { cashEnabled: next })
    } catch {
      setCashEnabled(!next)
      setError(t('common.saveFailed'))
    } finally {
      setCashBusy(false)
    }
  }

  async function handleUnlock() {
    setUnlocking(true)
    try {
      await updateCustomer(person.id, { loginLockedAt: null })
      setLoginLockedAt(null)
    } catch {
      setError(t('common.saveFailed'))
    } finally {
      setUnlocking(false)
    }
  }

  async function handleUnlink() {
    setUnlinking(true)
    try {
      await updateCustomer(person.id, { parentCustomerId: null })
    } catch {
      setError(t('common.saveFailed'))
    } finally {
      setUnlinking(false)
    }
  }

  return (
    <div className="detail-col">
      {error && (
        <div
          style={{
            background: 'rgba(192,40,40,0.08)',
            color: 'var(--gesso-danger, #c02828)',
            borderRadius: 'var(--gesso-radius-md)',
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      <Card>
        <p className="section-label">{t('customerDetail.orderHistory')}</p>
        {personOrders.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            {t('customerDetail.noOrders')}
          </div>
        ) : (
          <div className="related-list">
            {personOrders.map((order) => (
              <Link className="related-row" to={`/orders/${order.id}`} key={order.id}>
                <div className="related-left">
                  <div className="related-icon">
                    <MapPin />
                  </div>
                  <div className="related-text">
                    <div className="related-title">
                      {t('common.order')} #{order.orderNumber}
                    </div>
                    <div className="related-meta">{order.date}</div>
                  </div>
                </div>
                <div className="related-right">
                  <StatusBadge status={order.status} />
                  <span className="related-amount">{order.total}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {person.hasLogin && (
        <Card>
          <p className="section-label">Доступ в приложение</p>
          <div className="status-row" style={{ paddingTop: 0, marginTop: 0, borderTop: 'none' }}>
            <div>
              <div className="lbl">
                {person.approvalStatus === 'approved'
                  ? 'Одобрен'
                  : person.approvalStatus === 'pending'
                    ? 'Ожидает подтверждения'
                    : 'Заблокирован'}
              </div>
              <div className="sub">
                {person.approvalStatus === 'approved'
                  ? 'Может оформлять заказы в приложении.'
                  : 'Зарегистрировался, но пока не может заказывать.'}
              </div>
            </div>
            {person.approvalStatus !== 'approved' && (
              <Button variant="primary" onClick={handleApprove} disabled={approving}>
                {approving ? 'Одобряем…' : 'Одобрить'}
              </Button>
            )}
          </div>

          {loginLockedAt && (
            <div className="status-row" style={{ marginTop: 16 }}>
              <div>
                <div className="lbl">Аккаунт заблокирован</div>
                <div className="sub">3 неверные попытки входа подряд — клиент не может войти в приложение, пока вы не разблокируете.</div>
              </div>
              <Button variant="primary" onClick={handleUnlock} disabled={unlocking}>
                {unlocking ? 'Разблокируем…' : 'Разблокировать'}
              </Button>
            </div>
          )}

          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="cd-price-tier">Тип цены для клиента</label>
            <div className="select-wrap">
              <select
                id="cd-price-tier"
                value={priceTier}
                onChange={(e) => handlePriceTierChange(e.target.value as CustomerRow['priceTier'])}
                disabled={priceTierBusy}
              >
                {(Object.keys(PRICE_TIER_LABEL) as CustomerRow['priceTier'][]).map((tier) => (
                  <option key={tier} value={tier}>
                    {PRICE_TIER_LABEL[tier]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="status-row" style={{ marginTop: 16 }}>
            <div>
              <div className="lbl">Оплата «Перечисление»</div>
              <div className="sub">
                {person.bankTransferRequested && !bankTransferEnabled
                  ? 'Клиент запросил доступ в приложении.'
                  : bankTransferEnabled
                    ? 'Может выбрать этот способ оплаты при заказе.'
                    : 'Пока недоступно — клиент должен сначала запросить в приложении.'}
              </div>
            </div>
            <Switch checked={bankTransferEnabled} onChange={handleBankTransferToggle} label="Оплата «Перечисление»" disabled={bankTransferBusy} />
          </div>

          <div className="status-row" style={{ marginTop: 16 }}>
            <div>
              <div className="lbl">Оплата наличными курьеру</div>
              <div className="sub">
                {person.cashRequested && !cashEnabled
                  ? 'Клиент запросил доступ в приложении.'
                  : cashEnabled
                    ? 'Может выбрать этот способ оплаты при заказе.'
                    : 'Пока недоступно — клиент должен сначала запросить в приложении.'}
              </div>
            </div>
            <Switch checked={cashEnabled} onChange={handleCashToggle} label="Оплата наличными курьеру" disabled={cashBusy} />
          </div>
        </Card>
      )}

      <Card>
        <div className="status-row" style={{ paddingTop: 0, marginTop: 0, borderTop: 'none' }}>
          <div>
            <div className="lbl">{t('customerDetail.activeAccount')}</div>
            <div className="sub">{t('customerDetail.canPlaceOrders')}</div>
          </div>
          <Switch checked={active} onChange={handleActiveToggle} label={t('customerDetail.activeAccount')} disabled={activeBusy} />
        </div>
      </Card>

      <Card>
        <p className="section-label">{t('common.contact')}</p>
        <div className="info-list">
          <div className="info-row">
            <span className="k">
              <Phone style={{ width: 14, height: 14, display: 'inline', marginRight: 6 }} />
              {t('common.phone')}
            </span>
            <span className="v">{person.phone || '—'}</span>
          </div>
          <div className="info-row">
            <span className="k">
              <Mail style={{ width: 14, height: 14, display: 'inline', marginRight: 6 }} />
              {t('common.email')}
            </span>
            <span className="v">{person.email || '—'}</span>
          </div>
          <div className="info-row">
            <span className="k">Должность</span>
            {editingRole ? (
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div className="select-wrap">
                  <select value={roleDraft} onChange={(e) => setRoleDraft(e.target.value)}>
                    <option value="">—</option>
                    {STAFF_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <Button variant="ghost" onClick={handleRoleSave} disabled={roleSaving}>
                  {roleSaving ? 'Сохраняем…' : 'Сохранить'}
                </Button>
              </span>
            ) : (
              <span className="v" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {person.staffRole || '—'}
                <button
                  type="button"
                  className="btn btn-text"
                  onClick={() => {
                    setRoleDraft(person.staffRole || '')
                    setEditingRole(true)
                  }}
                >
                  Изменить
                </button>
              </span>
            )}
          </div>
        </div>
        {person.parentCustomerId && (
          <div style={{ marginTop: 12 }}>
            <Button variant="ghost" onClick={handleUnlink} disabled={unlinking}>
              {unlinking ? 'Отвязываем…' : 'Отвязать от компании'}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <p className="section-label">{t('customerDetail.lifetimeValue')}</p>
        <div className="kpi-value" style={{ fontSize: 34 }}>
          {person.spent}
        </div>
        <div className="kpi-delta up" style={{ marginTop: 8 }}>
          <span className="ref">
            {person.orders} {t('customerDetail.ordersTotal')}
          </span>
        </div>
      </Card>
    </div>
  )
}
