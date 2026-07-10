'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Bot, Sparkles, Loader2, Check, User, CalendarCheck, CalendarX, Clock, Star, Zap } from 'lucide-react'
import { parseNL, logAiCommand, applyCommand, type ParsedCommand } from '@/lib/api/ai'
import { listPatientsForSelect } from '@/lib/api/appointments'
import { useWorkspace } from '@/lib/workspace-context'
import { WEEKDAY_LABELS } from '@/lib/types/db'
import { PageHeader } from '@/components/common/page-header'
import { VoiceAppointment } from './voice-appointment'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

const EXAMPLES = [
  'Paola can come Wednesday or Friday.',
  'Marco cannot come Thursday afternoon.',
  'Anna needs a 45 minute appointment and is high priority.',
  'Giulia prefers Monday and Tuesday mornings.',
]

function matchPatient(name: string, patients: any[]) {
  const n = name.trim().toLowerCase()
  return patients.find((p) => (p.full_name || '').toLowerCase() === n)
    || patients.find((p) => (p.first_name || '').toLowerCase() === n)
    || patients.find((p) => (p.full_name || p.first_name || '').toLowerCase().includes(n))
}

export function AiAssistantClient() {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [commands, setCommands] = useState<ParsedCommand[] | null>(null)
  const [applied, setApplied] = useState<Record<number, boolean>>({})

  const { data: patients = [] } = useQuery({ queryKey: ['patients-select', businessId], queryFn: () => listPatientsForSelect(businessId), enabled: !!businessId })

  async function onParse() {
    if (!text.trim()) return
    setLoading(true); setCommands(null); setApplied({})
    try {
      const result = await parseNL(text, `ai-${businessId}`)
      if (result.error || !result.commands) { toast.error('AI could not parse that. Try rephrasing.'); }
      else { setCommands(result.commands); if (businessId) logAiCommand(businessId, text, result).catch(() => {}) }
    } catch { toast.error('Request failed. Please try again.') }
    finally { setLoading(false) }
  }

  async function apply(cmd: ParsedCommand, idx: number) {
    const p = matchPatient(cmd.patient_name, patients)
    if (!p) { toast.error(`No client named “${cmd.patient_name}” found.`); return }
    try {
      const n = await applyCommand(cmd, p)
      setApplied((a) => ({ ...a, [idx]: true }))
      toast.success(`Applied to ${cmd.patient_name}${n ? ` · ${n} availability rule(s)` : ''}.`)
    } catch (e: any) { toast.error(e.message || 'Failed to apply') }
  }

  return (
    <div>
      <PageHeader title="AI Assistant" description="Write naturally. Cadence turns your notes into structured scheduling rules." />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Bot className="h-4 w-4 text-primary" /> Describe availability</div>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder="e.g. Paola can come Wednesday or Friday. Marco can't come Thursday afternoon." />
              <Button className="mt-3 w-full" onClick={onParse} disabled={loading || !text.trim()}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Parse with AI</Button>
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">Try an example</p>
                <div className="flex flex-wrap gap-1.5">{EXAMPLES.map((ex) => <button key={ex} onClick={() => setText((t) => (t ? t + ' ' : '') + ex)} className="rounded-md border border-border bg-card px-2.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">{ex}</button>)}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          {!commands ? (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground"><Zap className="h-6 w-6" /></div>
              <h3 className="font-semibold">Structured results appear here</h3>
              <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">Powered by Gemini 2.5 Flash. Parsed rules can be applied to a client&apos;s availability with one click.</p>
            </div>
          ) : commands.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No commands detected.</div>
          ) : (
            <div className="space-y-3">
              {commands.map((cmd, i) => {
                const p = matchPatient(cmd.patient_name, patients)
                return (
                  <Card key={i} className="shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9"><AvatarFallback className={p ? 'bg-primary/10 text-primary text-xs font-semibold' : 'bg-muted text-muted-foreground'}>{p ? cmd.patient_name.slice(0, 2).toUpperCase() : <User className="h-4 w-4" />}</AvatarFallback></Avatar>
                          <div>
                            <p className="font-semibold">{cmd.patient_name}</p>
                            <p className="text-xs text-muted-foreground">{p ? 'Matched client' : 'No matching client'}</p>
                          </div>
                        </div>
                        {applied[i] ? <Badge className="bg-success/15 text-success hover:bg-success/15"><Check className="mr-1 h-3 w-3" /> Applied</Badge>
                          : <Button size="sm" variant={p ? 'default' : 'outline'} disabled={!p} onClick={() => apply(cmd, i)}>Apply</Button>}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {cmd.available?.map((a, j) => <Badge key={'a' + j} className="gap-1 bg-success/10 text-success hover:bg-success/10"><CalendarCheck className="h-3 w-3" />{WEEKDAY_LABELS[a.weekday as keyof typeof WEEKDAY_LABELS]?.slice(0, 3) || a.weekday}{a.period && a.period !== 'any' ? ` ${a.period}` : ''}</Badge>)}
                        {cmd.unavailable?.map((u, j) => <Badge key={'u' + j} className="gap-1 bg-destructive/10 text-destructive hover:bg-destructive/10"><CalendarX className="h-3 w-3" />{WEEKDAY_LABELS[u.weekday as keyof typeof WEEKDAY_LABELS]?.slice(0, 3) || u.weekday}{u.period && u.period !== 'any' ? ` ${u.period}` : ''}</Badge>)}
                        {cmd.duration_minutes && <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />{cmd.duration_minutes}m</Badge>}
                        {cmd.priority && cmd.priority !== 'normal' && <Badge variant="secondary" className="gap-1 capitalize"><Star className="h-3 w-3" />{cmd.priority}</Badge>}
                      </div>
                      {cmd.notes && <p className="mt-2 text-xs italic text-muted-foreground">{cmd.notes}</p>}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <VoiceAppointment />
    </div>
  )
}
