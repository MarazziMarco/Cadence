import { render, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

import { OptimizeDialog } from '@/components/calendar/optimize-dialog'
import {
  ensureAlgorithmSettings,
  fetchRun,
  runOptimization,
} from '@/lib/api/scheduler'
import {
  WorkspaceProvider,
  type WorkspaceBusiness,
} from '@/lib/workspace-context'

vi.mock('@/lib/api/scheduler', () => ({
  ensureAlgorithmSettings: vi.fn(),
  runOptimization: vi.fn(),
  fetchRun: vi.fn(),
}))

vi.mock('@/components/ui/button', () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/calendar/optimize-preview', () => ({
  OptimizePreview: () => null,
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

beforeEach(() => {
  vi.mocked(ensureAlgorithmSettings).mockResolvedValue(undefined)
  vi.mocked(runOptimization).mockResolvedValue('run-1')
  vi.mocked(fetchRun).mockResolvedValue({ run: {}, changes: [] } as never)
})

it('starts optimization when a controlled dialog is opened externally', async () => {
  const { rerender } = render(
    <WorkspaceProvider business={business}>
      <OptimizeDialog
        businessId={business.id}
        dateFrom="2026-07-16"
        dateTo="2026-07-16"
        open={false}
        onOpenChange={() => {}}
      />
    </WorkspaceProvider>,
  )

  rerender(
    <WorkspaceProvider business={business}>
      <OptimizeDialog
        businessId={business.id}
        dateFrom="2026-07-16"
        dateTo="2026-07-16"
        open
        onOpenChange={() => {}}
      />
    </WorkspaceProvider>,
  )

  await waitFor(() => {
    expect(runOptimization).toHaveBeenCalledWith(
      business.id,
      '2026-07-16',
      '2026-07-16',
    )
  })
})
