import Link from 'next/link'
import { Clock, BarChart3, FileText, FlaskConical, ChevronRight, Coins, History } from 'lucide-react'
import { PageHeader } from '@/components/common/page-header'
import { Card } from '@/components/ui/card'

const LINKS = [
  { href: '/settings/preferences', label: 'Preferences', desc: 'Currency and general business preferences', icon: Coins },
  { href: '/history', label: 'Optimization History', desc: 'Past optimizations, minutes recovered, undo last run', icon: History },
  { href: '/working-hours', label: 'Working Hours', desc: 'Weekly availability, appointment defaults, lunch break, holidays', icon: Clock },
  { href: '/analytics', label: 'Analytics', desc: 'Occupancy, revenue and optimization impact', icon: BarChart3 },
  { href: '/templates', label: 'Templates', desc: 'Reusable reminders and messages', icon: FileText },
  { href: '/lab', label: 'Experimental Lab', desc: 'Preview features behind feature flags', icon: FlaskConical },
]

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" description="Business configuration and advanced tools — everything that isn't part of your daily flow." />
      <div className="grid gap-4 sm:grid-cols-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="flex items-center justify-between p-5 shadow-sm transition-colors hover:bg-accent">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><l.icon className="h-5 w-5" /></div>
                <div><p className="font-semibold">{l.label}</p><p className="text-sm text-muted-foreground">{l.desc}</p></div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
