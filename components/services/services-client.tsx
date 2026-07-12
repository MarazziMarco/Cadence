'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Clock, MoreHorizontal, Pencil, Trash2, Sparkles, Bot } from 'lucide-react'
import { listServices, softDeleteService, toggleServiceActive } from '@/lib/api/services'
import type { Service } from '@/lib/types/db'
import { useWorkspace, formatMoney } from '@/lib/workspace-context'
import { PageHeader } from '@/components/common/page-header'
import { ClientsServicesTabs } from '@/components/common/clients-services-tabs'
import { EmptyState } from '@/components/common/empty-state'
import { ServiceFormDialog } from './service-form-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export function ServicesClient() {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['services', businessId],
    queryFn: () => listServices(businessId),
    enabled: !!businessId,
  })

  const delMut = useMutation({ mutationFn: (id: string) => softDeleteService(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['services'] }); toast.success('Service deleted') }, onError: (e: any) => toast.error(e.message) })
  const toggleMut = useMutation({ mutationFn: ({ id, v }: { id: string; v: boolean }) => toggleServiceActive(id, v), onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }) })

  const groups = services.reduce<Record<string, Service[]>>((acc, s) => {
    const cat = ((s as any).metadata?.category as string) || 'General'
    ;(acc[cat] = acc[cat] || []).push(s)
    return acc
  }, {})

  function openNew() { setEditing(null); setDialogOpen(true) }
  function openEdit(s: Service) { setEditing(s); setDialogOpen(true) }

  return (
    <div>
      <ClientsServicesTabs current="services" action={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> New service</Button>} />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-36 w-full" />)}</div>
      ) : services.length === 0 ? (
        <EmptyState icon={Sparkles} title="No services yet" description="Create your first service to define durations, prices and buffers." action={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> New service</Button>} />
      ) : (
        <div className="space-y-8">
          {Object.entries(groups).map(([cat, items]) => (
            <div key={cat}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{cat}</h3>
              <div className="stagger-in grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((s) => (
                  <Card key={s.id} className="group relative overflow-hidden p-5 shadow-sm hover-lift">
                    <div className="absolute left-0 top-0 h-full w-1" style={{ backgroundColor: s.color || '#4f46e5' }} />
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl text-lg" style={{ backgroundColor: (s.color || '#4f46e5') + '1a' }}>{s.emoji || '✨'}</div>
                        <div>
                          <p className="font-semibold leading-tight">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.duration_minutes} min · {formatMoney(s.price, business?.currency)}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(s)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => delMut.mutate(s.id)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {s.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{s.description}</p>}
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {(s.buffer_before_minutes > 0 || s.buffer_after_minutes > 0) && <Badge variant="secondary" className="gap-1 font-normal"><Clock className="h-3 w-3" /> +{s.buffer_before_minutes + s.buffer_after_minutes}m buffer</Badge>}
                        {s.allow_ai_scheduling && <Badge variant="secondary" className="gap-1 font-normal"><Bot className="h-3 w-3" /> AI</Badge>}
                      </div>
                      <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{s.is_active ? 'Active' : 'Inactive'}</span><Switch checked={s.is_active} onCheckedChange={(v) => toggleMut.mutate({ id: s.id, v })} /></div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {businessId && <ServiceFormDialog businessId={businessId} service={editing} open={dialogOpen} onOpenChange={setDialogOpen} />}
    </div>
  )
}
