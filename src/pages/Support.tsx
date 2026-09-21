import { Send, Star } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import {
  fetchFeedbackDetail,
  fetchSupportMessages,
  fetchSupportThreads,
  markSupportMessageRead,
  markSupportThreadRead,
  sendSupportMessage,
  type FeedbackDetail,
  type SupportMessageRow,
  type SupportThread,
} from '../lib/api'
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
  const [review, setReview] = useState<FeedbackDetail | null>(null)
  const [reviewLoading, setReviewLoading] = useState(false)
  // The realtime handler below outlives renders — it reads the open thread
  // through a ref so it never acts on a stale one.
  const activeRef = useRef<Active | null>(null)
  activeRef.current = active

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

  // Quiet refresh (no "Загрузка…" flash) for live updates.
  const refreshThreads = useCallback(async () => {
    try {
      setThreads(await fetchSupportThreads())
    } catch {
      /* keep what's on screen */
    }
  }, [])

  // Loads the open thread, and marks whatever the customer/courier typed as
  // seen (review entries stay lit until they're actually opened).
  const refreshMessages = useCallback(
    async (target: Active) => {
      const list = await fetchSupportMessages(target.ownerId, target.ownerType)
      if (activeRef.current?.ownerId !== target.ownerId) return
      setMessages(list)
      if (list.some((m) => m.sender !== 'admin' && !m.readAt && !m.feedbackId)) {
        try {
          await markSupportThreadRead(target.ownerId, target.ownerType)
        } catch {
          /* will retry on the next update */
        }
        refreshThreads()
      }
    },
    [refreshThreads],
  )

  useEffect(() => {
    loadThreads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!active) return
    refreshMessages(active)
  }, [active, refreshMessages])

  // One subscription for the whole inbox: a new message (or a review) in any
  // thread lights that thread up in the list right away.
  useEffect(() => {
    if (!supabase) return
    const client = supabase
    const channel = client
      .channel('support-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages' }, () => {
        refreshThreads()
        const open = activeRef.current
        if (open) refreshMessages(open)
      })
      .subscribe()
    return () => {
      client.removeChannel(channel)
    }
  }, [refreshThreads, refreshMessages])

  async function openReview(m: SupportMessageRow) {
    if (!m.feedbackId) return
    setReviewLoading(true)
    try {
      const detail = await fetchFeedbackDetail(m.feedbackId)
      setReview(detail)
      if (!m.readAt) {
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, readAt: new Date().toISOString() } : x)))
        await markSupportMessageRead(m.id)
        refreshThreads()
      }
    } finally {
      setReviewLoading(false)
    }
  }

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
      refreshThreads()
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
                {messages.map((m) =>
                  m.feedbackId ? (
                    <button
                      key={m.id}
                      type="button"
                      className={`support-review${m.readAt ? '' : ' is-new'}`}
                      disabled={reviewLoading}
                      onClick={() => openReview(m)}
                    >
                      <span className="support-review-icon">
                        <Star style={{ width: 18, height: 18 }} />
                      </span>
                      <span className="support-review-body">
                        <span className="support-review-title">
                          {m.message}
                          {!m.readAt && <span className="support-review-chip">Новый</span>}
                        </span>
                        <span className="support-review-hint">Нажмите, чтобы открыть отзыв и фото</span>
                        <span className="support-review-time">{new Date(m.createdAt).toLocaleString()}</span>
                      </span>
                    </button>
                  ) : (
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
                  ),
                )}
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

      {review && (
        <Modal
          title={review.orderNumber != null ? `Отзыв за заказ №${review.orderNumber}` : 'Отзыв за заказ'}
          onClose={() => setReview(null)}
          footer={
            <>
              <Link className="btn" to={`/orders/${review.orderId}`} onClick={() => setReview(null)}>
                Открыть заказ
              </Link>
              <button type="button" className="btn btn-primary" onClick={() => setReview(null)}>
                Закрыть
              </button>
            </>
          }
        >
          {review.customerName && (
            <div style={{ fontSize: 13, color: 'var(--gesso-fg-muted)', marginBottom: 8 }}>{review.customerName}</div>
          )}
          {review.message ? (
            <div style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{review.message}</div>
          ) : (
            <div style={{ fontSize: 14, color: 'var(--gesso-fg-muted)' }}>Без текста — только фото.</div>
          )}
          {review.photoUrls.length > 0 && (
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              {review.photoUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <img
                    src={url}
                    alt="Фото от клиента"
                    style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 'var(--gesso-radius-sm)' }}
                  />
                </a>
              ))}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--gesso-fg-muted)', marginTop: 12 }}>
            {new Date(review.createdAt).toLocaleString()}
          </div>
        </Modal>
      )}
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
