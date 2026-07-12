'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Search, Star, MoreHorizontal, Archive, Trash2, Pencil, Users, ArchiveRestore, X, SlidersHorizontal, ArrowUp, ArrowDown, ArrowUpDown, Check } from 'lucide-react'
import { listPatients, softDeletePatient, setPatientFlag, type PatientFilter } from '@/lib/api/patients'
import type { Patient } from '@/lib/types/db'
import { useWorkspace } from '@/lib/workspace-context'
import { ClientsServicesTabs } from '@/components/common/clients-services-tabs'
import { EmptyState } from '@/components/common/empty-state'
import { PatientFormDialog } from './patient-form-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Colors available when creating a client (mirror patient-form-dialog).
const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']
const STATUS: { key: PatientFilter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'vip', label: 'VIP' }, { key: 'archived', label: 'Archived' },
]
type Sort = 'default' | 'asc' | 'desc'

export function PatientsClient() {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [filter, setFilter] = useState<PatientFilter>('all')
  const [colorFilter, setColorFilter] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('default')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Patient | null>(null)

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ['patients', businessId, search, filter],
    queryFn: () => listPatients(businessId, search, filter),
    enabled: !!businessId,
  })

  // Color filter + sort are applied client-side over the fetched list.
  const displayed = useMemo(() => {
    let list = colorFilter ? patients.filter((p) => (p.color || '#4f46e5') === colorFilter) : patients
    if (sort !== 'default') {
      list = [...list].sort((a, b) => {
        const an = (a.full_name || a.first_name || '').toLowerCase()
        const bn = (b.full_name || b.first_name || '').toLowerCase()
        return sort === 'asc' ? an.localeCompare(bn) : bn.localeCompare(an)
      })
    }
    return list
  }, [patients, colorFilter, sort])

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
  function cycleSort() { setSort((s) => (s === 'default' ? 'asc' : s === 'asc' ? 'desc' : 'default')) }
  const filtersActive = filter !== 'all' || !!colorFilter

  return (
    <div>
      <ClientsServicesTabs current="clients" action={<Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> New client</Button>} />

      <div className="mb-4 flex items-center justify-between gap-2">
        {/* Search: a lens icon that expands into a full search bar */}
        {searchOpen ? (
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus className="pl-9 pr-9" placeholder="Search clients..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button aria-label="Close search" onClick={() => { setSearch(''); setSearchOpen(false) }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <Button variant="outline" size="icon" aria-label="Search" onClick={() => setSearchOpen(true)}><Search className="h-4 w-4" /></Button>
        )}

        {/* Filters: status + color, in one expandable menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" /> Filters
              {filtersActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {STATUS.map((s) => (
              <DropdownMenuItem key={s.key} onClick={() => setFilter(s.key)}>
                <span className="flex-1">{s.label}</span>{filter === s.key && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Color</DropdownMenuLabel>
            <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
              <button onClick={() => setColorFilter(null)} className={cn('flex h-6 items-center rounded-md border px-2 text-xs', !colorFilter ? 'border-primary text-primary' : 'border-border text-muted-foreground')}>Any</button>
              {COLORS.map((c) => (
                <button key={c} onClick={() => setColorFilter(c)} aria-label={c} className={cn('h-6 w-6 rounded-full border-2', colorFilter === c ? 'border-foreground' : 'border-transparent')} style={{ backgroundColor: c }} />
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="space-y-2 p-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : displayed.length === 0 ? (
          <EmptyState icon={Users} title={search || colorFilter ? 'No matches' : 'No clients yet'} description={search || colorFilter ? 'Try a different search or filter.' : 'Add your first client to start scheduling.'} action={!search && !colorFilter ? <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> New client</Button> : undefined} className="border-0" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button onClick={cycleSort} className="flex items-center gap-1 font-medium transition-colors hover:text-foreground">
                    Name {sort === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : sort === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />}
                  </button>
                </TableHead>
                <TableHead className="hidden md:table-cell">Contact</TableHead>
                <TableHead className="text-center">Appts</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayed.map((p) => (
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
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{p.phone || p.email || '—'}</TableCell>
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
