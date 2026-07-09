'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { CalendarDays, Wand2, Bot, TrendingUp, Clock, Users, DollarSign, Activity, ArrowRight, Plus } from 'lucide-react'
import { getDashboard } from '@/lib/api/dashboard'
import { fmtTime } from '@/lib/api/appointments'
import { useWorkspace, formatMoney } from '@/lib/workspace-context'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { EmptyState } from '@/components/common/empty-state'
import { Skeleton } from '@/components/ui/skeleton'

function ApptRow({ a }: { a: any }) {
  const name = a.patients?.full_name || a.patients?.first_name || 'Client'
  const color = a.color || a.patients?.color || '#4f46e5'
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
      <div className="h-8 w-1 rounded" style={{ backgroundColor: color }} />
      <Avatar className="h-8 w-8"><AvatarFallback style={{ backgroundColor: color + '22', color }} className="text-[10px] font-semibold">{(a.patients?.first_name?.[0] || '') + (a.patients?.last_name?.[0] || '')}</AvatarFallback></Avatar>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{name}</p><p className="truncate text-xs text-muted-foreground">{a.title || a.services?.name || 'Appointment'}</p></div>
      <div className="text-right text-xs text-muted-foreground"><p className="font-medium text-foreground">{fmtTime(a.start_time)}</p><p>{a.appointment_date}</p></div>
    </div>
  )
}

export function DashboardClient({ name }: { name?: string }) {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  const { data, isLoading } = useQuery({ queryKey: ['dashboard', businessId], queryFn: () => getDashboard(businessId), enabled: !!businessId })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  const kpis = useMemo(() => [
    { label: "Today's appointments", value: data ? String(data.todayCount) : '—', icon: CalendarDays },
    { label: 'Occupancy', value: data ? `${data.occupancy}%` : '—', icon: TrendingUp },
    { label: 'Idle time today', value: data ? `${Math.floor(data.idleMin / 60)}h ${data.idleMin % 60}m` : '—', icon: Clock },
    { label: 'Revenue (7d)', value: data ? formatMoney(data.revenue7, business?.currency) : '—', icon: DollarSign },
  ], [data, business])

  return (
    <div>
      <PageHeader title={`${greeting}${name ? ', ' + name.split(' ')[0] : ''}`} description="Here's what's happening across your schedule today."
        actions={<Link href="/scheduler"><Button><Wand2 className="mr-2 h-4 w-4" /> Optimize</Button></Link>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.05 }}>
            <Card className="shadow-sm"><CardContent className="flex items-center justify-between p-5">
              <div><p className="text-sm text-muted-foreground">{k.label}</p>{isLoading ? <Skeleton className="mt-2 h-7 w-16" /> : <p className="mt-1 text-2xl font-bold tracking-tight">{k.value}</p>}</div>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><k.icon className="h-5 w-5" /></div>
            </CardContent></Card>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Today&apos;s schedule</CardTitle><Link href="/calendar"><Button variant="ghost" size="sm">Calendar <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></Link></CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? [...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)
              : (data?.todays.length ?? 0) === 0 ? <EmptyState icon={CalendarDays} title="No appointments today" description="Enjoy the quiet — or book something from the calendar." className="border-0" />
              : data!.todays.map((a: any) => <ApptRow key={a.id} a={a} />)}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Quick actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {[{ href: '/calendar', label: 'Open calendar', icon: CalendarDays }, { href: '/ai-assistant', label: 'Ask the AI', icon: Bot }, { href: '/scheduler', label: 'Optimize schedule', icon: Wand2 }, { href: '/patients', label: 'Add a client', icon: Plus }].map((a) => (
              <Link key={a.href} href={a.href} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"><a.icon className="h-4 w-4 text-primary" /> {a.label}</Link>
            ))}
            <div className="!mt-4 rounded-lg bg-accent/50 p-3 text-center"><p className="text-2xl font-bold">{isLoading ? '—' : data?.waitingCount}</p><p className="text-xs text-muted-foreground">on the waiting list</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm"><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Upcoming</CardTitle></CardHeader>
          <CardContent className="space-y-2">{isLoading ? [...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />) : (data?.upcoming.length ?? 0) === 0 ? <EmptyState icon={CalendarDays} title="Nothing upcoming" className="border-0" /> : data!.upcoming.map((a: any) => <ApptRow key={a.id} a={a} />)}</CardContent>
        </Card>
        <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
          <CardContent className="space-y-2">{isLoading ? [...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />) : (data?.recent.length ?? 0) === 0 ? <EmptyState icon={Activity} title="Nothing yet" className="border-0" /> : data!.recent.map((a: any) => <ApptRow key={a.id} a={a} />)}</CardContent>
        </Card>
      </div>
    </div>
  )
}
