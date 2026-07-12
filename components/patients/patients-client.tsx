'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Search, Star, MoreHorizontal, Archive, Trash2, Pencil, Users, ArchiveRestore } from 'lucide-react'
import { listPatients, softDeletePatient, setPatientFlag, type PatientFilter } from '@/lib/api/patients'
import type { Patient } from '@/lib/types/db'
import { useWorkspace } from '@/lib/workspace-context'
import { PageHeader } from '@/components/common/page-header'
import { ClientsServicesTabs } from '@/components/common/clients-services-tabs'
import { EmptyState } from '@/components/common/empty-state'
import { PatientFormDialog } from './patient-form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function PatientsClient() {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<PatientFilter>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Patient | null>(null)

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['patients', businessId, search, filter],
    queryFn: () => listPatients(businessId, search, filter),
    enabled: !!businessId,
  })

  const flagMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => setPatientFlag(id, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['patients'] }); toast.success('Updated') },
    onError: (e: any) => toast.error(e.message),
  })
  const delMut = useMutation({
    mutationFn: (id: string) => softDeletePatient(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['patients'] }); toast.success('Client deleted') },
    onError: (e: any) => toast.error(e.message),
  })

  function openNew() { setEditing(null); setDialogOpen(true) }
  function openEdit(p: Patient) { setEditing(p); setDialogOpen(true) }

  return (
    <div>
      <ClientsServicesTabs current="clients" action={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> New client</Button>} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search clients..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as PatientFilter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="vip">VIP</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : patients.length === 0 ? (
          <EmptyState icon={Users} title={search ? 'No matches' : 'No clients yet'} description={search ? 'Try a different search.' : 'Add your first client to start scheduling.'} action={!search ? <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> New client</Button> : undefined} className="border-0" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead className="hidden lg:table-cell">Tags</TableHead>
                <TableHead className="text-center">Appts</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patients.map((p) => (
                <TableRow key={p.id} className="group">
                  <TableCell>
                    <Link href={`/patients/${p.id}`} className="flex items-center gap-3">
                      <Avatar className="h-9 w-9"><AvatarFallback style={{ backgroundColor: (p.color || '#4f46e5') + '22', color: p.color || '#4f46e5' }} className="text-xs font-semibold">{(p.first_name?.[0] || '') + (p.last_name?.[0] || '')}</AvatarFallback></Avatar>
                      <div>
                        <div className="flex items-center gap-1.5 font-medium group-hover:text-primary">
                          {p.full_name || p.first_name}
                          {p.is_vip && <Star className="h-3.5 w-3.5 fill-warning text-warning" />}
                        </div>
                        <div className="text-xs text-muted-foreground md:hidden">{p.phone || p.email || '—'}</div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{p.phone || p.email || '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">{(p.tags ?? []).slice(0, 3).map((t) => <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>)}</div>
                  </TableCell>
                  <TableCell className="text-center text-sm tabular-nums">{p.total_appointments ?? 0}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(p)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => flagMut.mutate({ id: p.id, patch: { is_vip: !p.is_vip } })}><Star className="mr-2 h-4 w-4" /> {p.is_vip ? 'Remove VIP' : 'Mark VIP'}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => flagMut.mutate({ id: p.id, patch: { archived: !p.archived } })}>{p.archived ? <ArchiveRestore className="mr-2 h-4 w-4" /> : <Archive className="mr-2 h-4 w-4" />} {p.archived ? 'Unarchive' : 'Archive'}</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => delMut.mutate(p.id)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {businessId && <PatientFormDialog businessId={businessId} patient={editing} open={dialogOpen} onOpenChange={setDialogOpen} />}
    </div>
  )
}
