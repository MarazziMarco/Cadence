import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CalendarController,
  createInitialCalendarState,
} from '@/components/calendar/calendar-controller'
import { listAppointments, type CalendarAppointment } from '@/lib/api/appointments'
import { getCalendarConfig, type CalendarConfig } from '@/lib/api/calendar'
import { calendarKeys } from '@/lib/calendar/query-keys'
import {
  WorkspaceProvider,
  type WorkspaceBusiness,
} from '@/lib/workspace-context'

const optimizerRuns = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api/appointments', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/appointments')>()
  return { ...original, listAppointments: vi.fn(), updateAppointment: vi.fn() }
})

vi.mock('@/lib/api/calendar', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/calendar')>()
  return { ...original, getCalendarConfig: vi.fn() }
})

vi.mock('@/components/calendar/desktop-week-calendar', () => ({
  DesktopWeekCalendar: (props: {
    appointments: CalendarAppointment[]
    selectedDate: string
    density: number
    view: string
    onSelectAppointment(id: string): void
    onCreateAt(date: string, startMinute: number): void
  }) => (
    <div
      data-testid="calendar-renderer"
      data-date={props.selectedDate}
      data-density={props.density}
      data-view={props.view}
    >
      <span>{props.appointments.length} appointments</span>
      <button onClick={() => props.onSelectAppointment('appointment-1')}>
        Select appointment
      </button>
      <button onClick={() => props.onCreateAt(props.selectedDate, 600)}>
        Create at 10
      </button>
    </div>
  ),
}))

vi.mock('@/components/calendar/mobile-day-calendar', () => ({
  MobileDayCalendar: (props: {
    appointments: CalendarAppointment[]
    selectedDate: string
    density: number
    isLoading?: boolean
    onSelectDate(date: string): void
    onSelectAppointment(id: string): void
    onCreateAt(date: string, startMinute: number): void
    onOptimize?(): void
    optimizeButtonRef?: React.Ref<HTMLButtonElement>
  }) => (
    <div
      data-testid="calendar-renderer"
      data-date={props.selectedDate}
      data-density={props.density}
      data-view="day"
      data-loading={props.isLoading}
    >
      <span>{props.appointments.length} appointments</span>
      <button onClick={() => props.onSelectAppointment('appointment-1')}>
        Select appointment
      </button>
      <button onClick={() => props.onCreateAt(props.selectedDate, 600)}>
        Create at 10
      </button>
      <button onClick={() => props.onSelectDate('2026-07-18')}>
        Next mobile date
      </button>
      <button ref={props.optimizeButtonRef} onClick={props.onOptimize}>
        Open mobile optimizer
      </button>
    </div>
  ),
}))

vi.mock('@/components/calendar/appointment-dialog', () => ({
  AppointmentDialog: (props: {
    open: boolean
    appt?: CalendarAppointment | null
    defaultDate?: string
    defaultStart?: string
  }) => props.open ? (
    <div data-testid="appointment-dialog">
      {props.appt?.id ?? `${props.defaultDate}-${props.defaultStart}`}
    </div>
  ) : null,
}))

vi.mock('@/components/calendar/optimize-dialog', async () => {
  const React = await import('react')
  return {
    OptimizeDialog: (props: {
      dateFrom: string
      dateTo: string
      open?: boolean
      onOpenChange?(open: boolean): void
    }) => {
      const wasOpen = React.useRef(false)
      React.useEffect(() => {
        if (props.open && !wasOpen.current) optimizerRuns()
        wasOpen.current = Boolean(props.open)
      }, [props.open])
      return (
        <div
          data-testid="optimizer-dialog"
          data-date-from={props.dateFrom}
          data-date-to={props.dateTo}
        >
          {props.open ? (
            <>
              <span>Optimizer open</span>
              <button onClick={() => props.onOpenChange?.(false)}>
                Close optimizer
              </button>
            </>
          ) : null}
        </div>
      )
    },
  }
})

vi.mock('@/components/waiting-list/waiting-list-client', () => ({
  WaitingListClient: () => <div>Waiting list content</div>,
}))

vi.mock('@/components/ui/button', () => ({
  Button: forwardRef<
    HTMLButtonElement,
    React.ButtonHTMLAttributes<HTMLButtonElement>
  >((props, ref) => <button ref={ref} {...props} />),
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

const business: WorkspaceBusiness = {
  id: 'business-1',
  business_name: 'Cadence',
  default_appointment_duration: 30,
  slot_interval_minutes: 15,
  currency: 'EUR',
  language: 'en',
  timezone: 'Europe/Rome',
  lunch_break_enabled: false,
  lunch_start: null,
  lunch_end: null,
  max_daily_appointments: null,
  default_buffer_minutes: 0,
}

const config: CalendarConfig = {
  timezone: business.timezone,
  slotIntervalMinutes: 15,
  defaultDurationMinutes: 30,
  maxDailyAppointments: null,
  workingHours: [],
  holidays: [],
}

const appointment: CalendarAppointment = {
  id: 'appointment-1',
  appointment_date: '2026-07-17',
  start_time: '09:00:00',
  end_time: '09:30:00',
  duration_minutes: 30,
  status: 'scheduled',
  color: null,
  title: 'Consultation',
  price: 50,
  patient_id: 'patient-1',
  service_id: 'service-1',
  locked: false,
  manual_override: false,
  version: 1,
}

function renderController(queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceProvider business={business}>
          <CalendarController />
        </WorkspaceProvider>
      </QueryClientProvider>,
    ),
  }
}

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  let listener: ((event: MediaQueryListEvent) => void) | null = null
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
      addEventListener: (
        _type: 'change',
        nextListener: (event: MediaQueryListEvent) => void,
      ) => {
        listener = nextListener
      },
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches
      listener?.({ matches } as MediaQueryListEvent)
    },
  }
}

describe('CalendarController', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-07-16T22:30:00.000Z'))
    localStorage.clear()
    localStorage.setItem('cadence.calendar.view', 'day')
    localStorage.setItem('cadence.calendar.density', '999')
    vi.mocked(getCalendarConfig).mockResolvedValue(config)
    vi.mocked(listAppointments).mockImplementation(async (_businessId, from) => (
      from === '2026-07-17' ? [appointment] : []
    ))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates hydration-stable initial state without reading localStorage', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem')

    expect(createInitialCalendarState(business.timezone)).toEqual({
      view: 'week',
      selectedDate: '2026-07-17',
      density: 60,
      selectedAppointmentId: null,
      createAt: null,
    })
    expect(getItem).not.toHaveBeenCalled()
    getItem.mockRestore()
  })

  it('restores supported persisted preferences after mount', async () => {
    const { queryClient } = renderController()
    const renderer = await screen.findByTestId('calendar-renderer')

    expect(renderer).toHaveAttribute('data-date', '2026-07-17')
    expect(renderer).toHaveAttribute('data-density', '120')
    expect(renderer).toHaveAttribute('data-view', 'day')
    expect(screen.getByText('1 appointments')).toBeInTheDocument()
    expect(queryClient.getQueryData(
      calendarKeys.range(business.id, '2026-07-17', '2026-07-17'),
    )).toEqual([appointment])
  })

  it.each(['week', 'month', 'agenda'])(
    'uses the available day renderer on mobile instead of stored %s view',
    async (storedView) => {
      localStorage.setItem('cadence.calendar.view', storedView)
      renderController()

      const renderer = await screen.findByTestId('calendar-renderer')
      expect(renderer).toHaveAttribute('data-view', 'day')
      expect(listAppointments).toHaveBeenCalledWith(
        business.id,
        '2026-07-17',
        '2026-07-17',
      )
      await waitFor(() => {
        expect(localStorage.getItem('cadence.calendar.view')).toBe('day')
      })
    },
  )

  it('prefetches adjacent ranges and owns calendar overlays and waiting state', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderController()

    await screen.findByText('1 appointments')
    await waitFor(() => {
      expect(listAppointments).toHaveBeenCalledWith(
        business.id,
        '2026-07-16',
        '2026-07-16',
      )
      expect(listAppointments).toHaveBeenCalledWith(
        business.id,
        '2026-07-18',
        '2026-07-18',
      )
    })

    await user.click(screen.getByRole('button', { name: 'Select appointment' }))
    expect(screen.getByTestId('appointment-dialog')).toHaveTextContent('appointment-1')

    await user.click(screen.getByRole('button', { name: 'Open mobile optimizer' }))
    expect(screen.getByText('Optimizer open')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Waiting list' }))
    expect(screen.getByText('Waiting list content')).toBeInTheDocument()
  })

  it('does not run calendar keyboard shortcuts while waiting list is active', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderController()

    await screen.findByTestId('calendar-renderer')
    await user.click(screen.getByRole('button', { name: 'Waiting list' }))
    fireEvent.keyDown(window, { key: 'n' })

    expect(screen.queryByTestId('appointment-dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Waiting list content')).toBeInTheDocument()
  })

  it('treats kept previous query data as loading until the selected range resolves', async () => {
    let resolveNext!: (appointments: CalendarAppointment[]) => void
    const nextAppointments = new Promise<CalendarAppointment[]>((resolve) => {
      resolveNext = resolve
    })
    vi.mocked(listAppointments).mockImplementation(async (_businessId, from) => {
      if (from === '2026-07-18') return nextAppointments
      return from === '2026-07-17' ? [appointment] : []
    })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderController()

    const renderer = await screen.findByTestId('calendar-renderer')
    await waitFor(() => expect(renderer).toHaveAttribute('data-loading', 'false'))
    await user.click(screen.getByRole('button', { name: 'Next mobile date' }))

    await waitFor(() => expect(renderer).toHaveAttribute('data-loading', 'true'))
    resolveNext([])
    await waitFor(() => expect(renderer).toHaveAttribute('data-loading', 'false'))
  })

  it('keeps one optimizer run open across a mobile-to-desktop breakpoint change', async () => {
    const media = installMatchMedia(false)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderController()

    await screen.findByTestId('calendar-renderer')
    const mobileTrigger = screen.getByRole('button', {
      name: 'Open mobile optimizer',
    })
    mobileTrigger.focus()
    await user.click(mobileTrigger)
    await waitFor(() => expect(optimizerRuns).toHaveBeenCalledTimes(1))

    act(() => media.setMatches(true))

    expect(screen.getAllByTestId('optimizer-dialog')).toHaveLength(1)
    expect(screen.getByText('Optimizer open')).toBeInTheDocument()
    expect(optimizerRuns).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Close optimizer' }))
    expect(screen.getByRole('button', { name: 'Optimize' })).toHaveFocus()
  })

  it('switches an open desktop week optimizer to the mobile day scope once', async () => {
    localStorage.setItem('cadence.calendar.view', 'week')
    const media = installMatchMedia(true)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderController()

    const renderer = await screen.findByTestId('calendar-renderer')
    await waitFor(() => expect(renderer).toHaveAttribute('data-view', 'week'))
    await user.click(screen.getByRole('button', { name: 'Optimize' }))
    await waitFor(() => expect(optimizerRuns).toHaveBeenCalledTimes(1))

    act(() => media.setMatches(false))

    await waitFor(() => {
      expect(screen.getByTestId('calendar-renderer')).toHaveAttribute(
        'data-view',
        'day',
      )
    })
    const optimizer = screen.getByTestId('optimizer-dialog')
    expect(optimizer).toHaveAttribute('data-date-from', '2026-07-17')
    expect(optimizer).toHaveAttribute('data-date-to', '2026-07-17')
    expect(listAppointments).toHaveBeenCalledWith(
      business.id,
      '2026-07-17',
      '2026-07-17',
    )
    expect(optimizerRuns).toHaveBeenCalledTimes(1)
    await waitFor(() => {
      expect(localStorage.getItem('cadence.calendar.view')).toBe('day')
    })
  })

  it('ignores the week shortcut on mobile and keeps day query and optimizer scope', async () => {
    installMatchMedia(false)
    renderController()

    await screen.findByTestId('calendar-renderer')
    fireEvent.keyDown(window, { key: 'w' })

    await waitFor(() => {
      expect(listAppointments).toHaveBeenCalledWith(
        business.id,
        '2026-07-17',
        '2026-07-17',
      )
      expect(listAppointments).not.toHaveBeenCalledWith(
        business.id,
        '2026-07-13',
        '2026-07-19',
      )
    })
    const optimizer = screen.getByTestId('optimizer-dialog')
    expect(optimizer).toHaveAttribute('data-date-from', '2026-07-17')
    expect(optimizer).toHaveAttribute('data-date-to', '2026-07-17')
    expect(localStorage.getItem('cadence.calendar.view')).toBe('day')
  })
})
