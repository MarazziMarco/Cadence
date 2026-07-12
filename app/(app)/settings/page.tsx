'use client'

import Link from 'next/link'
import { Clock, BarChart3, FileText, FlaskConical, ChevronRight, Coins, History } from 'lucide-react'
import { PageHeader } from '@/components/common/page-header'
import { Card } from '@/components/ui/card'
import { useT } from '@/lib/i18n/use-t'

const LINKS = [
  { href: '/settings/preferences', labelKey: 'nav.preferences', descKey: 'settings.preferences.desc', icon: Coins },
  { href: '/history', labelKey: 'nav.history', descKey: 'settings.history.desc', icon: History },
  { href: '/working-hours', labelKey: 'nav.workingHours', descKey: 'settings.workingHours.desc', icon: Clock },
  { href: '/analytics', labelKey: 'nav.analytics', descKey: 'settings.analytics.desc', icon: BarChart3 },
  { href: '/templates', labelKey: 'nav.templates', descKey: 'settings.templates.desc', icon: FileText },
  { href: '/lab', labelKey: 'nav.lab', descKey: 'settings.lab.desc', icon: FlaskConical },
]

export default function SettingsPage() {
  const { t } = useT()
  return (
    <div>
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />
      <div className="grid gap-4 sm:grid-cols-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="flex items-center justify-between p-5 shadow-sm transition-colors hover:bg-accent">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground"><l.icon className="h-5 w-5" /></div>
                <div><p className="font-semibold">{t(l.labelKey)}</p><p className="text-sm text-muted-foreground">{t(l.descKey)}</p></div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
