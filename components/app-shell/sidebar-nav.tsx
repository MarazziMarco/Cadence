'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { NAV_SECTIONS } from '@/lib/brand'
import { navKey } from '@/lib/i18n'
import { useT } from '@/lib/i18n/use-t'
import { ICON_MAP } from './icon-map'

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { t } = useT()
  return (
    <nav className="flex flex-col gap-6 px-3 py-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label}>
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            {t('nav.menu')}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = ICON_MAP[item.icon]
              const active = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                  )}
                >
                  {Icon && <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-sidebar-foreground/60 group-hover:text-primary')} />}
                  <span className="truncate">{navKey(item.href) ? t(navKey(item.href)!) : item.label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
