import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileWeekTimeGrid } from '@/components/calendar/mobile-week-time-grid'
import type { CalendarAppointment } from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import {
  WorkspaceProvider,
  type WorkspaceBusiness,
} from '@/lib/workspace-context'

vi.mock('@/components/ui/button', () => ({
  Button: ({
    asChild: _asChild,
    size: _size,
    variant: _variant,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean
    size?: string
    variant?: string
  }) => <button {...props} />,
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
  appointment_date: '2026-07-16',
  start_time: '09:00:00',
  end_time: '10:00:00',
  duration_minutes: 60,
  status: 'scheduled',
  color: '#6d4bd8',
  title: 'Physio',
  price: 50,
  patient_id: 'patient-1',
  service_id: 'service-1',
  locked: false,
  manual_override: false,
  version: 1,
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

function renderWeek(overrides: Partial<React.ComponentProps<
  typeof MobileWeekTimeGrid
>> = {}) {
  const props: React.ComponentProps<typeof MobileWeekTimeGrid> = {
    appointments: [appointment],
    config,
    selectedDate: '2026-07-16',
    density: 60,
    onSelectDate: vi.fn(),
    onSelectAppointment: vi.fn(),
    onCreateAt: vi.fn(),
    onMove: vi.fn(),
    onResize: vi.fn(),
    onDensityChange: vi.fn(),
    onViewChange: vi.fn(),
    ...overrides,
  }
  const result = render(
    <WorkspaceProvider business={business}>
      <MobileWeekTimeGrid {...props} />
    </WorkspaceProvider>,
  )
  return { ...result, props }
}

function pointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  {
    pointerId,
    clientX,
    clientY,
  }: {
    pointerId: number
    clientX: number
    clientY: number
  },
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: 'touch' },
    clientX: { value: clientX },
    clientY: { value: clientY },
  })
  fireEvent(target, event)
}

function pinchHeaderToThreeDays() {
  const header = screen.getByTestId('week-pinch-header')
  pointer(header, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 20 })
  pointer(header, 'pointerdown', { pointerId: 2, clientX: 200, clientY: 20 })
  pointer(header, 'pointermove', { pointerId: 2, clientX: 400, clientY: 20 })
}

describe('MobileWeekTimeGrid appointment presentation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-16T08:30:00.000Z'))
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture')
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
  })

  it('shows time and client without narrow-card details or a resize target', () => {
    renderWeek()

    const card = screen.getByRole('button', {
      name: /09:00, Marco Rossi, Physio, 60 minutes, scheduled/i,
    })
    expect(card).toHaveTextContent('09:00')
    expect(card).toHaveTextContent('Marco Rossi')
    expect(card).not.toHaveTextContent('Physio')
    expect(card).not.toHaveTextContent('Scheduled')
    expect(screen.queryByRole('button', {
      name: /resize Marco Rossi appointment/i,
    })).not.toBeInTheDocument()
  })

  it('shows the service when horizontal week zoom makes the card readable', () => {
    renderWeek()

    pinchHeaderToThreeDays()

    expect(screen.getByTestId('mobile-week-time-grid')).toHaveAttribute(
      'data-visible-days',
      '3',
    )
    expect(screen.getByRole('button', {
      name: /09:00, Marco Rossi, Physio, 60 minutes, scheduled/i,
    })).toHaveTextContent('Physio')
  })

  it('changes density from a body pinch without changing visible days', () => {
    const onDensityChange = vi.fn()
    renderWeek({ onDensityChange })
    const viewport = screen.getByTestId('mobile-week-viewport')

    pointer(viewport, 'pointerdown', {
      pointerId: 11,
      clientX: 120,
      clientY: 180,
    })
    pointer(viewport, 'pointerdown', {
      pointerId: 12,
      clientX: 120,
      clientY: 280,
    })
    pointer(viewport, 'pointermove', {
      pointerId: 12,
      clientX: 120,
      clientY: 320,
    })

    expect(onDensityChange).toHaveBeenCalled()
    expect(screen.getByTestId('mobile-week-time-grid')).toHaveAttribute(
      'data-visible-days',
      '7',
    )
  })

  it('changes visible days from a header pinch without changing density', () => {
    const onDensityChange = vi.fn()
    renderWeek({ onDensityChange })

    pinchHeaderToThreeDays()

    expect(screen.getByTestId('mobile-week-time-grid')).toHaveAttribute(
      'data-visible-days',
      '3',
    )
    expect(onDensityChange).not.toHaveBeenCalled()
  })

  it('initially scrolls the two-axis viewport near business-local current time', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })

    renderWeek()
    act(() => vi.runOnlyPendingTimers())

    expect(scrollTo).toHaveBeenCalledWith({
      top: 114,
      behavior: 'smooth',
    })
  })

  it('initially scrolls near the earliest appointment outside the current week', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })

    renderWeek({
      selectedDate: '2026-07-23',
      appointments: [{
        ...appointment,
        appointment_date: '2026-07-23',
      }],
    })

    expect(scrollTo).toHaveBeenCalledWith({
      top: 24,
      behavior: 'smooth',
    })
  })

  it('falls back to the first working hour when a week has no appointments', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })

    renderWeek({
      selectedDate: '2026-07-23',
      appointments: [],
    })

    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    })
  })
})
