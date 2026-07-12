'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FlaskConical, Loader2, CalendarPlus } from 'lucide-react'
import { seedDemoAppointments } from '@/lib/api/dev-seed'
import { useWorkspace } from '@/lib/workspace-context'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function LabClient() {
  const { business } = useWorkspace()
  const businessId = business?.id ?? ''
  const qc = useQueryClient()
  const [seeding, setSeeding] = useState(false)

  async function seed() {
    if (!businessId) return
    setSeeding(true)
    try {
      const n = await seedDemoAppointments(businessId)
      toast.success(`Added ${n} demo appointments across the next 4 weeks`)
      qc.invalidateQueries({ queryKey: ['appointments'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['schedule-health'] })
    } catch (e: any) {
      toast.error(e.message || 'Seeding failed')
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div>
      <PageHeader title="Experimental Lab" description="Dev-only tools and preview features." />
      <Card className="max-w-lg shadow-sm">
        <CardContent className="p-5">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium"><FlaskConical className="h-4 w-4 text-primary" /> Seed demo appointments</div>
          <p className="mb-4 text-sm text-muted-foreground">Fills the calendar with scattered fake appointments (creates sample clients if needed) over the next four weeks — handy for screenshots and demos. Runs on your logged-in account.</p>
          <Button onClick={seed} disabled={seeding || !businessId}>{seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarPlus className="mr-2 h-4 w-4" />} Seed demo appointments</Button>
        </CardContent>
      </Card>
    </div>
  )
}
