import { Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Card from '../components/ui/Card'
import { fetchSupportMessages, fetchSupportThreads, sendSupportMessage, type SupportMessageRow } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useData } from '../store/DataContext'

interface Thread {
  customerId: string
  lastMessage: string
  lastAt: string
  unread: boolean
}

export default function Support() {
  const { customers } = useData()
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<string | null>(null)
  const [messages, setMessages] = useState<SupportMessageRow[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  function customerName(id: string) {
    return customers.find((c) => c.id === id)?.name ?? 'Клиент'
  }

  const loadThreads = async () => {
    setLoading(true)
    try {
      const list = await fetchSupportThreads()
      setThreads(list)
      if (!active && list.length > 0) setActive(list[0].customerId)
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
    fetchSupportMessages(active).then(setMessages)
  }, [active])

  useEffect(() => {
    if (!supabase || !active) return
    const client = supabase
    const channel = client
      .channel(`support-${active}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages', filter: `customer_id=eq.${active}` }, () => {
        fetchSupportMessages(active).then(setMessages)
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
      await sendSupportMessage(active, text)
      const updated = await fetchSupportMessages(active)
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
          <p>Переписка с клиентами, которые написали в поддержку из приложения.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, minHeight: 520 }}>
        <Card style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && <div className="empty-state">Загрузка…</div>}
            {!loading && threads.length === 0 && <div className="empty-state">Пока нет обращений</div>}
            {threads.map((t) => (
              <button
                key={t.customerId}
                type="button"
                onClick={() => setActive(t.customerId)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '14px 16px',
                  background: active === t.customerId ? 'var(--gesso-surface-recessed, rgba(0,0,0,0.04))' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--gesso-divider)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{customerName(t.customerId)}</span>
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
            ))}
          </div>
        </Card>

        <Card style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
          {!active ? (
            <div className="empty-state">Выберите переписку слева</div>
          ) : (
            <>
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
                  placeholder="Ответить клиенту…"
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
