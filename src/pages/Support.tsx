import { Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Card from '../components/ui/Card'
import { fetchSupportMessages, fetchSupportThreads, sendSupportMessage, type SupportMessageRow, type SupportThread } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useData } from '../store/DataContext'

type Active = { ownerId: string; ownerType: 'customer' | 'driver' }

export default function Support() {
  const { customers, driverRows } = useData()
  const [threads, setThreads] = useState<SupportThread[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<Active | null>(null)
  const [messages, setMessages] = useState<SupportMessageRow[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  function ownerName(t: { ownerId: string; ownerType: 'customer' | 'driver' }) {
    if (t.ownerType === 'driver') return driverRows.find((d) => d.id === t.ownerId)?.name ?? 'Курьер'
    return customers.find((c) => c.id === t.ownerId)?.name ?? 'Клиент'
  }

  const loadThreads = async () => {
    setLoading(true)
    try {
      const list = await fetchSupportThreads()
      setThreads(list)
      if (!active && list.length > 0) setActive({ ownerId: list[0].ownerId, ownerType: list[0].ownerType })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadThreads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!active) return
    fetchSupportMessages(active.ownerId, active.ownerType).then(setMessages)
  }, [active])

  useEffect(() => {
    if (!supabase || !active) return
    const client = supabase
    const column = active.ownerType === 'driver' ? 'driver_id' : 'customer_id'
    const channel = client
      .channel(`support-${active.ownerType}-${active.ownerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages', filter: `${column}=eq.${active.ownerId}` }, () => {
        fetchSupportMessages(active.ownerId, active.ownerType).then(setMessages)
      })
      .subscribe()
    return () => {
      client.removeChannel(channel)
    }
  }, [active])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  async function handleSend() {
    const text = draft.trim()
    if (!text || !active) return
    setSending(true)
    setDraft('')
    try {
      await sendSupportMessage(active.ownerId, active.ownerType, text)
      const updated = await fetchSupportMessages(active.ownerId, active.ownerType)
      setMessages(updated)
      loadThreads()
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <h1>Поддержка</h1>
          <p>Переписка с клиентами и курьерами, которые написали в поддержку из приложения.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, minHeight: 520 }}>
        <Card style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && <div className="empty-state">Загрузка…</div>}
            {!loading && threads.length === 0 && <div className="empty-state">Пока нет обращений</div>}
            {threads.map((t) => {
              const isActive = active?.ownerType === t.ownerType && active?.ownerId === t.ownerId
              return (
                <button
                  key={`${t.ownerType}:${t.ownerId}`}
                  type="button"
                  onClick={() => setActive({ ownerId: t.ownerId, ownerType: t.ownerType })}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '14px 16px',
                    background: isActive ? 'var(--gesso-surface-recessed, rgba(0,0,0,0.04))' : 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--gesso-divider)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ownerName(t)}
                      </span>
                      {t.ownerType === 'driver' && <RoleBadge />}
                    </span>
                    {t.unread && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gesso-accent, #1E5C3E)', flexShrink: 0 }} />
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--gesso-fg-muted)',
                      marginTop: 4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.lastMessage}
                  </div>
                </button>
              )
            })}
          </div>
        </Card>

        <Card style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
          {!active ? (
            <div className="empty-state">Выберите переписку слева</div>
          ) : (
            <>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--gesso-divider)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{ownerName(active)}</span>
                {active.ownerType === 'driver' && <RoleBadge />}
              </div>
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.sender === 'admin' ? 'flex-end' : 'flex-start',
                      maxWidth: '70%',
                      background: m.sender === 'admin' ? 'var(--gesso-accent, #1E5C3E)' : 'var(--gesso-surface-recessed, rgba(0,0,0,0.05))',
                      color: m.sender === 'admin' ? '#fff' : 'inherit',
                      borderRadius: 14,
                      padding: '10px 14px',
                      fontSize: 14,
                    }}
                  >
                    {m.message}
                    <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{new Date(m.createdAt).toLocaleString()}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid var(--gesso-divider)' }}>
                <input
                  type="text"
                  value={draft}
                  placeholder={active.ownerType === 'driver' ? 'Ответить курьеру…' : 'Ответить клиенту…'}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  style={{ flex: 1 }}
                />
                <button type="button" className="btn btn-primary" onClick={handleSend} disabled={sending || !draft.trim()}>
                  <Send style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  )
}

// Marks a thread/message as coming from a courier rather than a customer —
// the two owner types share this one inbox, so without this a courier's
// name alone doesn't say which they are.
function RoleBadge() {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        padding: '2px 7px',
        borderRadius: 999,
        background: 'var(--gesso-accent-soft, rgba(30,92,62,0.12))',
        color: 'var(--gesso-accent, #1E5C3E)',
        flexShrink: 0,
      }}
    >
      Курьер
    </span>
  )
}
