'use client'

import { useState } from 'react'
import { CalendarController } from './calendar-controller'
import { DayMap } from './day-map'
import { useWorkspace } from '@/lib/workspace-context'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CalendarClient() {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  // The map below follows the day currently selected in the calendar.
  const [day, setDay] = useState(todayStr())

  return (
    <div className="space-y-6">
      <CalendarController onSelectedDateChange={setDay} />
      {businessId && <DayMap businessId={businessId} date={day} />}
    </div>
  )
}
