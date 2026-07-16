import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LabClient } from '@/components/lab/lab-client'
import { seedDemoAppointments } from '@/lib/api/dev-seed'
import { calendarKeys } from '@/lib/calendar/query-keys'
import {
  WorkspaceProvider,
  type WorkspaceBusiness,
} from '@/lib/workspace-context'

vi.mock('@/lib/api/dev-seed', () => ({
  seedDemoAppointments: vi.fn(),
}))

vi.mock('@/lib/i18n/use-t', () => ({
  useT: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/components/common/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
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

describe('appointment mutation consumers', () => {
  it('invalidates the canonical calendar after demo appointments are seeded', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    vi.mocked(seedDemoAppointments).mockResolvedValue(4)

    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceProvider business={business}>
          <LabClient />
        </WorkspaceProvider>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'lab.seedBtn' }))

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: calendarKeys.all(business.id),
      })
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['appointments'],
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['dashboard'],
    })
  })
})
