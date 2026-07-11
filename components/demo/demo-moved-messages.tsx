'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { MessageSquare, Copy, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DemoChange } from '@/lib/demo/compact'

// In-memory version of components/calendar/moved-messages.tsx for the public
// /demo page: no DB, no Edge Function. Builds a ready-to-send message per moved
// appointment from the demo changes and lets the user copy each one.
function fmt(min: number) {
  const h = Math.floor(min / 60), m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function dayLabel(date: string) {
  try {
    return new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(date + 'T00:00:00'))
  } catch {
    return date
  }
}

function buildText(c: DemoChange) {
  return `Ciao ${c.patientName}, il tuo appuntamento di ${dayLabel(c.date)} è stato anticipato dalle ${fmt(c.oldStart)} alle ${fmt(c.newStart)}. Fammi sapere se ti va bene!`
}

export function DemoMovedMessages({ changes, onClose }: { changes: DemoChange[]; onClose: () => void }) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const msgs = useMemo(() => changes.map((c) => ({ id: c.id, name: c.patientName, text: buildText(c) })), [changes])

  async function copy(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    setCopiedId(id); toast.success('Copiato ✓')
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800)
  }

  if (changes.length === 0) return null

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-accent/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
          <span><span className="font-semibold">{changes.length} appuntamenti spostati.</span> Copia i messaggi da inviare ai pazienti.</span>
        </div>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="space-y-2">
        {msgs.map((m) => (
          <div key={m.id} className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{m.name}</span>
              <Button size="sm" variant={copiedId === m.id ? 'secondary' : 'outline'} onClick={() => copy(m.id, m.text)}>
                {copiedId === m.id ? <><Check className="mr-1 h-3.5 w-3.5 text-success" /> Copiato ✓</> : <><Copy className="mr-1 h-3.5 w-3.5" /> Copia</>}
              </Button>
            </div>
            <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-2.5 text-sm text-muted-foreground">{m.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
