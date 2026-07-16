import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileDayCalendar } from '@/components/calendar/mobile-day-calendar'
import type { CalendarAppointment } from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import {
  WorkspaceProvider,
  type WorkspaceBusiness,
} from '@/lib/workspace-context'

const business: WorkspaceBusiness = {
  id: 'business-1',
  business_name: 'Cadence',
  default_appointment_duration: 30,
  slot_interval_minutes: 15,
  currency: 'EUR',
  language: 'en',
  timezone: 'Europe/Rome',
  lunch_break_enabled: true,
  lunch_start: '13:00:00',
  lunch_end: '14:00:00',
  max_daily_appointments: null,
  default_buffer_minutes: 0,
}

const config: CalendarConfig = {
  timezone: 'Europe/Rome',
  slotIntervalMinutes: 15,
  defaultDurationMinutes: 30,
  maxDailyAppointments: null,
  workingHours: [{
    id: 'wh1',
    business_id: 'business-1',
    weekday: 'thursday',
    is_open: true,
    morning_start: '09:00:00',
    morning_end: '13:00:00',
    afternoon_start: '14:00:00',
    afternoon_end: '18:00:00',
  }],
  holidays: [],
}

const appointment: CalendarAppointment = {
  id: 'a1',
  appointment_date: '2026-07-16',
  start_time: '09:15:00',
  end_time: '10:00:00',
  duration_minutes: 45,
  status: 'scheduled',
  color: '#6d4bd8',
  title: 'Physio',
  price: 50,
  patient_id: 'p1',
  service_id: 's1',
  locked: false,
  version: 1,
  manual_override: false,
  patients: {
    first_name: 'Marco',
    last_name: 'Rossi',
    full_name: 'Marco Rossi',
    color: null,
    phone: null,
    email: null,
  },
  services: {
    name: 'Physio',
    color: '#6d4bd8',
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    max_daily_bookings: null,
  },
}

function renderCalendar(overrides: Partial<React.ComponentProps<
  typeof MobileDayCalendar
>> = {}) {
  const props: React.ComponentProps<typeof MobileDayCalendar> = {
    appointments: [appointment],
    config,
    selectedDate: '2026-07-16',
    density: 60,
    onSelectDate: vi.fn(),
    onSelectAppointment: vi.fn(),
    onCreateAt: vi.fn(),
    onMove: vi.fn(),
    onResize: vi.fn(),
    ...overrides,
  }

  const result = render(
    <WorkspaceProvider business={business}>
      <MobileDayCalendar {...props} />
    </WorkspaceProvider>,
  )

  return { ...result, props }
}

describe('MobileDayCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-16T08:30:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
  })

  it('renders a semantic appointment with a non-color status label', () => {
    renderCalendar()

    const card = screen.getByRole('button', {
      name: /09:15, Marco Rossi, Physio, 45 minutes, scheduled/i,
    })

    expect(card).toHaveTextContent('Marco Rossi')
    expect(card).toHaveTextContent('Physio')
    expect(card).toHaveTextContent('Scheduled')
  })

  it('uses split business windows and configured density for timeline geometry', () => {
    renderCalendar()

    const timeline = screen.getByTestId('mobile-day-timeline')
    const lunchClosure = screen.getByTestId('closed-window-780-840')
    const card = screen.getByRole('button', { name: /Marco Rossi/i })

    expect(timeline).toHaveStyle({ height: '540px' })
    expect(lunchClosure).toHaveStyle({ top: '240px', height: '60px' })
    expect(card).toHaveStyle({ top: '15px', height: '45px' })
  })

  it('snaps blank timeline taps to the configured interval', () => {
    const { props } = renderCalendar({ appointments: [] })
    const timeline = screen.getByTestId('mobile-day-timeline')

    fireEvent.click(timeline, { clientY: 76 })

    expect(props.onCreateAt).toHaveBeenCalledWith('2026-07-16', 615)
  })

  it('shows business-local current time only on business today', () => {
    const { rerender } = renderCalendar()

    expect(screen.getByLabelText('Current time')).toHaveStyle({ top: '90px' })

    rerender(
      <WorkspaceProvider business={business}>
        <MobileDayCalendar
          appointments={[]}
          config={config}
          selectedDate="2026-07-17"
          density={60}
          onSelectDate={vi.fn()}
          onSelectAppointment={vi.fn()}
          onCreateAt={vi.fn()}
          onMove={vi.fn()}
          onResize={vi.fn()}
        />
      </WorkspaceProvider>,
    )

    expect(screen.queryByLabelText('Current time')).not.toBeInTheDocument()
  })

  it('keeps the page width fluid and confines horizontal scrolling to the date strip', () => {
    const { container } = renderCalendar()
    const root = screen.getByTestId('mobile-day-calendar')
    const strip = screen.getByRole('navigation', { name: 'Calendar dates' })

    expect(root.className).not.toContain('min-w-')
    expect(root.className).not.toContain('overflow-x-auto')
    expect(strip).toHaveClass('overflow-x-auto')
    expect(container.querySelector('[class*="min-w-[880px]"]')).toBeNull()
  })

  it('renders seven accessible date targets and supports arrow navigation', () => {
    const { props } = renderCalendar()
    const selected = screen.getByRole('button', {
      name: /Thursday, July 16/i,
    })

    expect(screen.getAllByTestId('mobile-date-button')).toHaveLength(7)
    expect(selected).toHaveClass('h-11', 'w-11')

    fireEvent.keyDown(selected, { key: 'ArrowRight' })
    expect(props.onSelectDate).toHaveBeenCalledWith('2026-07-17')
  })

  it('marks closed days while retaining a useful fallback timeline', () => {
    const closedConfig: CalendarConfig = {
      ...config,
      workingHours: [{
        ...config.workingHours[0],
        is_open: false,
        morning_start: null,
        morning_end: null,
        afternoon_start: null,
        afternoon_end: null,
      }],
    }

    renderCalendar({ appointments: [], config: closedConfig })

    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.getByTestId('mobile-day-timeline')).toHaveStyle({
      height: '600px',
    })
  })

  it('waits for calendar data before auto-scrolling, then scrolls once per date', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })

    const { rerender } = renderCalendar({ isLoading: true })
    expect(scrollTo).not.toHaveBeenCalled()

    rerender(
      <WorkspaceProvider business={business}>
        <MobileDayCalendar
          appointments={[appointment]}
          config={config}
          selectedDate="2026-07-16"
          density={60}
          isLoading={false}
          onSelectDate={vi.fn()}
          onSelectAppointment={vi.fn()}
          onCreateAt={vi.fn()}
          onMove={vi.fn()}
          onResize={vi.fn()}
        />
      </WorkspaceProvider>,
    )
    expect(scrollTo).toHaveBeenCalledTimes(1)

    rerender(
      <WorkspaceProvider business={business}>
        <MobileDayCalendar
          appointments={[appointment]}
          config={config}
          selectedDate="2026-07-16"
          density={60}
          isLoading={false}
          onSelectDate={vi.fn()}
          onSelectAppointment={vi.fn()}
          onCreateAt={vi.fn()}
          onMove={vi.fn()}
          onResize={vi.fn()}
        />
      </WorkspaceProvider>,
    )
    expect(scrollTo).toHaveBeenCalledTimes(1)
  })
})
