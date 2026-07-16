'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { MessageSquare, Copy, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getMovedTemplate, serviceNamesForAppointments, fillTemplate, fmtDate, fmtHour, serviceFallback } from '@/lib/api/templates'
import { useT } from '@/lib/i18n/use-t'

type Msg = { id: string; name: string; text: string }

// Post-acceptance helper: prepare copy-paste messages for MOVED patients only.
// (Waiting-list inserts — changes without appointment_id — are intentionally ignored.)
export function MovedMessages({ businessId, changes }: { businessId: string; changes: any[] }) {
  const { t } = useT()
  const [preparing, setPreparing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msgs, setMsgs] = useState<Msg[] | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const acceptedMoves = useMemo(
    () => changes.filter((c) => c.accepted && c.appointment_id),
    [changes],
  )

  async function prepare() {
    setPreparing(true); setLoading(true)
    try {
      const { body, language } = await getMovedTemplate(businessId)
      const svc = await serviceNamesForAppointments(acceptedMoves.map((c) => c.appointment_id))
      const list: Msg[] = acceptedMoves.map((c) => {
        const name = c.patients?.first_name || c.patients?.full_name || t('dash.client')
        const text = fillTemplate(body, {
          nome: name,
          servizio: svc[c.appointment_id] || serviceFallback(language),
          vecchia_data: fmtDate(c.old_date, language),
          vecchia_ora: fmtHour(c.old_start_time),
          nuova_data: fmtDate(c.new_date, language),
          nuova_ora: fmtHour(c.new_start_time),
        })
        return { id: c.id, name, text }
      })
      setMsgs(list)
    } catch (e: any) {
      toast.error(e.message || t('mv.prepareError'))
      setPreparing(false)
    } finally { setLoading(false) }
  }

  async function copy(m: Msg) {
    try {
      await navigator.clipboard.writeText(m.text)
    } catch {
      const ta = document.createElement('textarea'); ta.value = m.text; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    setCopiedId(m.id); toast.success(t('mv.copied'))
    setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1800)
  }

  if (acceptedMoves.length === 0) return null

  if (!preparing) {
    return (
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-primary/30 bg-accent/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm">
          <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
          <span><span className="font-semibold">{t('mv.movedCount', { n: acceptedMoves.length })}</span> {t('mv.prepareQuestion')}</span>
        </div>
        <Button size="sm" onClick={prepare} className="shrink-0">{t('mv.prepare')}</Button>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm font-semibold">{t('mv.toCopy', { n: acceptedMoves.length })}</p>
      {loading && <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t('mv.preparing')}</div>}
      {!loading && (msgs ?? []).map((m) => (
        <div key={m.id} className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{m.name}</span>
            <Button size="sm" variant={copiedId === m.id ? 'secondary' : 'outline'} onClick={() => copy(m)}>
              {copiedId === m.id ? <><Check className="mr-1 h-3.5 w-3.5 text-success" /> {t('mv.copied')}</> : <><Copy className="mr-1 h-3.5 w-3.5" /> {t('mv.copy')}</>}
            </Button>
          </div>
          <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2.5 text-sm text-muted-foreground">{m.text}</p>
        </div>
      ))}
    </div>
  )
}
