'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { MessageSquare, Copy, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DemoChange } from '@/lib/demo/compact'
import { usePublicT } from '@/lib/i18n/use-public-t'
import { bcp47 } from '@/lib/i18n'

// In-memory version of components/calendar/moved-messages.tsx for the public
// /demo page: no DB, no Edge Function. Builds a ready-to-send message per moved
// appointment from the demo changes and lets the user copy each one.
function fmt(min: number) {
  const h = Math.floor(min / 60), m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function dayLabel(date: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(date + 'T00:00:00'))
  } catch {
    return date
  }
}

export function DemoMovedMessages({ changes, onClose }: { changes: DemoChange[]; onClose: () => void }) {
  const { t, locale } = usePublicT()
  const dateLocale = bcp47(locale)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const msgs = useMemo(() => changes.map((c) => ({
    id: c.id,
    name: c.patientName,
    text: t('demo.clientMessage', {
      name: c.patientName,
      date: dayLabel(c.date, dateLocale),
      oldTime: fmt(c.oldStart),
      newTime: fmt(c.newStart),
    }),
  })), [changes, dateLocale, t])

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    setCopiedId(id); toast.success(t('demo.copied'))
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800)
  }

  if (changes.length === 0) return null

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-accent/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
          <span><span className="font-semibold">{t(changes.length === 1 ? 'demo.messagesTitleOne' : 'demo.messagesTitle', { count: changes.length })}</span> {t('demo.messagesSubtitle')}</span>
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="space-y-2">
        {msgs.map((m) => (
          <div key={m.id} className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{m.name}</span>
              <Button size="sm" variant={copiedId === m.id ? 'secondary' : 'outline'} onClick={() => copy(m.id, m.text)}>
                {copiedId === m.id ? <><Check className="mr-1 h-3.5 w-3.5 text-success" /> {t('demo.copied')}</> : <><Copy className="mr-1 h-3.5 w-3.5" /> {t('demo.copy')}</>}
              </Button>
            </div>
            <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2.5 text-sm text-muted-foreground">{m.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
