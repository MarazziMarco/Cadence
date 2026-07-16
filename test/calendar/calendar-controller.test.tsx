import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

vi.mock('@/components/calendar/optimize-dialog', () => ({
  OptimizeDialog: (props: {
    open?: boolean
    onOpenChange?(open: boolean): void
  }) => (
    <div>
      <button onClick={() => props.onOpenChange?.(true)}>Open optimizer</button>
      {props.open ? <span>Optimizer open</span> : null}
    </div>
  ),
}))

vi.mock('@/components/waiting-list/waiting-list-client', () => ({
  WaitingListClient: () => <div>Waiting list content</div>,
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

  it.each(['month', 'agenda'])(
    'ignores stored unsupported view %s until its renderer exists',
    async (storedView) => {
      localStorage.setItem('cadence.calendar.view', storedView)
      renderController()

      const renderer = await screen.findByTestId('calendar-renderer')
      expect(renderer).toHaveAttribute('data-view', 'week')
      expect(listAppointments).toHaveBeenCalledWith(
        business.id,
        '2026-07-13',
        '2026-07-19',
      )
      await waitFor(() => {
        expect(localStorage.getItem('cadence.calendar.view')).toBe('week')
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

    await user.click(screen.getByRole('button', { name: 'Open optimizer' }))
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
})
