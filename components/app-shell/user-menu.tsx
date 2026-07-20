'use client'

import { LogOut, Settings, Sun, Moon } from 'lucide-react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/use-t'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function UserMenu({ email, name }: { email: string; name?: string }) {
  const supabase = createClient()
  const { theme, setTheme } = useTheme()
  const { t } = useT()
  const initials = (name || email || '?').trim().slice(0, 2).toUpperCase()
  const dark = theme === 'dark'

  async function logout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        <Avatar className="h-9 w-9 border border-border">
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{name || t('account.yourAccount')}</span>
            <span className="text-xs font-normal text-muted-foreground">{email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <Link href="/settings"><DropdownMenuItem className="cursor-pointer py-2.5 text-sm"><Settings className="mr-2 h-4 w-4" /> {t('nav.settings')}</DropdownMenuItem></Link>
        {/* Theme lives here so the header stays uncluttered on mobile. */}
        <DropdownMenuItem className="cursor-pointer py-2.5 text-sm" onClick={() => setTheme(dark ? 'light' : 'dark')}>
          {dark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />} {dark ? t('account.lightMode') : t('account.darkMode')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="cursor-pointer py-2.5 text-sm text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> {t('account.logOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
