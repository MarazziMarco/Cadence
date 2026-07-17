'use client'

import { useState } from 'react'
import { CalendarController } from './calendar-controller'
import { DayMap } from './day-map'
import { useWorkspace } from '@/lib/workspace-context'
import { useT } from '@/lib/i18n/use-t'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CalendarClient() {
  const { business } = useWorkspace()
  const { t } = useT()
  const businessId = business?.id ?? ''
  const [mapDate, setMapDate] = useState(todayStr())

  return (
    <div className="space-y-6">
      <CalendarController />
      {businessId && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">{t('appt.date')}</Label>
            <Input type="date" value={mapDate} onChange={(e) => setMapDate(e.target.value)} className="w-44" />
          </div>
          <DayMap businessId={businessId} date={mapDate} />
        </div>
      )}
    </div>
  )
}
