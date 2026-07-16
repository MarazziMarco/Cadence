import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileDayCalendar } from '@/components/calendar/mobile-day-calendar'
import { MobileDateStrip } from '@/components/calendar/mobile-date-strip'
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

function appointmentAt(
  id: string,
  startTime: string,
  durationMinutes: number,
): CalendarAppointment {
  const [hour, minute] = startTime.split(':').map(Number)
  const endTotal = hour * 60 + minute + durationMinutes
  const endTime = `${String(Math.floor(endTotal / 60)).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}:00`
  return {
    ...appointment,
    id,
    start_time: `${startTime}:00`,
    end_time: endTime,
    duration_minutes: durationMinutes,
    patients: {
      ...appointment.patients!,
      full_name: `Patient ${id}`,
    },
  }
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

function ControlledDateStrip({
  initialDate,
  onKeyDown,
}: {
  initialDate: string
  onKeyDown?(event: React.KeyboardEvent): void
}) {
  const [selectedDate, setSelectedDate] = useState(initialDate)

  return (
    <div onKeyDown={onKeyDown}>
      <MobileDateStrip
        selectedDate={selectedDate}
        timezone={business.timezone}
        onSelectDate={setSelectedDate}
      />
    </div>
  )
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

  it('places simultaneous appointments in visible side-by-side lanes', () => {
    renderCalendar({
      appointments: [
        appointmentAt('a1', '09:00', 30),
        appointmentAt('a2', '09:00', 30),
      ],
    })

    const first = screen.getByRole('button', { name: /Patient a1/i })
    const second = screen.getByRole('button', { name: /Patient a2/i })
    expect(first).toHaveStyle({ left: '0%', width: '50%' })
    expect(second).toHaveStyle({ left: '50%', width: '50%' })
  })

  it('uses rendered 44px hit boxes when allocating adjacent short visits', () => {
    renderCalendar({
      appointments: [
        appointmentAt('short-1', '09:00', 15),
        appointmentAt('short-2', '09:15', 15),
      ],
    })

    const first = screen.getByRole('button', { name: /Patient short-1/i })
    const second = screen.getByRole('button', { name: /Patient short-2/i })
    expect(first).toHaveStyle({ left: '0%', width: '50%', height: '44px' })
    expect(second).toHaveStyle({ left: '50%', width: '50%', height: '44px' })
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

  it('keeps the mobile toolbar and date strip sticky above the timeline', () => {
    renderCalendar()

    expect(screen.getByRole('banner').parentElement).toHaveClass(
      'sticky',
      'top-0',
    )
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

  it('moves and restores keyboard focus repeatedly, including across week boundaries', () => {
    const bubbledKeyDown = vi.fn()
    render(
      <WorkspaceProvider business={business}>
        <ControlledDateStrip
          initialDate="2026-07-19"
          onKeyDown={bubbledKeyDown}
        />
      </WorkspaceProvider>,
    )

    const sunday = screen.getByRole('button', {
      name: /Sunday, July 19/i,
    })
    sunday.focus()
    fireEvent.keyDown(sunday, { key: 'ArrowRight' })

    const monday = screen.getByRole('button', {
      name: /Monday, July 20/i,
    })
    expect(monday).toHaveFocus()
    expect(bubbledKeyDown).not.toHaveBeenCalled()

    fireEvent.keyDown(monday, { key: 'ArrowRight' })
    expect(screen.getByRole('button', {
      name: /Tuesday, July 21/i,
    })).toHaveFocus()
    expect(bubbledKeyDown).not.toHaveBeenCalled()
  })

  it('marks a fully closed timeline as non-actionable', () => {
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

    const { props } = renderCalendar({ appointments: [], config: closedConfig })

    expect(screen.getByText('Closed')).toBeInTheDocument()
    const timeline = screen.getByTestId('mobile-day-timeline')
    expect(timeline).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(timeline, { clientY: 60 })
    expect(props.onCreateAt).not.toHaveBeenCalled()
  })

  it('does not create appointments on a closed holiday', () => {
    const holidayConfig: CalendarConfig = {
      ...config,
      holidays: [{
        id: 'holiday-1',
        business_id: 'business-1',
        name: 'Holiday',
        start_date: '2026-07-16',
        end_date: '2026-07-16',
        is_closed: true,
      }],
    }
    const { props } = renderCalendar({
      appointments: [],
      config: holidayConfig,
    })

    const timeline = screen.getByTestId('mobile-day-timeline')
    expect(timeline).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(timeline, { clientY: 60 })
    expect(props.onCreateAt).not.toHaveBeenCalled()
  })

  it('creates only when the snapped default duration fits an open window', () => {
    const { props } = renderCalendar({ appointments: [] })
    const timeline = screen.getByTestId('mobile-day-timeline')

    fireEvent.click(timeline, { clientY: 0 })
    fireEvent.click(timeline, { clientY: 225 })
    fireEvent.click(timeline, { clientY: 255 })
    fireEvent.click(timeline, { clientY: 525 })

    expect(props.onCreateAt).toHaveBeenCalledTimes(1)
    expect(props.onCreateAt).toHaveBeenCalledWith('2026-07-16', 540)
  })

  it('shows an accessible busy skeleton instead of a closed clickable fallback', () => {
    renderCalendar({
      appointments: [],
      config: {
        ...config,
        workingHours: [],
      },
      isLoading: true,
    })

    expect(screen.getByTestId('mobile-day-calendar')).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.queryByText('Closed')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mobile-day-timeline')).not.toBeInTheDocument()
  })

  it('waits for real calendar data before auto-scrolling', () => {
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
  })

  it('auto-scrolls again when a previously visited date is selected anew', () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })

    const { rerender } = renderCalendar()
    rerender(
      <WorkspaceProvider business={business}>
        <MobileDayCalendar
          appointments={[]}
          config={config}
          selectedDate="2026-07-17"
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

    expect(scrollTo).toHaveBeenCalledTimes(3)
  })

  it('refreshes the business-local current-time line every minute after mount', () => {
    renderCalendar()
    expect(screen.getByLabelText('Current time')).toHaveStyle({ top: '90px' })

    act(() => vi.advanceTimersByTime(60_000))

    expect(screen.getByLabelText('Current time')).toHaveStyle({ top: '91px' })
  })
})
