'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Star, Pencil, Archive, Trash2, CalendarCheck, XCircle, UserX, Wallet, ClipboardList, Plus, CalendarPlus, CalendarClock, MapPin } from 'lucide-react'
import { getPatient, setPatientFlag, softDeletePatient } from '@/lib/api/patients'
import { listUpcomingByPatient, fmtTime } from '@/lib/api/appointments'
import { getPatientPlans, deleteTreatmentPlan, type PatientPlan } from '@/lib/api/treatment-plans'
import { invalidateCalendarAppointments } from '@/lib/calendar/query-keys'
import { useWorkspace, formatMoney } from '@/lib/workspace-context'
import { useT } from '@/lib/i18n/use-t'
import { PatientFormDialog } from './patient-form-dialog'
import { TreatmentPlanDialog } from './treatment-plan-dialog'
import { TreatmentPlanEditDialog } from './treatment-plan-edit-dialog'
import { PatientNotes } from './patient-notes'
import { AppointmentDialog } from '@/components/calendar/appointment-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function PatientProfile({ id }: { id: string }) {
  const { business } = useWorkspace()
  const { t } = useT()
  const qc = useQueryClient()
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [apptOpen, setApptOpen] = useState(false)
  const [editPlan, setEditPlan] = useState<PatientPlan | null>(null)

  const { data: p, isLoading } = useQuery({ queryKey: ['patient', id], queryFn: () => getPatient(id) })
  const { data: upcoming = [] } = useQuery({ queryKey: ['patient-upcoming', id], queryFn: () => listUpcomingByPatient(id) })
  const { data: plans = [] } = useQuery({ queryKey: ['patient-plans', id], queryFn: () => getPatientPlans(id) })

  const flagMut = useMutation({
    mutationFn: (patch: any) => setPatientFlag(id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['patient', id] }); qc.invalidateQueries({ queryKey: ['patients'] }); toast.success(t('patient.updated')) },
  })
  const delMut = useMutation({
    mutationFn: () => softDeletePatient(id),
    onSuccess: () => { toast.success(t('patient.deleted')); router.push('/patients') },
  })
  const delPlanMut = useMutation({
    mutationFn: (parentId: string) => deleteTreatmentPlan(parentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient-plans', id] })
      qc.invalidateQueries({ queryKey: ['patient-upcoming', id] })
      if (business?.id) invalidateCalendarAppointments(qc, business.id)
      toast.success(t('patient.planDeleted'))
    },
    onError: () => toast.error(t('common.saveFailed')),
  })

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-40 w-full" /></div>
  if (!p) return <div><Link href="/patients" className="text-primary">← {t('patient.back')}</Link><p className="mt-4 text-muted-foreground">{t('patient.notFound')}</p></div>

  const stats = [
    { label: t('patient.total'), value: p.total_appointments ?? 0, icon: CalendarCheck },
    { label: t('patient.noShows'), value: p.no_show_count ?? 0, icon: UserX },
    { label: t('patient.cancelled'), value: (p as any).cancelled_appointments ?? 0, icon: XCircle },
    { label: t('patient.spent'), value: formatMoney(p.total_spent, business?.currency), icon: Wallet },
  ]
  const addressLine = [
    p.address,
    [p.postal_code, p.city].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ')

  return (
    <div>
      <Link href="/patients" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {t('nav.patients')}</Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16"><AvatarFallback style={{ backgroundColor: (p.color || '#4f46e5') + '22', color: p.color || '#4f46e5' }} className="text-xl font-bold">{(p.first_name?.[0] || '') + (p.last_name?.[0] || '')}</AvatarFallback></Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight">{p.full_name || p.first_name}</h2>
              {/* VIP is just a star: lit when VIP, off otherwise */}
              <button onClick={() => flagMut.mutate({ is_vip: !p.is_vip })} aria-label={p.is_vip ? t('patient.unsetVip') : t('patient.setVip')} className="rounded-full p-1 transition-colors hover:bg-accent">
                <Star className={p.is_vip ? 'h-5 w-5 fill-warning text-warning' : 'h-5 w-5 text-muted-foreground'} />
              </button>
              <button onClick={() => setEditOpen(true)} aria-label={t('common.edit')} className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><Pencil className="h-4 w-4" /></button>
              {p.archived && <Badge variant="secondary">{t('patient.archived')}</Badge>}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{[p.email, p.phone].filter(Boolean).join('  ·  ') || t('patient.noContact')}</p>
            <div className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-foreground">{t('patient.location')}</p>
                <p>{addressLine || t('patient.locationMissing')}</p>
              </div>
            </div>
          </div>
        </div>
        {/* Primary actions, stacked */}
        <div className="flex flex-col gap-2 sm:w-52">
          <Button onClick={() => setApptOpen(true)}><CalendarPlus className="mr-2 h-4 w-4" /> {t('patient.newAppointment')}</Button>
          <Button variant="outline" onClick={() => setPlanOpen(true)}><ClipboardList className="mr-2 h-4 w-4" /> {t('patient.treatmentPlan')}</Button>
        </div>
      </div>

      {/* Compact square-ish stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-sm"><CardContent className="p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <s.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            </div>
            <p className="mt-1.5 text-xl font-bold tabular-nums">{s.value}</p>
          </CardContent></Card>
        ))}
      </div>

      {/* Sticky notes */}
      <div className="mt-6">
        <PatientNotes patientId={id} initial={p.notes} />
      </div>

      {/* Upcoming appointments (from today) */}
      <Card className="mt-6 shadow-sm">
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-primary" /> {t('patient.upcoming')}</CardTitle></CardHeader>
        <CardContent>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('patient.noUpcoming')}</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.title || a.services?.name || t('patient.appointment')}</p>
                    <p className="text-xs text-muted-foreground">{a.appointment_date} · {fmtTime(a.start_time)}</p>
                  </div>
                  <Badge variant="secondary" className="capitalize">{t('cal.status.' + a.status)}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Treatment plans */}
      <Card className="mt-6 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="h-4 w-4 text-primary" /> {t('patient.plans')}</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setPlanOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> {t('patient.newPlan')}</Button>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('patient.noPlan')}</p>
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
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary">{plan.completed}/{plan.total} {t('patient.done')}</Badge>
                        <button onClick={() => setEditPlan(plan)} aria-label={t('patient.editPlan')} className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild><button aria-label={t('patient.deletePlan')} className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader><AlertDialogTitle>{t('patient.deletePlanTitle')}</AlertDialogTitle><AlertDialogDescription>{t('patient.deletePlanDescription')}</AlertDialogDescription></AlertDialogHeader>
                            <AlertDialogFooter><AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel><AlertDialogAction onClick={() => delPlanMut.mutate(plan.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction></AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    <Progress value={pct} className="mt-2.5" />
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>{t('patient.remaining', { count: plan.remaining })}</span>
                      {plan.nextDate && <span>{t('patient.nextDate', { date: plan.nextDate })}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Destructive actions at the very bottom, with confirmation */}
      <div className="mt-8 flex flex-col gap-2 border-t border-border pt-6 sm:flex-row sm:justify-end">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline"><Archive className="mr-2 h-4 w-4" /> {p.archived ? t('patient.unarchive') : t('patient.archive')}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{p.archived ? t('patient.unarchiveTitle') : t('patient.archiveTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{p.archived ? t('patient.unarchiveDescription') : t('patient.archiveDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => flagMut.mutate({ archived: !p.archived })}>{t('common.confirm')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> {t('patient.delete')}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('patient.deleteTitle')}</AlertDialogTitle>
              <AlertDialogDescription>{t('patient.deleteDescription')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={() => delMut.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {business?.id && <PatientFormDialog businessId={business.id} patient={p} open={editOpen} onOpenChange={setEditOpen} />}
      {business?.id && <TreatmentPlanDialog businessId={business.id} patientId={id} open={planOpen} onOpenChange={setPlanOpen} />}
      {business?.id && <AppointmentDialog businessId={business.id} defaultPatientId={id} open={apptOpen} onOpenChange={setApptOpen} />}
      {business?.id && <TreatmentPlanEditDialog businessId={business.id} plan={editPlan} patientId={id} open={!!editPlan} onOpenChange={(v) => { if (!v) setEditPlan(null) }} />}
    </div>
  )
}
