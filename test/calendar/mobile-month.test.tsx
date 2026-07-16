import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { MobileMonthCalendar } from '@/components/calendar/mobile-month-calendar'
import type { CalendarAppointment } from '@/lib/api/appointments'
import type { CalendarConfig } from '@/lib/api/calendar'
import type { CalendarView } from '@/lib/calendar/types'

vi.mock('@/lib/i18n/use-t', () => ({
  useT: () => ({
    locale: 'en',
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === 'cal.moreAppointments') {
        return `${values?.n} more appointments`
      }
      if (key === 'cal.status.confirmed') return 'Confirmed'
      return key
    },
  }),
}))

const config: CalendarConfig = {
  timezone: 'Europe/Rome',
  slotIntervalMinutes: 15,
  defaultDurationMinutes: 30,
  maxDailyAppointments: null,
  workingHours: [],
  holidays: [],
}

function appointment(
  id: string,
  date: string,
  startTime: string,
): CalendarAppointment {
  return {
    id,
    appointment_date: date,
    start_time: startTime,
    end_time: '10:00:00',
    duration_minutes: 30,
    status: 'confirmed',
    color: '#6d4bd8',
    title: 'Consultation',
    price: null,
    patient_id: `patient-${id}`,
    service_id: null,
    locked: false,
    manual_override: false,
    version: 1,
    patients: {
      first_name: `Patient ${id}`,
      last_name: null,
      full_name: `Patient ${id}`,
      color: null,
      phone: null,
      email: null,
    },
  }
}

describe('MobileMonthCalendar', () => {
  it('opens a mini-agenda, opens appointments, and enters Day on a second day tap', async () => {
    const onSelectAppointment = vi.fn()
    const onViewChange = vi.fn()
    const appointments = [
      appointment('a', '2026-07-17', '08:00:00'),
      appointment('b', '2026-07-17', '09:00:00'),
      appointment('c', '2026-07-17', '10:00:00'),
    ]

    function Harness() {
      const [selectedDate, setSelectedDate] = useState('2026-07-16')
      return (
        <MobileMonthCalendar
          appointments={appointments}
          config={config}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onSelectAppointment={onSelectAppointment}
          onNavigateMonth={() => {}}
          onViewChange={onViewChange}
        />
      )
    }

    const user = userEvent.setup()
    render(<Harness />)

    const friday = screen.getByRole('gridcell', {
      name: /friday, july 17, 2026/i,
    })
    await user.click(friday)

    expect(screen.getByText('1 more appointments')).toBeInTheDocument()
    const firstAppointment = screen.getByRole('button', {
      name: /08:00, patient a, consultation, confirmed/i,
    })
    await user.click(firstAppointment)
    expect(onSelectAppointment).toHaveBeenCalledWith('a')

    await user.click(friday)
    expect(onViewChange).toHaveBeenCalledWith('day')
  })

  it('navigates months only when the swipe starts and ends on the month grid', () => {
    const onNavigateMonth = vi.fn()
    render(
      <MobileMonthCalendar
        appointments={[]}
        config={config}
        selectedDate="2026-07-16"
        onSelectDate={() => {}}
        onSelectAppointment={() => {}}
        onNavigateMonth={onNavigateMonth}
        onViewChange={(_view: CalendarView) => {}}
      />,
    )

    const grid = screen.getByTestId('month-grid')
    fireEvent.touchStart(grid, {
      touches: [{ clientX: 260, clientY: 100 }],
    })
    fireEvent.touchEnd(grid, {
      changedTouches: [{ clientX: 80, clientY: 104 }],
    })
    expect(onNavigateMonth).toHaveBeenCalledWith(1)

    fireEvent.touchStart(screen.getByTestId('month-mini-agenda'), {
      touches: [{ clientX: 260, clientY: 100 }],
    })
    fireEvent.touchEnd(screen.getByTestId('month-mini-agenda'), {
      changedTouches: [{ clientX: 80, clientY: 104 }],
    })
    expect(onNavigateMonth).toHaveBeenCalledTimes(1)
  })
})
