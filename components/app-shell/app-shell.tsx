'use client'

import { type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SidebarNav } from './sidebar-nav'
import { BottomNav } from './bottom-nav'
import { UserMenu } from './user-menu'
import { ThemeToggle } from './theme-toggle'
import { NAV_SECTIONS } from '@/lib/brand'
import { WorkspaceProvider, type WorkspaceBusiness } from '@/lib/workspace-context'

function useTitle() {
  const pathname = usePathname()
  for (const s of NAV_SECTIONS) {
    for (const i of s.items) {
      if (pathname === i.href || pathname.startsWith(i.href + '/')) return i.label
    }
  }
  return 'Cadence'
}

export function AppShell({ user, business, children }: { user: { email: string; name?: string }; business: WorkspaceBusiness | null; children: ReactNode }) {
  const title = useTitle()

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b border-sidebar-border px-5">
          <Link href="/dashboard"><Logo /></Link>
        </div>
        <ScrollArea className="flex-1"><SidebarNav /></ScrollArea>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="lg:hidden"><Logo /></Link>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="hidden gap-2 text-muted-foreground sm:flex">
              <Search className="h-3.5 w-3.5" /> Quick find
              <kbd className="ml-1 rounded border border-border bg-muted px-1.5 text-[10px] font-medium">⌘K</kbd>
            </Button>
            <ThemeToggle />
            <UserMenu email={user.email} name={user.name} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-8">
            <WorkspaceProvider business={business}>{children}</WorkspaceProvider>
          </div>
        </main>
      </div>

      {/* Native mobile bottom navigation (hidden on desktop) */}
      <BottomNav />
    </div>
  )
}
