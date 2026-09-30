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

  return <CustomerDetailForm key={customer.id} customer={customer} />
}

const PRICE_TIER_LABEL: Record<CustomerRow['priceTier'], string> = {
  with_price: 'С ценой',
  no_price: 'Без цены (скрыта)',
  external: 'Для внешних клиентов',
}

function CustomerDetailForm({ customer }: { customer: CustomerRow }) {
  const { orders, customers, updateCustomer, addCustomer } = useData()
  const { t, customerType } = useLanguage()

  const [name, setName] = useState(customer.name)
  const [contact, setContact] = useState(customer.contact)
  const [location, setLocation] = useState(customer.location)
  const [type, setType] = useState(customer.type)
  const [active, setActive] = useState(customer.status === 'active')
  // "Руководитель" is the one staff_role that should see prices — pre-select
  // it for a still-pending signup so the common case needs no extra click,
  // without taking the choice away from the admin (still just the same
  // select, still saved by the same "Одобрить" click).
  const [priceTier, setPriceTier] = useState(
    customer.approvalStatus !== 'approved' && customer.staffRole === 'Руководитель' && customer.priceTier === 'no_price'
      ? 'with_price'
      : customer.priceTier,
  )
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [bankTransferEnabled, setBankTransferEnabled] = useState(customer.bankTransferEnabled)
  const [bankTransferBusy, setBankTransferBusy] = useState(false)
  const [cashEnabled, setCashEnabled] = useState(customer.cashEnabled)
  const [cashBusy, setCashBusy] = useState(false)
  const [loginLockedAt, setLoginLockedAt] = useState(customer.loginLockedAt)
  const [unlocking, setUnlocking] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [editingRole, setEditingRole] = useState(false)
  const [roleDraft, setRoleDraft] = useState(customer.staffRole || '')
  const [roleSaving, setRoleSaving] = useState(false)
  const [addingRole, setAddingRole] = useState<string | null>(null)
  const [addName, setAddName] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addLogin, setAddLogin] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const customerOrders = orders.filter((o) => o.customerId === customer.id)
  const parent = customer.parentCustomerId ? customers.find((c) => c.id === customer.parentCustomerId) : undefined
  // The "company" this customer belongs to for staff purposes — itself if
  // it's the top-level account, otherwise its parent. Staff resolve the
  // same way whether you're looking at the manager's page or a cook's.
  const root = parent ?? customer
  const staff = customers.filter((c) => c.parentCustomerId === root.id)
  const roleSlots = STAFF_ROLES.map((role) => ({
    role,
    member: root.staffRole === role ? root : staff.find((s) => s.staffRole === role),
  }))

  async function handleRoleSave() {
    setRoleSaving(true)
    try {
      await updateCustomer(customer.id, { staffRole: roleDraft })
      setEditingRole(false)
    } catch {
      setSaveError(t('common.saveFailed'))
    } finally {
      setRoleSaving(false)
    }
  }

  async function handleAddStaff() {
    if (!addingRole) return
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
        staffRole: addingRole,
        priceTier: addingRole === 'Руководитель' ? 'with_price' : 'no_price',
        login: addLogin.trim(),
        password: addPassword,
        parentCustomerId: root.id,
      })
      setAddingRole(null)
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

  async function handleUnlink() {
    setUnlinking(true)
    try {
      await updateCustomer(customer.id, { parentCustomerId: null })
    } catch {
      setSaveError(t('common.saveFailed'))
    } finally {
      setUnlinking(false)
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
      await updateCustomer(customer.id, { name, contact, location, type, status: active ? 'active' : 'inactive', priceTier })
      setSaved(true)
    } catch {
      setSaveError(t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleApprove() {
    setApproving(true)
    try {
      await updateCustomer(customer.id, { approvalStatus: 'approved', priceTier })
    } catch {
      setSaveError(t('common.saveFailed'))
    } finally {
      setApproving(false)
    }
  }

  // Applied immediately (not deferred to the big Save button) — granting or
  // revoking a payment method reads as a permission, not a form field.
  async function handleBankTransferToggle(next: boolean) {
    setBankTransferBusy(true)
    setBankTransferEnabled(next)
    try {
      await updateCustomer(customer.id, { bankTransferEnabled: next })
    } catch {
      setBankTransferEnabled(!next)
      setSaveError(t('common.saveFailed'))
    } finally {
      setBankTransferBusy(false)
    }
  }

  async function handleCashToggle(next: boolean) {
    setCashBusy(true)
    setCashEnabled(next)
    try {
      await updateCustomer(customer.id, { cashEnabled: next })
    } catch {
      setCashEnabled(!next)
      setSaveError(t('common.saveFailed'))
    } finally {
      setCashBusy(false)
    }
  }

  // The only way this ever gets cleared — a customer can never unlock
  // themselves, even with the right password (see 0044_login_attempt_lockout.sql).
  async function handleUnlock() {
    setUnlocking(true)
    try {
      await updateCustomer(customer.id, { loginLockedAt: null })
      setLoginLockedAt(null)
    } catch {
      setSaveError(t('common.saveFailed'))
    } finally {
      setUnlocking(false)
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
            <h1>{customer.name}</h1>
            <p className="order-meta" style={{ fontSize: 14, color: 'var(--gesso-fg-muted)', marginTop: 8 }}>
              {customer.id} · {customerType(customer.type)} · {customer.orders} {t('nav.orders').toLowerCase()} ·{' '}
              {customer.spent} {t('customerDetail.lifetimeSpend')}
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

      {parent && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: 'var(--gesso-surface-recessed, rgba(0,0,0,0.04))',
            borderRadius: 'var(--gesso-radius-md)',
            padding: '12px 16px',
            fontSize: 14,
          }}
        >
          <span>
            Сотрудник клиента{' '}
            <Link to={`/customers/${parent.id}`} style={{ fontWeight: 700, color: 'var(--gesso-accent)' }}>
              {parent.name}
            </Link>
            {customer.staffRole ? ` · ${customer.staffRole}` : ''}
          </span>
          <Button variant="ghost" onClick={handleUnlink} disabled={unlinking}>
            {unlinking ? 'Отвязываем…' : 'Отвязать'}
          </Button>
        </div>
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

          <Card>
            <p className="section-label">{t('customerDetail.orderHistory')}</p>
            {customerOrders.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                {t('customerDetail.noOrders')}
              </div>
            ) : (
              <div className="related-list">
                {customerOrders.map((order) => (
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
        </div>

        <div className="detail-col">
          {customer.hasLogin && (
            <Card>
              <p className="section-label">Доступ в приложение</p>
              <div className="status-row" style={{ paddingTop: 0, marginTop: 0, borderTop: 'none' }}>
                <div>
                  <div className="lbl">
                    {customer.approvalStatus === 'approved'
                      ? 'Одобрен'
                      : customer.approvalStatus === 'pending'
                        ? 'Ожидает подтверждения'
                        : 'Заблокирован'}
                  </div>
                  <div className="sub">
                    {customer.approvalStatus === 'approved'
                      ? 'Может оформлять заказы в приложении.'
                      : 'Зарегистрировался, но пока не может заказывать.'}
                  </div>
                </div>
                {customer.approvalStatus !== 'approved' && (
                  <Button variant="primary" onClick={handleApprove} disabled={approving}>
                    {approving ? 'Одобряем…' : 'Одобрить'}
                  </Button>
                )}
              </div>

              {loginLockedAt && (
                <div className="status-row" style={{ marginTop: 16 }}>
                  <div>
                    <div className="lbl">Аккаунт заблокирован</div>
                    <div className="sub">
                      3 неверные попытки входа подряд — клиент не может войти в приложение, пока вы не разблокируете.
                    </div>
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
                    onChange={(e) => setPriceTier(e.target.value as CustomerRow['priceTier'])}
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
                    {customer.bankTransferRequested && !bankTransferEnabled
                      ? 'Клиент запросил доступ в приложении.'
                      : bankTransferEnabled
                        ? 'Может выбрать этот способ оплаты при заказе.'
                        : 'Пока недоступно — клиент должен сначала запросить в приложении.'}
                  </div>
                </div>
                <Switch
                  checked={bankTransferEnabled}
                  onChange={handleBankTransferToggle}
                  label="Оплата «Перечисление»"
                  disabled={bankTransferBusy}
                />
              </div>

              <div className="status-row" style={{ marginTop: 16 }}>
                <div>
                  <div className="lbl">Оплата наличными курьеру</div>
                  <div className="sub">
                    {customer.cashRequested && !cashEnabled
                      ? 'Клиент запросил доступ в приложении.'
                      : cashEnabled
                        ? 'Может выбрать этот способ оплаты при заказе.'
                        : 'Пока недоступно — клиент должен сначала запросить в приложении.'}
                  </div>
                </div>
                <Switch
                  checked={cashEnabled}
                  onChange={handleCashToggle}
                  label="Оплата наличными курьеру"
                  disabled={cashBusy}
                />
              </div>
            </Card>
          )}

          <Card>
            <div className="status-row" style={{ paddingTop: 0, marginTop: 0, borderTop: 'none' }}>
              <div>
                <div className="lbl">{t('customerDetail.activeAccount')}</div>
                <div className="sub">{t('customerDetail.canPlaceOrders')}</div>
              </div>
              <Switch checked={active} onChange={setActive} label={t('customerDetail.activeAccount')} />
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
                <span className="v">{customer.phone || '—'}</span>
              </div>
              <div className="info-row">
                <span className="k">
                  <Mail style={{ width: 14, height: 14, display: 'inline', marginRight: 6 }} />
                  {t('common.email')}
                </span>
                <span className="v">{customer.email || '—'}</span>
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
                    {customer.staffRole || '—'}
                    <button
                      type="button"
                      className="btn btn-text"
                      onClick={() => {
                        setRoleDraft(customer.staffRole || '')
                        setEditingRole(true)
                      }}
                    >
                      Изменить
                    </button>
                  </span>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <p className="section-label">{t('customerDetail.lifetimeValue')}</p>
            <div className="kpi-value" style={{ fontSize: 34 }}>
              {customer.spent}
            </div>
            <div className="kpi-delta up" style={{ marginTop: 8 }}>
              <span className="ref">
                {customer.orders} {t('customerDetail.ordersTotal')}
              </span>
            </div>
          </Card>
        </div>
      </section>

      <Card>
        <p className="section-label">Сотрудники по должностям</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {roleSlots.map(({ role, member }) =>
            member ? (
              <Link
                key={role}
                to={`/customers/${member.id}`}
                className={member.id === customer.id ? 'btn btn-primary' : 'btn btn-ghost'}
              >
                {role}
                {member.approvalStatus === 'pending' ? ' · Ожидает' : ''}
              </Link>
            ) : (
              <Button
                key={role}
                variant="ghost"
                icon={<Plus />}
                onClick={() => {
                  setAddingRole(role)
                  setAddError(null)
                }}
              >
                Добавить сотрудника: {role}
              </Button>
            ),
          )}
        </div>
      </Card>

      {addingRole && (
        <Modal
          title={`Добавить сотрудника: ${addingRole}`}
          onClose={() => setAddingRole(null)}
          footer={
            <Button variant="primary" icon={<Check />} onClick={handleAddStaff} disabled={addBusy}>
              {addBusy ? 'Создаём…' : 'Создать аккаунт'}
            </Button>
          }
        >
          {addError && <div style={{ color: 'var(--gesso-danger, #c02828)', fontSize: 14, marginBottom: 12 }}>{addError}</div>}
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
    </>
  )
}
