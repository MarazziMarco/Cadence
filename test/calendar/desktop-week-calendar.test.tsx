import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  DesktopWeekCalendar,
  type CalendarRendererProps,
} from '@/components/calendar/desktop-week-calendar'
import type { CalendarAppointment } from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import { WorkspaceProvider, type WorkspaceBusiness } from '@/lib/workspace-context'

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
  end_time: '09:30:00',
  duration_minutes: 30,
  status: 'scheduled',
  color: '#6d4bd8',
  title: 'Consultation',
  price: 50,
  patient_id: 'patient-1',
  service_id: 'service-1',
  locked: false,
  manual_override: false,
  version: 3,
  patients: {
    first_name: 'Marco',
    last_name: 'Rossi',
    full_name: 'Marco Rossi',
    color: null,
    phone: null,
    email: null,
  },
  services: {
    name: 'Consultation',
    color: '#6d4bd8',
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    max_daily_bookings: null,
  },
}

function renderCalendar(overrides: Partial<CalendarRendererProps> = {}) {
  const props: CalendarRendererProps = {
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
      <DesktopWeekCalendar {...props} view="week" />
    </WorkspaceProvider>,
  )

  return { ...result, props }
}

describe('DesktopWeekCalendar', () => {
  it('preserves week headers and delegates appointment selection', () => {
    const { props } = renderCalendar()

    expect(screen.getByText('Mon')).toBeInTheDocument()
    expect(screen.getByText('Sun')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Marco Rossi'))

    expect(props.onSelectAppointment).toHaveBeenCalledWith('appointment-1')
  })

  it('delegates blank-slot creation using configured density and interval', () => {
    const { container, props } = renderCalendar({ appointments: [] })
    const thursday = container.querySelector<HTMLElement>('[data-date="2026-07-16"]')

    expect(thursday).not.toBeNull()
    fireEvent.click(thursday!, { clientY: 150 })

    expect(props.onCreateAt).toHaveBeenCalledWith('2026-07-16', 570)
  })

  it('delegates desktop drag with appointment version and snapped destination', () => {
    const { container, props } = renderCalendar()
    const card = screen.getByText('Marco Rossi').closest<HTMLElement>('[draggable="true"]')
    const friday = container.querySelector<HTMLElement>('[data-date="2026-07-17"]')
    const values = new Map<string, string>()
    const dataTransfer = {
      setData: (type: string, value: string) => values.set(type, value),
      getData: (type: string) => values.get(type) ?? '',
    }

    expect(card).not.toBeNull()
    expect(friday).not.toBeNull()
    const dragStart = new Event('dragstart', { bubbles: true })
    Object.assign(dragStart, { clientY: 10, dataTransfer })
    fireEvent(card!, dragStart)
    const drop = new Event('drop', { bubbles: true })
    Object.assign(drop, { clientY: 100, dataTransfer })
    fireEvent(friday!, drop)

    expect(props.onMove).toHaveBeenCalledWith({
      appointmentId: 'appointment-1',
      expectedVersion: 3,
      date: '2026-07-17',
      startMinute: 510,
    })
  })
})
