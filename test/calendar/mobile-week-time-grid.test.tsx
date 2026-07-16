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

vi.mock('@/components/ui/popover', async () => {
  const React = await import('react')
  const PopoverContext = React.createContext<{
    open: boolean
    onOpenChange(open: boolean): void
  } | null>(null)
  return {
    Popover: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean
      onOpenChange(open: boolean): void
      children: React.ReactNode
    }) => (
      <PopoverContext.Provider value={{ open, onOpenChange }}>
        {children}
      </PopoverContext.Provider>
    ),
    PopoverTrigger: ({
      children,
    }: {
      asChild?: boolean
      children: React.ReactElement
    }) => {
      const context = React.useContext(PopoverContext)!
      return React.cloneElement(children, {
        onClick: (event: React.MouseEvent) => {
          children.props.onClick?.(event)
          context.onOpenChange(!context.open)
        },
      })
    },
    PopoverContent: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      align?: string
    }) => {
      const context = React.useContext(PopoverContext)!
      if (!context.open) return null
      const { align: _align, ...contentProps } = props
      return <div {...contentProps}>{children}</div>
    },
  }
})

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

function collisionAppointments(): CalendarAppointment[] {
  return [
    {
      ...appointment,
      id: 'appointment-1',
      patient_id: 'patient-1',
      start_time: '09:00:00',
      end_time: '10:00:00',
      patients: {
        ...appointment.patients!,
        full_name: 'Marco Rossi',
      },
    },
    {
      ...appointment,
      id: 'appointment-2',
      patient_id: 'patient-2',
      start_time: '09:15:00',
      end_time: '10:15:00',
      patients: {
        ...appointment.patients!,
        first_name: 'Giulia',
        last_name: 'Bianchi',
        full_name: 'Giulia Bianchi',
      },
    },
    {
      ...appointment,
      id: 'appointment-3',
      patient_id: 'patient-3',
      start_time: '09:30:00',
      end_time: '10:30:00',
      patients: {
        ...appointment.patients!,
        first_name: 'Luca',
        last_name: 'Verdi',
        full_name: 'Luca Verdi',
      },
    },
  ]
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
  type:
    | 'pointerdown'
    | 'pointermove'
    | 'pointerup'
    | 'lostpointercapture',
  {
    pointerId,
    clientX,
    clientY,
    isPrimary = true,
  }: {
    pointerId: number
    clientX: number
    clientY: number
    isPrimary?: boolean
  },
) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: 'touch' },
    clientX: { value: clientX },
    clientY: { value: clientY },
    isPrimary: { value: isPrimary },
    button: { value: 0 },
  })
  fireEvent(target, event)
}

function setViewportDimensions(
  viewport: HTMLElement,
  {
    clientWidth,
    scrollWidth,
    clientHeight,
    scrollHeight,
  }: {
    clientWidth: number
    scrollWidth: number
    clientHeight: number
    scrollHeight: number
  },
) {
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, value: clientWidth },
    scrollWidth: { configurable: true, value: scrollWidth },
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: scrollHeight },
  })
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
    vi.restoreAllMocks()
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

  it('compacts three unreadable collisions into a representative card and +N', () => {
    renderWeek({ appointments: collisionAppointments() })

    expect(screen.getByRole('button', {
      name: /09:00, Marco Rossi, Physio, 60 minutes, scheduled/i,
    })).toBeInTheDocument()
    expect(screen.queryByRole('button', {
      name: /09:15, Giulia Bianchi, Physio, 60 minutes, scheduled/i,
    })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {
      name: /09:30, Luca Verdi, Physio, 60 minutes, scheduled/i,
    })).not.toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: /2 more appointments/i,
    })).toHaveTextContent('+2')
  })

  it('lists every hidden collision and opens the existing quick sheet callback', () => {
    const onSelectAppointment = vi.fn()
    const onCreateAt = vi.fn()
    renderWeek({
      appointments: collisionAppointments(),
      onSelectAppointment,
      onCreateAt,
    })

    fireEvent.click(screen.getByRole('button', {
      name: /2 more appointments/i,
    }))

    expect(screen.getByRole('button', {
      name: /09:15, Giulia Bianchi/i,
    })).toHaveTextContent('09:15')
    expect(screen.getByRole('button', {
      name: /09:30, Luca Verdi/i,
    })).toHaveTextContent('Luca Verdi')

    fireEvent.click(screen.getByRole('button', {
      name: /09:15, Giulia Bianchi/i,
    }))

    expect(onSelectAppointment).toHaveBeenCalledWith('appointment-2')
    expect(onCreateAt).not.toHaveBeenCalled()
  })

  it('restores individual collision lanes after zooming to three days', () => {
    renderWeek({ appointments: collisionAppointments() })

    expect(screen.getByRole('button', {
      name: /2 more appointments/i,
    })).toBeInTheDocument()

    pinchHeaderToThreeDays()

    expect(screen.queryByRole('button', {
      name: /2 more appointments/i,
    })).not.toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: /09:00, Marco Rossi, Physio, 60 minutes, scheduled/i,
    })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: /09:15, Giulia Bianchi, Physio, 60 minutes, scheduled/i,
    })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: /09:30, Luca Verdi, Physio, 60 minutes, scheduled/i,
    })).toBeInTheDocument()
  })

  it('anchors a completed body pinch without changing visible days', () => {
    const onDensityChange = vi.fn()
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function offsetHeight(this: HTMLElement) {
        return this.dataset.testid === 'week-pinch-header' ? 44 : 0
      })
    renderWeek({ onDensityChange })
    const viewport = screen.getByTestId('mobile-week-viewport')
    viewport.scrollTop = 100
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 390,
      bottom: 600,
      left: 0,
      width: 390,
      height: 600,
      toJSON: () => ({}),
    })

    pointer(viewport, 'pointerdown', {
      pointerId: 11,
      clientX: 120,
      clientY: 100,
    })
    pointer(viewport, 'pointerdown', {
      pointerId: 12,
      clientX: 120,
      clientY: 200,
    })
    pointer(viewport, 'pointermove', {
      pointerId: 12,
      clientX: 120,
      clientY: 300,
    })
    act(() => vi.runOnlyPendingTimers())

    expect(onDensityChange).toHaveBeenCalledTimes(1)
    expect(viewport.scrollTop).toBe(356)
    expect(screen.getByTestId('mobile-week-time-grid')).toHaveAttribute(
      'data-visible-days',
      '7',
    )

    pointer(viewport, 'pointerup', {
      pointerId: 12,
      clientX: 120,
      clientY: 300,
      isPrimary: false,
    })
    pointer(viewport, 'pointermove', {
      pointerId: 11,
      clientX: 120,
      clientY: 80,
    })

    expect(onDensityChange).toHaveBeenCalledTimes(1)
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

  it('does not start body pinch while an appointment gesture is active', () => {
    const onDensityChange = vi.fn()
    renderWeek({ onDensityChange })
    const card = screen.getByRole('button', {
      name: /09:00, Marco Rossi, Physio, 60 minutes, scheduled/i,
    })
    const viewport = screen.getByTestId('mobile-week-viewport')

    pointer(card, 'pointerdown', {
      pointerId: 31,
      clientX: 140,
      clientY: 200,
    })
    act(() => vi.advanceTimersByTime(450))

    pointer(viewport, 'pointerdown', {
      pointerId: 41,
      clientX: 120,
      clientY: 180,
    })
    pointer(viewport, 'pointerdown', {
      pointerId: 42,
      clientX: 120,
      clientY: 280,
      isPrimary: false,
    })
    pointer(viewport, 'pointermove', {
      pointerId: 42,
      clientX: 120,
      clientY: 320,
      isPrimary: false,
    })

    expect(onDensityChange).not.toHaveBeenCalled()

    pointer(card, 'pointerup', {
      pointerId: 31,
      clientX: 140,
      clientY: 200,
    })
  })

  it('releases body pinch after an active appointment loses pointer capture', () => {
    const onDensityChange = vi.fn()
    renderWeek({ onDensityChange })
    const card = screen.getByRole('button', {
      name: /09:00, Marco Rossi, Physio, 60 minutes, scheduled/i,
    })
    const viewport = screen.getByTestId('mobile-week-viewport')

    pointer(card, 'pointerdown', {
      pointerId: 32,
      clientX: 140,
      clientY: 200,
    })
    act(() => vi.advanceTimersByTime(450))
    pointer(card, 'lostpointercapture', {
      pointerId: 32,
      clientX: 140,
      clientY: 200,
    })

    pointer(viewport, 'pointerdown', {
      pointerId: 43,
      clientX: 120,
      clientY: 180,
    })
    pointer(viewport, 'pointerdown', {
      pointerId: 44,
      clientX: 120,
      clientY: 280,
      isPrimary: false,
    })
    pointer(viewport, 'pointermove', {
      pointerId: 44,
      clientX: 120,
      clientY: 340,
      isPrimary: false,
    })

    expect(onDensityChange).toHaveBeenCalledTimes(1)
  })

  it('moves a long-pressed appointment within Monday with versioned intent', () => {
    const onMove = vi.fn()
    renderWeek({
      appointments: [{
        ...appointment,
        appointment_date: '2026-07-13',
      }],
      selectedDate: '2026-07-13',
      onMove,
    })
    const card = screen.getByRole('button', {
      name: /09:00, Marco Rossi, Physio, 60 minutes, scheduled/i,
    })

    pointer(card, 'pointerdown', {
      pointerId: 51,
      clientX: 70,
      clientY: 200,
    })
    act(() => vi.advanceTimersByTime(450))
    pointer(card, 'pointermove', {
      pointerId: 51,
      clientX: 80,
      clientY: 230,
    })
    pointer(card, 'pointerup', {
      pointerId: 51,
      clientX: 80,
      clientY: 230,
    })

    expect(onMove).toHaveBeenCalledWith({
      appointmentId: 'appointment-1',
      expectedVersion: 1,
      date: '2026-07-13',
      startMinute: 9 * 60 + 30,
    })
  })

  it('moves a long-pressed Monday appointment across the Tuesday boundary', () => {
    const onMove = vi.fn()
    renderWeek({
      appointments: [{
        ...appointment,
        appointment_date: '2026-07-13',
      }],
      selectedDate: '2026-07-13',
      onMove,
    })
    const card = screen.getByRole('button', {
      name: /09:00, Marco Rossi, Physio, 60 minutes, scheduled/i,
    })

    pointer(card, 'pointerdown', {
      pointerId: 52,
      clientX: 70,
      clientY: 200,
    })
    act(() => vi.advanceTimersByTime(450))
    pointer(card, 'pointermove', {
      pointerId: 52,
      clientX: 110,
      clientY: 215,
    })
    pointer(card, 'pointerup', {
      pointerId: 52,
      clientX: 110,
      clientY: 215,
    })

    expect(onMove).toHaveBeenCalledWith({
      appointmentId: 'appointment-1',
      expectedVersion: 1,
      date: '2026-07-14',
      startMinute: 9 * 60 + 15,
    })
  })

  it('previews a cross-day drag in the target Tuesday column', () => {
    renderWeek({
      appointments: [{
        ...appointment,
        appointment_date: '2026-07-13',
      }],
      selectedDate: '2026-07-13',
    })
    const card = screen.getByRole('button', {
      name: /09:00, Marco Rossi, Physio, 60 minutes, scheduled/i,
    })
    const viewport = screen.getByTestId('mobile-week-viewport')
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 390,
      bottom: 600,
      left: 0,
      width: 390,
      height: 600,
      toJSON: () => ({}),
    })

    pointer(card, 'pointerdown', {
      pointerId: 55,
      clientX: 70,
      clientY: 200,
    })
    act(() => vi.advanceTimersByTime(450))
    pointer(card, 'pointermove', {
      pointerId: 55,
      clientX: 110,
      clientY: 215,
    })
    act(() => vi.advanceTimersByTime(40))

    expect(card.parentElement?.style.transform).toMatch(/^translateX\(/)

    pointer(card, 'pointerup', {
      pointerId: 55,
      clientX: 110,
      clientY: 215,
    })
  })

  it('suppresses the synthetic click after a completed weekly drag', () => {
    const onSelectAppointment = vi.fn()
    const onCreateAt = vi.fn()
    renderWeek({
      appointments: [{
        ...appointment,
        appointment_date: '2026-07-13',
      }],
      selectedDate: '2026-07-13',
      onSelectAppointment,
      onCreateAt,
    })
    const card = screen.getByRole('button', {
      name: /09:00, Marco Rossi, Physio, 60 minutes, scheduled/i,
    })

    pointer(card, 'pointerdown', {
      pointerId: 53,
      clientX: 70,
      clientY: 200,
    })
    act(() => vi.advanceTimersByTime(450))
    pointer(card, 'pointermove', {
      pointerId: 53,
      clientX: 110,
      clientY: 215,
    })
    pointer(card, 'pointerup', {
      pointerId: 53,
      clientX: 110,
      clientY: 215,
    })
    fireEvent.click(card)

    expect(onSelectAppointment).not.toHaveBeenCalled()
    expect(onCreateAt).not.toHaveBeenCalled()
  })

  it('does not claim horizontal auto-scroll when the viewport has no overflow', () => {
    renderWeek({
      appointments: [{
        ...appointment,
        appointment_date: '2026-07-13',
      }],
      selectedDate: '2026-07-13',
    })
    const card = screen.getByRole('button', {
      name: /09:00, Marco Rossi, Physio, 60 minutes, scheduled/i,
    })
    const viewport = screen.getByTestId('mobile-week-viewport')
    setViewportDimensions(viewport, {
      clientWidth: 390,
      scrollWidth: 390,
      clientHeight: 600,
      scrollHeight: 1_200,
    })
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 390,
      bottom: 600,
      left: 0,
      width: 390,
      height: 600,
      toJSON: () => ({}),
    })
    act(() => vi.runOnlyPendingTimers())

    pointer(card, 'pointerdown', {
      pointerId: 54,
      clientX: 70,
      clientY: 200,
    })
    act(() => vi.advanceTimersByTime(450))
    pointer(card, 'pointermove', {
      pointerId: 54,
      clientX: 380,
      clientY: 300,
    })
    act(() => vi.advanceTimersByTime(40))

    expect(viewport.scrollLeft).toBe(0)
    expect(vi.getTimerCount()).toBe(0)

    pointer(card, 'pointerup', {
      pointerId: 54,
      clientX: 380,
      clientY: 300,
    })
  })

  it('clamps auto-scroll to real bounds and stops scheduling at the edge', () => {
    renderWeek({
      appointments: [{
        ...appointment,
        appointment_date: '2026-07-13',
      }],
      selectedDate: '2026-07-13',
    })
    const card = screen.getByRole('button', {
      name: /09:00, Marco Rossi, Physio, 60 minutes, scheduled/i,
    })
    const viewport = screen.getByTestId('mobile-week-viewport')
    setViewportDimensions(viewport, {
      clientWidth: 390,
      scrollWidth: 800,
      clientHeight: 600,
      scrollHeight: 1_200,
    })
    viewport.scrollLeft = 403
    viewport.scrollTop = 593
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 390,
      bottom: 600,
      left: 0,
      width: 390,
      height: 600,
      toJSON: () => ({}),
    })
    act(() => vi.runOnlyPendingTimers())
    viewport.scrollLeft = 403
    viewport.scrollTop = 593

    pointer(card, 'pointerdown', {
      pointerId: 56,
      clientX: 70,
      clientY: 200,
    })
    act(() => vi.advanceTimersByTime(450))
    pointer(card, 'pointermove', {
      pointerId: 56,
      clientX: 380,
      clientY: 590,
    })
    act(() => vi.advanceTimersByTime(40))

    expect(viewport.scrollLeft).toBe(410)
    expect(viewport.scrollTop).toBe(600)
    act(() => vi.advanceTimersByTime(160))
    expect(viewport.scrollLeft).toBe(410)
    expect(viewport.scrollTop).toBe(600)
    expect(vi.getTimerCount()).toBe(0)

    pointer(card, 'pointerup', {
      pointerId: 56,
      clientX: 380,
      clientY: 590,
    })
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

  it('falls back to the earliest valid configured working window', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })

    renderWeek({
      selectedDate: '2026-07-23',
      appointments: [],
      config: {
        ...config,
        workingHours: [
          {
            id: 'hours-monday',
            business_id: business.id,
            weekday: 'monday',
            is_open: true,
            morning_start: '06:00:00',
            morning_end: '05:00:00',
            afternoon_start: '13:00:00',
            afternoon_end: '18:00:00',
          },
          {
            id: 'hours-tuesday',
            business_id: business.id,
            weekday: 'tuesday',
            is_open: true,
            morning_start: '09:30:00',
            morning_end: '12:00:00',
            afternoon_start: null,
            afternoon_end: null,
          },
        ],
      },
    })

    expect(scrollTo).toHaveBeenCalledWith({
      top: 54,
      behavior: 'smooth',
    })
  })

  it('uses 07:00 only when the week has no open configured window', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })

    renderWeek({
      selectedDate: '2026-07-23',
      appointments: [],
      config: {
        ...config,
        workingHours: [{
          id: 'hours-monday',
          business_id: business.id,
          weekday: 'monday',
          is_open: false,
          morning_start: '09:00:00',
          morning_end: '12:00:00',
          afternoon_start: null,
          afternoon_end: null,
        }],
      },
    })

    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: 'smooth',
    })
  })

  it('waits for current week data before recording the initial scroll', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    const { props, rerender } = renderWeek({
      selectedDate: '2026-07-23',
      appointments: [{
        ...appointment,
        appointment_date: '2026-07-16',
        start_time: '08:00:00',
      }],
      isLoading: true,
    })

    expect(scrollTo).not.toHaveBeenCalled()

    rerender(
      <WorkspaceProvider business={business}>
        <MobileWeekTimeGrid
          {...props}
          appointments={[{
            ...appointment,
            appointment_date: '2026-07-23',
            start_time: '10:00:00',
          }]}
          isLoading={false}
        />
      </WorkspaceProvider>,
    )

    expect(scrollTo).toHaveBeenCalledTimes(1)
    expect(scrollTo).toHaveBeenCalledWith({
      top: 84,
      behavior: 'smooth',
    })
  })
})
