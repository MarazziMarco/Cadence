import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppShell } from '@/components/app-shell/app-shell'

const speech = vi.hoisted(() => ({
  supported: true,
  listening: false,
  onResult: (_text: string) => {},
  onDenied: () => {},
  start: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/calendar',
}))

vi.mock('next/dynamic', () => ({
  default: () => (props: { initialTranscript?: string }) => (
    <div data-testid="voice-confirmation">{props.initialTranscript}</div>
  ),
}))

vi.mock('@/lib/voice/use-speech', () => ({
  speechLang: () => 'en-US',
  useSpeech: () => ({
    supported: speech.supported,
    listening: speech.listening,
    start: speech.start,
    stop: speech.stop,
  }),
}))

vi.mock('@/components/app-shell/bottom-nav', () => ({
  BottomNav: ({ onQuickCreate }: { onQuickCreate: (kind: string) => void }) => (
    <button type="button" onClick={() => onQuickCreate('voice')}>Direct voice</button>
  ),
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div data-testid="voice-dialog">{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/brand/logo', () => ({ Logo: () => <div>Cadence</div> }))
vi.mock('@/components/app-shell/sidebar-nav', () => ({ SidebarNav: () => null }))
vi.mock('@/components/app-shell/user-menu', () => ({ UserMenu: () => null }))
vi.mock('@/components/app-shell/theme-toggle', () => ({ ThemeToggle: () => null }))
vi.mock('@/lib/workspace-context', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('AppShell direct mobile voice capture', () => {
  beforeEach(() => {
    speech.supported = true
    speech.listening = false
    speech.onResult = () => {}
    speech.onDenied = () => {}
    speech.start.mockReset()
    speech.stop.mockReset()
    speech.start.mockImplementation((onResult, onDenied) => {
      speech.onResult = onResult
      speech.onDenied = onDenied
    })
  })

  it('starts listening without a dialog and opens confirmation after transcription', () => {
    render(
      <AppShell
        user={{ email: 'marco@example.com' }}
        business={{ id: 'business-1', language: 'en' } as any}
      >
        <div>Calendar</div>
      </AppShell>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Direct voice' }))

    expect(speech.start).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('voice-dialog')).not.toBeInTheDocument()

    act(() => speech.onResult('Marco tomorrow at 3pm physiotherapy'))

    expect(screen.getByTestId('voice-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('voice-confirmation')).toHaveTextContent(
      'Marco tomorrow at 3pm physiotherapy',
    )
  })

  it('opens the existing dialog as a manual fallback when speech is unavailable', () => {
    speech.supported = false

    render(
      <AppShell
        user={{ email: 'marco@example.com' }}
        business={{ id: 'business-1', language: 'en' } as any}
      >
        <div>Calendar</div>
      </AppShell>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Direct voice' }))

    expect(speech.start).not.toHaveBeenCalled()
    expect(screen.getByTestId('voice-dialog')).toBeInTheDocument()
  })
})
