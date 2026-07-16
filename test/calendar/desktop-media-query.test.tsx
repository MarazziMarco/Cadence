import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import * as calendarController from '@/components/calendar/calendar-controller'

vi.mock('@/components/calendar/desktop-week-calendar', () => ({
  DesktopWeekCalendar: () => null,
}))

vi.mock('@/components/calendar/appointment-dialog', () => ({
  AppointmentDialog: () => null,
}))

vi.mock('@/components/calendar/appointment-quick-sheet', () => ({
  AppointmentQuickSheet: () => null,
}))

vi.mock('@/components/calendar/move-appointment-sheet', () => ({
  MoveAppointmentSheet: () => null,
}))

vi.mock('@/components/calendar/contextual-optimize-dialog', () => ({
  ContextualOptimizeDialog: () => null,
}))

vi.mock('@/components/waiting-list/waiting-list-client', () => ({
  WaitingListClient: () => null,
}))

vi.mock('@/components/ui/button', () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

type DesktopMediaQueryHook = () => boolean

function getDesktopMediaQueryHook() {
  return (
    calendarController as typeof calendarController & {
      useDesktopMediaQuery?: DesktopMediaQueryHook
    }
  ).useDesktopMediaQuery
}

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  let listener: ((event: MediaQueryListEvent) => void) | null = null
  const addEventListener = vi.fn(
    (_type: 'change', nextListener: (event: MediaQueryListEvent) => void) => {
      listener = nextListener
    },
  )
  const removeEventListener = vi.fn(
    (_type: 'change', nextListener: (event: MediaQueryListEvent) => void) => {
      if (listener === nextListener) listener = null
    },
  )

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      get matches() {
        return matches
      },
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener,
      removeEventListener,
      dispatchEvent: vi.fn(),
    })),
  })

  return {
    addEventListener,
    removeEventListener,
    setMatches(nextMatches: boolean) {
      matches = nextMatches
      listener?.({ matches: nextMatches } as MediaQueryListEvent)
    },
  }
}

describe('useDesktopMediaQuery', () => {
  it('is exposed for renderer-selection behavior tests', () => {
    expect(getDesktopMediaQueryHook()).toBeTypeOf('function')
  })

  it('starts mobile on the first client render, then follows media changes', async () => {
    const media = installMatchMedia(true)
    const useDesktopMediaQuery = getDesktopMediaQueryHook()
    expect(useDesktopMediaQuery).toBeTypeOf('function')
    if (!useDesktopMediaQuery) return

    const renderValues: boolean[] = []
    const { result, unmount } = renderHook(() => {
      const isDesktop = useDesktopMediaQuery()
      renderValues.push(isDesktop)
      return isDesktop
    })

    expect(renderValues[0]).toBe(false)
    await waitFor(() => expect(result.current).toBe(true))

    act(() => media.setMatches(false))
    expect(result.current).toBe(false)
    expect(media.addEventListener).toHaveBeenCalledTimes(1)

    unmount()
    expect(media.removeEventListener).toHaveBeenCalledTimes(1)
  })
})
