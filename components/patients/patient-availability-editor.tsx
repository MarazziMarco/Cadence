'use client'

import {
  DAY_AVAILABILITY_STATES,
  type DayAvailabilityState,
  type WeeklyAvailability,
} from '@/lib/api/patients'
import { WEEKDAYS, WEEKDAY_LABELS, type Weekday } from '@/lib/types/db'

const STATE_LABELS: Record<DayAvailabilityState, string> = {
  unavailable: 'Unavailable',
  all_day: 'All day',
  morning_only: 'Morning only',
  afternoon_only: 'Afternoon only',
  prefer_morning: 'Prefer morning',
  prefer_afternoon: 'Prefer afternoon',
}

export function PatientAvailabilityEditor({
  value,
  onChange,
  disabled = false,
  weekdayLabels,
  stateLabels,
}: {
  value: WeeklyAvailability
  onChange(next: WeeklyAvailability): void
  disabled?: boolean
  weekdayLabels?: Partial<Record<Weekday, string>>
  stateLabels?: Partial<Record<DayAvailabilityState, string>>
}) {
  return (
    <div className="space-y-2" data-testid="patient-availability-editor">
      {WEEKDAYS.map((weekday) => (
        <div
          key={weekday}
          className="grid grid-cols-[minmax(5.5rem,1fr)_minmax(9rem,1.5fr)] items-center gap-2"
        >
          <label
            htmlFor={`patient-availability-${weekday}`}
            className="text-xs font-medium capitalize"
          >
            {weekdayLabels?.[weekday] ?? WEEKDAY_LABELS[weekday]}
          </label>
          <select
            id={`patient-availability-${weekday}`}
            value={value[weekday]}
            disabled={disabled}
            onChange={(event) => onChange({
              ...value,
              [weekday]: event.target.value as DayAvailabilityState,
            })}
            className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {DAY_AVAILABILITY_STATES.map((state) => (
              <option key={state} value={state}>
                {stateLabels?.[state] ?? STATE_LABELS[state]}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  )
}
