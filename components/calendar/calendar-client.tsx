'use client'

import { useState } from 'react'
import { CalendarController } from './calendar-controller'
import { DayRouteMap, type CalendarViewLike } from './day-route-map'
import { useWorkspace } from '@/lib/workspace-context'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CalendarClient() {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  // The day-route map below follows the calendar: the selected day (day/month
  // views) or a chip within the visible week (week view).
  const [day, setDay] = useState(todayStr())
  const [view, setView] = useState<CalendarViewLike>('week')
  const [range, setRange] = useState({ from: todayStr(), to: todayStr() })

  return (
    <div className="space-y-6">
      <CalendarController
        onSelectedDateChange={setDay}
        onViewChange={(v) => setView(v as CalendarViewLike)}
        onVisibleRangeChange={(from, to) => setRange({ from, to })}
      />
      {businessId && (
        <DayRouteMap
          businessId={businessId}
          view={view}
          selectedDate={day}
          rangeFrom={range.from}
          rangeTo={range.to}
        />
      )}
    </div>
  )
}
