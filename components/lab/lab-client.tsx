'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FlaskConical, Loader2, CalendarPlus } from 'lucide-react'
import { seedDemoAppointments } from '@/lib/api/dev-seed'
import { invalidateCalendarAppointments } from '@/lib/calendar/query-keys'
import { useWorkspace } from '@/lib/workspace-context'
import { useT } from '@/lib/i18n/use-t'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function LabClient() {
  const { business } = useWorkspace()
  const { t } = useT()
  const businessId = business?.id ?? ''
  const qc = useQueryClient()
  const [seeding, setSeeding] = useState(false)

  async function seed() {
    if (!businessId) return
    setSeeding(true)
    try {
      const n = await seedDemoAppointments(businessId)
      toast.success(t('lab.seeded', { n }))
      invalidateCalendarAppointments(qc, businessId)
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['schedule-health'] })
    } catch (e: any) {
      toast.error(t('lab.seedFailed'))
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div>
      <PageHeader title={t('lab.title')} description={t('lab.subtitle')} />
      <Card className="max-w-lg shadow-sm">
        <CardContent className="p-5">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium"><FlaskConical className="h-4 w-4 text-primary" /> {t('lab.seedTitle')}</div>
          <p className="mb-4 text-sm text-muted-foreground">{t('lab.seedDesc')}</p>
          <Button onClick={seed} disabled={seeding || !businessId}>{seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />} {t('lab.seedBtn')}</Button>
        </CardContent>
      </Card>
    </div>
  )
}
