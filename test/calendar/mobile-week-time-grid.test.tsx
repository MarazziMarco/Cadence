import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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

vi.mock('@/hooks/use-week-header-pinch', () => ({
  useWeekHeaderPinch: ({
    onVisibleDaysChange,
  }: {
    onVisibleDaysChange(value: number): void
  }) => ({
    handlers: {
      onPointerDown: () => onVisibleDaysChange(3),
    },
  }),
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

function renderWeek() {
  return render(
    <WorkspaceProvider business={business}>
      <MobileWeekTimeGrid
        appointments={[appointment]}
        config={config}
        selectedDate="2026-07-16"
        density={60}
        onSelectDate={vi.fn()}
        onSelectAppointment={vi.fn()}
        onCreateAt={vi.fn()}
        onMove={vi.fn()}
        onResize={vi.fn()}
        onDensityChange={vi.fn()}
        onViewChange={vi.fn()}
      />
    </WorkspaceProvider>,
  )
}

function pinchHeaderToThreeDays() {
  const header = screen.getByTestId('week-pinch-header')
  fireEvent.pointerDown(header)
}

describe('MobileWeekTimeGrid appointment presentation', () => {
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
})
