'use client'

import { motion } from 'framer-motion'
import { CalendarDays, Wand2, Bot, TrendingUp, Clock, Users, DollarSign, Activity, ArrowRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/common/empty-state'

const kpis = [
  { label: "Today's appointments", value: '—', icon: CalendarDays, hint: 'Connect your calendar' },
  { label: 'Occupancy', value: '—', icon: TrendingUp, hint: 'Awaiting data' },
  { label: 'Idle time', value: '—', icon: Clock, hint: 'Awaiting data' },
  { label: 'Revenue (7d)', value: '—', icon: DollarSign, hint: 'Awaiting data' },
]

const quickActions = [
  { href: '/calendar', label: 'Open calendar', icon: CalendarDays },
  { href: '/ai-assistant', label: 'Ask the AI', icon: Bot },
  { href: '/scheduler', label: 'Optimize schedule', icon: Wand2 },
  { href: '/patients', label: 'Add a client', icon: Plus },
]

export function DashboardClient({ name }: { name?: string }) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return (
    <div>
      <PageHeader
        title={`${greeting}${name ? ', ' + name.split(' ')[0] : ''}`}
        description="Here's what's happening across your schedule today."
        actions={<Link href="/scheduler"><Button><Wand2 className="mr-2 h-4 w-4" /> Optimize</Button></Link>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.05 }}>
            <Card className="shadow-sm">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{k.label}</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight">{k.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">{k.hint}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <k.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Today&apos;s schedule</CardTitle>
            <Link href="/calendar"><Button variant="ghost" size="sm">View calendar <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button></Link>
          </CardHeader>
          <CardContent>
            <EmptyState icon={CalendarDays} title="No appointments yet" description="Once your workspace is set up, today's appointments will appear here in a clean timeline." />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Quick actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {quickActions.map((a) => (
              <Link key={a.href} href={a.href} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
                <a.icon className="h-4 w-4 text-primary" /> {a.label}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
          <CardContent><EmptyState icon={Activity} title="Nothing here yet" description="Your latest changes and optimizations will show up in this feed." /></CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader><CardTitle className="text-base">Waiting list</CardTitle></CardHeader>
          <CardContent><EmptyState icon={Users} title="Waiting list is empty" description="Clients waiting for an earlier slot will appear here, ready to be auto-placed." /></CardContent>
        </Card>
      </div>
    </div>
  )
}
