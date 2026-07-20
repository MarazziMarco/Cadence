'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, ListChecks, MoreHorizontal, Pencil, Trash2, Star, CalendarClock, ChevronsUp, Layers } from 'lucide-react'
import { listWaiting, deleteWaiting, advanceApptId, poolPlannedCounts } from '@/lib/api/waiting-list'
import { WEEKDAY_LABELS } from '@/lib/types/db'
import { useWorkspace } from '@/lib/workspace-context'
import { useT } from '@/lib/i18n/use-t'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { WaitingDialog } from './waiting-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const PRIORITY_STYLE: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive', normal: 'bg-primary/10 text-primary', low: 'bg-muted text-muted-foreground',
}

// notes may be plain text or a JSON envelope { pool, note, advance_for }.
function parsePlan(notes: unknown): { pool: any | null; note: string } {
  if (typeof notes !== 'string' || !notes) return { pool: null, note: '' }
  try {
    const j = JSON.parse(notes)
    if (j && typeof j === 'object') {
      return { pool: j.pool ?? null, note: typeof j.note === 'string' ? j.note : '' }
    }
  } catch { /* plain text */ }
  return { pool: null, note: notes }
}

export function WaitingListClient({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  const { business } = useWorkspace()
  const { t } = useT()
  const businessId = business?.id ?? ''
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<any>(null)

  const { data: entries = [], isLoading } = useQuery({ queryKey: ['waiting', businessId], queryFn: () => listWaiting(businessId), enabled: !!businessId })
  const { data: planned = {} } = useQuery({ queryKey: ['pool-planned', businessId], queryFn: () => poolPlannedCounts(businessId), enabled: !!businessId })
  const del = useMutation({ mutationFn: (id: string) => deleteWaiting(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['waiting'] }); toast.success(t('wait.removed')) } })

  function openNew() { setEditing(null); setOpen(true) }
  function openEdit(e: any) { setEditing(e); setOpen(true) }

  return (
    <div>
      {hideHeader ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{t('wait.subtitleShort')}</p>
          <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> {t('wait.add')}</Button>
        </div>
      ) : (
        <PageHeader title={t('wait.title')} description={t('wait.subtitle')}
          actions={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> {t('wait.add')}</Button>} />
      )}

      {isLoading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : entries.length === 0 ? (
        <EmptyState icon={ListChecks} title={t('wait.emptyTitle')} description={t('wait.emptyDesc')} action={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> {t('wait.add')}</Button>} />
      ) : (
        <div className="stagger-in space-y-3">
          {entries.map((e: any) => {
            const name = e.patients?.full_name || e.patients?.first_name || 'Client'
            const adv = advanceApptId(e)
            const { pool, note } = parsePlan(e.notes)
            return (
              <Card key={e.id} className="flex items-center justify-between p-4 shadow-sm">
                <div className="flex items-center gap-4">
                  <Avatar className="h-10 w-10"><AvatarFallback style={{ backgroundColor: (e.patients?.color || '#4f46e5') + '22', color: e.patients?.color || '#4f46e5' }} className="text-xs font-semibold">{(e.patients?.first_name?.[0] || '') + (e.patients?.last_name?.[0] || '')}</AvatarFallback></Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{name}</p>
                      {adv ? (
                        <Badge className="bg-primary/15 text-primary hover:bg-primary/15"><ChevronsUp className="mr-1 h-3 w-3" /> {t('wait.badge.advance')}</Badge>
                      ) : (
                        <Badge variant="secondary" className="font-normal">{t('wait.badge.new')}</Badge>
                      )}
                      {!adv && <Badge className={PRIORITY_STYLE[e.priority] + ' capitalize hover:' + PRIORITY_STYLE[e.priority]}>{e.priority === 'high' && <Star className="mr-1 h-3 w-3" />}{t('wait.priority.' + e.priority)}</Badge>}
                      {!adv && e.flexible && <Badge variant="secondary" className="font-normal">{t('wait.flexible')}</Badge>}
                      {!adv && pool && <Badge className="bg-primary/15 text-primary hover:bg-primary/15"><Layers className="mr-1 h-3 w-3" />{t('wait.plan.badge', { planned: planned[e.id] ?? 0, total: pool.sessions_total })}</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {e.services?.name && <span>{e.services.emoji ? e.services.emoji + ' ' : ''}{e.services.name}</span>}
                      {e.preferred_weekdays?.length > 0 && <span>{e.preferred_weekdays.map((d: any) => WEEKDAY_LABELS[d as keyof typeof WEEKDAY_LABELS]?.slice(0, 3)).join(', ')}</span>}
                      {(e.earliest_time || e.latest_time) && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" />{e.earliest_time?.slice(0, 5) || '—'}–{e.latest_time?.slice(0, 5) || '—'}</span>}
                      {pool && <span>{t('wait.plan.config', { week: pool.max_per_week || '∞', gap: pool.gap_hours })}</span>}
                      {adv ? <span className="italic">{t('wait.advanceNote')}</span> : (note && <span className="italic">“{note}”</span>)}
                    </div>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(e)}><Pencil className="mr-2 h-4 w-4" /> {t('common.edit')}</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => del.mutate(e.id)}><Trash2 className="mr-2 h-4 w-4" /> {t('common.remove')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Card>
            )
          })}
        </div>
      )}

      {businessId && <WaitingDialog businessId={businessId} entry={editing} open={open} onOpenChange={setOpen} />}
    </div>
  )
}
