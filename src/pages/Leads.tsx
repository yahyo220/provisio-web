import { Check, Inbox, Phone, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import Button from '../components/ui/Button'
import { listSiteLeads, setSiteLeadStatus, type SiteLead } from '../lib/api'
import { supabase } from '../lib/supabase'

/** "20 окт., 14:05" — leads are read by Russian-speaking staff, unlike formatOrderDate's en-US. */
function formatLeadDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Leads() {
  const [leads, setLeads] = useState<SiteLead[]>([])
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let cancelled = false
    const refresh = () => {
      listSiteLeads()
        .then((rows) => {
          if (!cancelled) {
            setLeads(rows)
            setError(null)
          }
        })
        .catch((err) => {
          if (!cancelled) setError((err as Error).message)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    refresh()
    const channel = client
      .channel('leads-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_leads' }, refresh)
      .subscribe()
    return () => {
      cancelled = true
      client.removeChannel(channel)
    }
  }, [])

  async function toggle(lead: SiteLead) {
    const next = lead.status === 'new' ? 'done' : 'new'
    setBusyId(lead.id)
    setLeads((rows) => rows.map((r) => (r.id === lead.id ? { ...r, status: next } : r)))
    try {
      await setSiteLeadStatus(lead.id, next)
    } catch (err) {
      setLeads((rows) => rows.map((r) => (r.id === lead.id ? { ...r, status: lead.status } : r)))
      setError((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const newCount = leads.filter((l) => l.status === 'new').length

  return (
    <>
      <div className="header">
        <div>
          <h1>Заявки с сайта</h1>
          <p>
            Заявки из формы на freshline-site.vercel.app.{' '}
            {newCount > 0 ? `Новых: ${newCount}.` : 'Новых нет.'}
          </p>
        </div>
      </div>

      {error && <div style={{ color: '#c02828', fontSize: 13 }}>Ошибка: {error}</div>}

      <div className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Когда</th>
                <th>Имя</th>
                <th>Телефон</th>
                <th>Тип заведения</th>
                <th>Язык</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {!loading && leads.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <Inbox style={{ width: 18, height: 18, verticalAlign: -4, marginRight: 6 }} />
                      Пока нет заявок
                    </div>
                  </td>
                </tr>
              )}
              {leads.map((l) => (
                <tr key={l.id} style={l.status === 'done' ? { opacity: 0.55 } : undefined}>
                  <td>
                    <span className="unit-muted">{formatLeadDate(l.createdAt)}</span>
                  </td>
                  <td>
                    <div className="prod-name">{l.name}</div>
                    {l.comment && <div className="unit-muted">{l.comment}</div>}
                  </td>
                  <td>
                    <a href={`tel:${l.phone.replace(/[^\d+]/g, '')}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                      <Phone style={{ width: 14, height: 14 }} />
                      {l.phone}
                    </a>
                  </td>
                  <td>{l.businessType || '—'}</td>
                  <td>
                    <span className="unit-muted">{l.lang ? l.lang.toUpperCase() : '—'}</span>
                  </td>
                  <td>
                    {l.status === 'new' ? (
                      <Button variant="primary" icon={<Check />} onClick={() => toggle(l)} disabled={busyId === l.id}>
                        Обработано
                      </Button>
                    ) : (
                      <Button variant="ghost" icon={<RotateCcw />} onClick={() => toggle(l)} disabled={busyId === l.id}>
                        Вернуть в новые
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
