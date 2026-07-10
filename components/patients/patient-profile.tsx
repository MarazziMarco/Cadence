'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Star, Pencil, Archive, Trash2, CalendarCheck, XCircle, UserX, Wallet, ClipboardList, Plus } from 'lucide-react'
import { getPatient, setPatientFlag, softDeletePatient } from '@/lib/api/patients'
import { listUpcomingByPatient, fmtTime } from '@/lib/api/appointments'
import { getPatientPlans } from '@/lib/api/treatment-plans'
import { useWorkspace, formatMoney } from '@/lib/workspace-context'
import { PatientFormDialog } from './patient-form-dialog'
import { TreatmentPlanDialog } from './treatment-plan-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'

export function PatientProfile({ id }: { id: string }) {
  const { business } = useWorkspace()
  const qc = useQueryClient()
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)

  const { data: p, isLoading } = useQuery({ queryKey: ['patient', id], queryFn: () => getPatient(id) })
  const { data: upcoming = [] } = useQuery({ queryKey: ['patient-upcoming', id], queryFn: () => listUpcomingByPatient(id) })
  const { data: plans = [] } = useQuery({ queryKey: ['patient-plans', id], queryFn: () => getPatientPlans(id) })

  const flagMut = useMutation({
    mutationFn: (patch: any) => setPatientFlag(id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['patient', id] }); qc.invalidateQueries({ queryKey: ['patients'] }); toast.success('Updated') },
  })
  const delMut = useMutation({
    mutationFn: () => softDeletePatient(id),
    onSuccess: () => { toast.success('Client deleted'); router.push('/patients') },
  })

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-40 w-full" /></div>
  if (!p) return <div><Link href="/patients" className="text-primary">← Back to clients</Link><p className="mt-4 text-muted-foreground">Client not found.</p></div>

  const stats = [
    { label: 'Total', value: p.total_appointments ?? 0, icon: CalendarCheck },
    { label: 'No-shows', value: p.no_show_count ?? 0, icon: UserX },
    { label: 'Cancelled', value: (p as any).cancelled_appointments ?? 0, icon: XCircle },
    { label: 'Spent', value: formatMoney(p.total_spent, business?.currency), icon: Wallet },
  ]

  return (
    <div>
      <Link href="/patients" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Clients</Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16"><AvatarFallback style={{ backgroundColor: (p.color || '#4f46e5') + '22', color: p.color || '#4f46e5' }} className="text-xl font-bold">{(p.first_name?.[0] || '') + (p.last_name?.[0] || '')}</AvatarFallback></Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight">{p.full_name || p.first_name}</h2>
              {p.is_vip && <Badge className="gap-1 bg-warning/15 text-warning hover:bg-warning/15"><Star className="h-3 w-3 fill-warning" /> VIP</Badge>}
              {p.archived && <Badge variant="secondary">Archived</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{[p.email, p.phone].filter(Boolean).join('  ·  ') || 'No contact info'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
          <Button variant="outline" onClick={() => flagMut.mutate({ is_vip: !p.is_vip })}><Star className="mr-2 h-4 w-4" /> {p.is_vip ? 'Unset VIP' : 'VIP'}</Button>
          <Button variant="outline" onClick={() => flagMut.mutate({ archived: !p.archived })}><Archive className="mr-2 h-4 w-4" /> {p.archived ? 'Unarchive' : 'Archive'}</Button>
          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => delMut.mutate()}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-sm"><CardContent className="flex items-center justify-between p-4">
            <div><p className="text-sm text-muted-foreground">{s.label}</p><p className="mt-1 text-xl font-bold tabular-nums">{s.value}</p></div>
            <s.icon className="h-5 w-5 text-muted-foreground" />
          </CardContent></Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent><p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.notes || 'No notes yet.'}</p></CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Tags</CardTitle></CardHeader>
          <CardContent><div className="flex flex-wrap gap-1.5">{(p.tags ?? []).length ? p.tags!.map((t) => <Badge key={t} variant="secondary">{t}</Badge>) : <span className="text-sm text-muted-foreground">No tags</span>}</div></CardContent>
        </Card>
      </div>

      <Card className="mt-6 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4 text-primary" /> Piani di trattamento</CardTitle>
          {business?.id && <Button size="sm" variant="outline" onClick={() => setPlanOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Nuovo piano</Button>}
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun piano attivo. Crea un piano per generare sedute collegate.</p>
          ) : (
            <div className="space-y-4">
              {plans.map((plan) => {
                const pct = plan.total ? Math.round((plan.completed / plan.total) * 100) : 0
                return (
                  <div key={plan.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{plan.treatmentType}</p>
                        <p className="text-xs text-muted-foreground">{[plan.serviceName, plan.therapist].filter(Boolean).join('  ·  ') || '—'}</p>
                      </div>
                      <Badge variant="secondary">{plan.completed}/{plan.total} completate</Badge>
                    </div>
                    <Progress value={pct} className="mt-2.5" />
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{plan.remaining} rimanenti</span>
                      {plan.nextDate && <span>Prossima: {plan.nextDate}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {business?.id && <PatientFormDialog businessId={business.id} patient={p} open={editOpen} onOpenChange={setEditOpen} />}
      {business?.id && <TreatmentPlanDialog businessId={business.id} patientId={id} open={planOpen} onOpenChange={setPlanOpen} />}
    </div>
  )
}
