'use client'

import { useEffect, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SidebarNav } from './sidebar-nav'
import { BottomNav, type QuickKind } from './bottom-nav'
import { UserMenu } from './user-menu'
import { ThemeToggle } from './theme-toggle'
import { NAV_SECTIONS } from '@/lib/brand'
import { navKey, normalizeLocale, translate } from '@/lib/i18n'
import { WorkspaceProvider, type WorkspaceBusiness } from '@/lib/workspace-context'
import { speechLang, useSpeech } from '@/lib/voice/use-speech'
import type { AppointmentEditorPresentation } from '@/components/calendar/appointment-dialog'

const AppointmentDialog = dynamic(
  () => import('@/components/calendar/appointment-dialog')
    .then((module) => module.AppointmentDialog),
  { ssr: false },
)
const PatientFormDialog = dynamic(
  () => import('@/components/patients/patient-form-dialog')
    .then((module) => module.PatientFormDialog),
  { ssr: false },
)
const VoiceAppointment = dynamic(
  () => import('@/components/ai/voice-appointment')
    .then((module) => module.VoiceAppointment),
  { ssr: false },
)

// Returns the matched nav href for the current path (null = no match).
function useTitleHref(): string | null {
  const pathname = usePathname()
  for (const s of NAV_SECTIONS) {
    for (const i of s.items) {
      if (pathname === i.href || pathname.startsWith(i.href + '/')) return i.href
    }
  }
  return null
}

export function AppShell({ user, business, children }: { user: { email: string; name?: string }; business: WorkspaceBusiness | null; children: ReactNode }) {
  const pathname = usePathname()
  const businessId = business?.id ?? ''
  // Title is translated directly from the business prop (useTitle runs outside
  // the WorkspaceProvider below, so it can't use the useT hook).
  const locale = normalizeLocale(business?.language)
  const titleHref = useTitleHref()
  const nk = titleHref ? navKey(titleHref) : null
  const title = nk ? translate(locale, nk) : 'Cadence'

  // Quick-create flows triggered from the bottom nav. Voice starts listening
  // immediately and mounts its dialog only after transcription (or as fallback).
  const [quick, setQuick] = useState<QuickKind | null>(null)
  const [quickKey, setQuickKey] = useState(0)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const {
    supported: voiceSupported,
    listening: voiceListening,
    start: startVoice,
    stop: stopVoice,
  } = useSpeech(speechLang(business?.language))
  const [appointmentPresentation, setAppointmentPresentation] =
    useState<AppointmentEditorPresentation>('dialog')
  const openQuick = (kind: QuickKind) => {
    if (kind === 'voice') {
      if (voiceListening) {
        stopVoice()
        return
      }

      setVoiceTranscript('')
      if (!voiceSupported) {
        setQuickKey((k) => k + 1)
        setQuick('voice')
        return
      }

      startVoice(
        (transcript) => {
          setVoiceTranscript(transcript)
          setQuickKey((k) => k + 1)
          setQuick('voice')
        },
        () => {
          setQuickKey((k) => k + 1)
          setQuick('voice')
        },
      )
      return
    }

    setQuickKey((k) => k + 1)
    if (kind === 'appointment') {
      setAppointmentPresentation(
        window.matchMedia('(min-width: 1024px)').matches ? 'dialog' : 'drawer',
      )
    }
    setQuick(kind)
  }

  // Clear any leftover Radix pointer-events lock on navigation, so the app never
  // becomes unclickable after a modal/sheet closes while the route changes.
  useEffect(() => { document.body.style.pointerEvents = '' }, [pathname])

  return (
    <WorkspaceProvider business={business}>
      <div className="flex h-[100dvh] overflow-hidden bg-muted/30">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
          <div className="flex h-16 items-center border-b border-sidebar-border px-5">
            <Link href="/dashboard"><Logo /></Link>
          </div>
          <ScrollArea className="flex-1"><SidebarNav /></ScrollArea>
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur sm:h-16 sm:px-6">
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="lg:hidden"><Logo /></Link>
              {/* Page name is shown by the in-page header below, so hide it here on mobile. */}
              <h1 className="hidden text-lg font-semibold tracking-tight sm:block">{title}</h1>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="hidden sm:inline-flex"><ThemeToggle label={translate(locale, 'account.toggleTheme')} /></span>
              <UserMenu email={user.email} name={user.name} />
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">
            <div key={pathname} className="mx-auto w-full max-w-7xl animate-fade-up p-4 pb-32 sm:p-6 sm:pb-32 lg:p-8 lg:pb-8">
              {children}
            </div>
          </main>
        </div>

        {/* Soft blur behind/around the floating bottom nav so page content peeking
            below it isn't distracting (mobile only). Sits under the nav (z-40). */}
        <div aria-hidden className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-24 backdrop-blur-md [mask-image:linear-gradient(to_top,black_40%,transparent)] lg:hidden" />

        {/* Native mobile bottom navigation (hidden on desktop) */}
        <BottomNav
          onQuickCreate={openQuick}
          voiceListening={voiceListening}
        />
      </div>

      {/* Quick-create dialogs, including the post-transcription voice confirmation. */}
      {businessId && quick === 'appointment' ? (
        <AppointmentDialog
          key={`appt-${quickKey}`}
          businessId={businessId}
          open
          presentation={appointmentPresentation}
          onOpenChange={(open) => { if (!open) setQuick(null) }}
        />
      ) : null}
      {businessId && quick === 'client' ? (
        <PatientFormDialog
          key={`client-${quickKey}`}
          businessId={businessId}
          open
          onOpenChange={(open) => { if (!open) setQuick(null) }}
        />
      ) : null}
      {businessId && quick === 'voice' ? (
        <Dialog open onOpenChange={(open) => { if (!open) setQuick(null) }}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>{translate(locale, 'create.byVoice')}</DialogTitle></DialogHeader>
              <VoiceAppointment
                key={`voice-${quickKey}`}
                initialTranscript={voiceTranscript || undefined}
              />
            </DialogContent>
        </Dialog>
      ) : null}
    </WorkspaceProvider>
  )
}
