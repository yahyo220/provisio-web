import { ArrowLeft, Check, Eye, EyeOff, Mail, MapPin, Phone, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Dropdown from '../components/ui/Dropdown'
import Modal from '../components/ui/Modal'
import StatusBadge from '../components/ui/StatusBadge'
import Switch from '../components/ui/Switch'
import { useLanguage } from '../i18n/LanguageContext'
import { setCustomerPassword } from '../lib/api'
import type { CustomerRow } from '../lib/types'
import { useData } from '../store/DataContext'

// Skips look-alike characters (0/O, 1/l/I) so a password read out loud or
// typed from a screenshot doesn't get mistyped.
function generatePassword(length = 10) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

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

  return <CustomerDetailForm key={root.id} root={root} />
}

function CustomerDetailForm({ root }: { root: CustomerRow }) {
  const { customers, orders, driverRows, updateCustomer, addCustomer } = useData()
  const { t, customerType } = useLanguage()

  // Company-level fields — always the root account's, regardless of which
  // person is selected below. Contact person is NOT here — that's
  // whoever's picked in the dropdown, so it lives in PersonPanel instead.
  const [name, setName] = useState(root.name)
  const [location, setLocation] = useState(root.location)
  const [type, setType] = useState(root.type)
  const [defaultDriverId, setDefaultDriverId] = useState(root.defaultDriverId ?? '')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const staff = customers.filter((c) => c.parentCustomerId === root.id)
  const group = [root, ...staff]
  const groupIds = new Set(group.map((m) => m.id))
  // Orders belong to whichever company a staff member works for, not to
  // their own login — so the company's order history and totals are
  // pooled across root + staff, not shown separately per person.
  const groupOrders = orders.filter((o) => o.customerId && groupIds.has(o.customerId))
  const totalSpentRaw = groupOrders.reduce((sum, o) => sum + o.totalRaw, 0)

  // Always defaults to the manager/root — not whichever person's URL
  // happened to be opened.
  const [selectedId, setSelectedId] = useState(root.id)
  const selected = group.find((m) => m.id === selectedId) ?? root

  const roleSlots = STAFF_ROLES.map((role) => ({
    role,
    member: root.staffRole === role ? root : staff.find((s) => s.staffRole === role),
  }))
  const emptyRoles = roleSlots.filter((s) => !s.member).map((s) => s.role)

  const [addOpen, setAddOpen] = useState(false)
  const [addRole, setAddRole] = useState(emptyRoles[0] ?? STAFF_ROLES[0])
  const [addFirstName, setAddFirstName] = useState('')
  const [addLastName, setAddLastName] = useState('')
  const [addPhone, setAddPhone] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addLogin, setAddLogin] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleAddStaff() {
    const fullName = `${addFirstName.trim()} ${addLastName.trim()}`.trim()
    if (!fullName || !addLogin.trim() || addPassword.length < 8) {
      setAddError('Укажите имя, фамилию, логин и пароль (минимум 8 символов).')
      return
    }
    setAddBusy(true)
    setAddError(null)
    try {
      const newId = await addCustomer({
        name: fullName,
        type: root.type,
        contact: fullName,
        phone: addPhone.trim(),
        email: addEmail.trim(),
        location: root.location,
        staffRole: addRole,
        priceTier: addRole === 'Руководитель' ? 'with_price' : 'no_price',
        login: addLogin.trim(),
        password: addPassword,
        parentCustomerId: root.id,
      })
      // Belt-and-suspenders: the edge function already sets these on
      // insert, but this guarantees it regardless — the alternative is a
      // staff account that silently lands as its own top-level client.
      if (newId) {
        await updateCustomer(newId, { parentCustomerId: root.id, approvalStatus: 'approved' })
      }
      setAddOpen(false)
      setAddFirstName('')
      setAddLastName('')
      setAddPhone('')
      setAddEmail('')
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
      // Only sent when changed, so saving the other fields never depends on
      // the default_driver_id column being there.
      const driverChanged = defaultDriverId !== (root.defaultDriverId ?? '')
      await updateCustomer(root.id, {
        name,
        location,
        type,
        ...(driverChanged ? { defaultDriverId: defaultDriverId || null } : {}),
      })
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
              {root.id} · {customerType(root.type)} · {groupOrders.length} {t('nav.orders').toLowerCase()} ·{' '}
              {totalSpentRaw.toLocaleString('ru-RU')} сум {t('customerDetail.lifetimeSpend')}
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
        <Dropdown
          allLabel={selected.staffRole || 'Руководитель'}
          hideAllOption
          variant="pill"
          options={group.map((m) => ({
            value: m.id,
            label: `${m.staffRole || 'Руководитель'} · ${m.contact || m.name}`,
          }))}
          value={selectedId}
          onChange={(v) => v && setSelectedId(v)}
        />
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
          <div className="field-row">
            <div className="field">
              <label htmlFor="as-first">Имя</label>
              <input id="as-first" type="text" value={addFirstName} onChange={(e) => setAddFirstName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="as-last">Фамилия</label>
              <input id="as-last" type="text" value={addLastName} onChange={(e) => setAddLastName(e.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="as-phone">Телефон</label>
              <input id="as-phone" type="tel" placeholder="+998 90 123 45 67" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="as-email">Email</label>
              <input id="as-email" type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} />
            </div>
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

            <div className="field">
              <label htmlFor="cd-type">{t('common.type')}</label>
              <input id="cd-type" type="text" value={type} onChange={(e) => setType(e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="cd-loc">{t('common.location')}</label>
              <input id="cd-loc" type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>

            <div className="field">
              <label htmlFor="cd-driver">Доставщик</label>
              <div className="select-wrap">
                <select id="cd-driver" value={defaultDriverId} onChange={(e) => setDefaultDriverId(e.target.value)}>
                  <option value="">Не выбран — назначать вручную</option>
                  {driverRows
                    .filter((d) => d.active || d.id === defaultDriverId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.active ? '' : ' (не на смене)'}
                      </option>
                    ))}
                </select>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--gesso-fg-muted)' }}>
                Новые заказы этого клиента и его сотрудников сразу попадут к этому доставщику.
              </p>
            </div>
          </Card>

          <Card>
            <p className="section-label">{t('customerDetail.orderHistory')}</p>
            {groupOrders.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                {t('customerDetail.noOrders')}
              </div>
            ) : (
              <div className="related-list">
                {groupOrders.map((order) => {
                  const placedBy = group.find((m) => m.id === order.customerId)
                  return (
                    <Link className="related-row" to={`/orders/${order.id}`} key={order.id}>
                      <div className="related-left">
                        <div className="related-icon">
                          <MapPin />
                        </div>
                        <div className="related-text">
                          <div className="related-title">
                            {t('common.order')} #{order.orderNumber}
                          </div>
                          <div className="related-meta">
                            {order.date}
                            {placedBy && placedBy.id !== root.id ? ` · ${placedBy.staffRole || placedBy.contact || placedBy.name}` : ''}
                          </div>
                        </div>
                      </div>
                      <div className="related-right">
                        <StatusBadge status={order.status} />
                        <span className="related-amount">{order.total}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </Card>

          <Card>
            <p className="section-label">{t('customerDetail.lifetimeValue')}</p>
            <div className="kpi-value" style={{ fontSize: 34 }}>
              {totalSpentRaw.toLocaleString('ru-RU')} сум
            </div>
            <div className="kpi-delta up" style={{ marginTop: 8 }}>
              <span className="ref">
                {groupOrders.length} {t('customerDetail.ordersTotal')}
              </span>
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
// (price tier draft, toggle states) starts fresh per person instead of
// carrying over from whoever was selected before.
function PersonPanel({ person }: { person: CustomerRow }) {
  const { updateCustomer, removeCustomer } = useData()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [contact, setContact] = useState(person.contact)
  const [contactBusy, setContactBusy] = useState(false)
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
  const [error, setError] = useState<string | null>(null)

  // Linked staff (Повар/Бармен) are paid for however their company's
  // Руководитель is set up (see migration 0056) — their own switches would
  // do nothing, so they aren't shown.
  const inheritsPayment = Boolean(person.parentCustomerId) && person.staffRole !== 'Руководитель'

  const [login, setLogin] = useState(person.login)
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [credsBusy, setCredsBusy] = useState(false)
  const [credsMsg, setCredsMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function handleSaveCredentials() {
    const nextLogin = login.trim()
    const loginChanged = nextLogin !== person.login
    if (!nextLogin) {
      setCredsMsg({ ok: false, text: 'Логин не может быть пустым.' })
      return
    }
    if (newPassword && newPassword.length < 8) {
      setCredsMsg({ ok: false, text: 'Пароль — минимум 8 символов.' })
      return
    }
    if (!loginChanged && !newPassword) {
      setCredsMsg({ ok: false, text: 'Нечего сохранять: измените логин или введите новый пароль.' })
      return
    }

    setCredsBusy(true)
    setCredsMsg(null)
    let loginSaved = false
    try {
      if (loginChanged) {
        await updateCustomer(person.id, { login: nextLogin })
        loginSaved = true
      }
      if (newPassword) await setCustomerPassword(person.id, newPassword)
      setNewPassword('')
      setCredsMsg({
        ok: true,
        text: loginChanged && newPassword ? 'Логин и пароль сохранены.' : loginChanged ? 'Логин сохранён.' : 'Пароль сохранён.',
      })
    } catch (err) {
      const e = err as { message?: string; code?: string }
      const taken = e.code === '23505' || /already in use|duplicate/i.test(e.message ?? '')
      const reason = taken ? 'Этот логин уже занят — выберите другой.' : e.message || t('common.saveFailed')
      setCredsMsg({ ok: false, text: loginSaved ? `Логин сохранён, но пароль изменить не удалось: ${reason}` : reason })
    } finally {
      setCredsBusy(false)
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await removeCustomer(person.id)
      // Staff stay on the company's page; a whole company is gone, so leave.
      if (!person.parentCustomerId) navigate('/customers')
      else setConfirmingDelete(false)
    } catch (err) {
      setDeleteError((err as Error).message || t('common.saveFailed'))
    } finally {
      setDeleting(false)
    }
  }

  async function handleContactBlur() {
    const trimmed = contact.trim()
    if (trimmed === person.contact) return
    setContactBusy(true)
    try {
      await updateCustomer(person.id, { contact: trimmed })
    } catch {
      setContact(person.contact)
      setError(t('common.saveFailed'))
    } finally {
      setContactBusy(false)
    }
  }

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

          {inheritsPayment ? (
            <div className="status-row" style={{ marginTop: 16 }}>
              <div>
                <div className="lbl">Способ оплаты</div>
                <div className="sub">Как у руководителя — выбрать самостоятельно сотрудник не может. Меняется в профиле руководителя.</div>
              </div>
            </div>
          ) : (
            <>
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
            </>
          )}
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
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="pc-contact">{t('customerDetail.contactPerson')}</label>
          <input
            id="pc-contact"
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            onBlur={handleContactBlur}
            disabled={contactBusy}
          />
        </div>
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
            <span className="v">{person.staffRole || 'Руководитель'}</span>
          </div>
        </div>

        {person.hasLogin && (
          <div style={{ marginTop: 16 }}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label htmlFor="pc-login">Логин</label>
              <input
                id="pc-login"
                type="text"
                autoComplete="off"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                disabled={credsBusy}
              />
            </div>
            <div className="field" style={{ marginBottom: 12 }}>
              <label htmlFor="pc-password">Новый пароль</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="pc-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="оставьте пустым, чтобы не менять"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={credsBusy}
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--gesso-fg-muted)',
                    display: 'flex',
                    padding: 4,
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <button
                type="button"
                disabled={credsBusy}
                onClick={() => {
                  setNewPassword(generatePassword())
                  setShowPassword(true)
                  setCredsMsg(null)
                }}
                style={{
                  marginTop: 8,
                  padding: 0,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--gesso-accent)',
                }}
              >
                Сгенерировать пароль
              </button>
            </div>
            {credsMsg && (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginBottom: 12,
                  color: credsMsg.ok ? 'var(--gesso-accent)' : 'var(--gesso-danger, #c02828)',
                }}
              >
                {credsMsg.text}
              </div>
            )}
            <Button variant="primary" icon={<Check />} onClick={handleSaveCredentials} disabled={credsBusy}>
              {credsBusy ? 'Сохраняем…' : 'Сохранить логин и пароль'}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <p className="section-label">Удаление</p>
        <div className="status-row" style={{ paddingTop: 0, marginTop: 0, borderTop: 'none' }}>
          <div>
            <div className="lbl">Удалить клиента</div>
            <div className="sub">
              Без заказов — удаляется полностью. Если заказы есть, личные данные стираются, а заказы остаются в учёте.
            </div>
          </div>
          <Button variant="danger-text" icon={<Trash2 />} onClick={() => setConfirmingDelete(true)}>
            Удалить
          </Button>
        </div>
      </Card>

      {confirmingDelete && (
        <Modal
          title={`Удалить «${person.name}»?`}
          onClose={() => !deleting && setConfirmingDelete(false)}
          footer={
            <>
              <Button variant="text" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                {t('common.cancel')}
              </Button>
              <Button variant="danger-text" onClick={handleConfirmDelete} disabled={deleting}>
                {deleting ? 'Удаляем…' : 'Удалить'}
              </Button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--gesso-fg-muted)' }}>
            Клиент потеряет доступ в приложение. Восстановить будет нельзя.
          </p>
          {deleteError && (
            <p style={{ fontSize: 14, fontWeight: 600, marginTop: 12, color: 'var(--gesso-danger, #c02828)' }}>{deleteError}</p>
          )}
        </Modal>
      )}
    </div>
  )
}
