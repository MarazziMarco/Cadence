import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PatientFormDialog } from '@/components/patients/patient-form-dialog'
import { PatientProfile } from '@/components/patients/patient-profile'
import {
  createPatient,
  getPatient,
  updatePatient,
} from '@/lib/api/patients'
import {
  WorkspaceProvider,
  type WorkspaceBusiness,
} from '@/lib/workspace-context'
import type { Patient } from '@/lib/types/db'

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/i18n/use-t', () => ({
  useT: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/api/patients', () => ({
  createPatient: vi.fn(),
  getPatient: vi.fn(),
  updatePatient: vi.fn(),
  setPatientFlag: vi.fn(),
  softDeletePatient: vi.fn(),
}))

vi.mock('@/lib/api/appointments', () => ({
  listUpcomingByPatient: vi.fn(async () => []),
  fmtTime: (value: string) => value.slice(0, 5),
}))

vi.mock('@/lib/api/treatment-plans', () => ({
  getPatientPlans: vi.fn(async () => []),
  deleteTreatmentPlan: vi.fn(),
}))

vi.mock('@/components/calendar/appointment-dialog', () => ({
  AppointmentDialog: () => null,
}))

vi.mock('@/components/patients/treatment-plan-dialog', () => ({
  TreatmentPlanDialog: () => null,
}))

vi.mock('@/components/patients/treatment-plan-edit-dialog', () => ({
  TreatmentPlanEditDialog: () => null,
}))

vi.mock('@/components/patients/patient-notes', () => ({
  PatientNotes: () => null,
}))

vi.mock('@/components/ui/button', () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/components/ui/label', () => ({
  Label: (props: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props} />,
}))

vi.mock('@/components/ui/textarea', () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  ),
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => <div>loading</div>,
}))

vi.mock('@/components/ui/progress', () => ({
  Progress: () => <div />,
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
    open ? <div>{children}</div> : null
  ),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

const patient: Patient = {
  id: 'patient-1',
  business_id: business.id,
  first_name: 'Ada',
  last_name: 'Rossi',
  full_name: 'Ada Rossi',
  email: null,
  phone: null,
  address: 'Via Roma 10',
  city: 'Roma',
  postal_code: '00100',
  notes: null,
  color: '#4f46e5',
  tags: null,
  is_active: true,
  is_vip: false,
  blacklisted: false,
  archived: false,
  preferred_service_id: null,
  preferred_duration_minutes: null,
  total_appointments: 0,
  no_show_count: 0,
  total_spent: 0,
}

function renderWithProviders(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider business={business}>
        {node}
      </WorkspaceProvider>
    </QueryClientProvider>,
  )
}

describe('patient location', () => {
  beforeEach(() => {
    vi.mocked(createPatient).mockReset()
    vi.mocked(updatePatient).mockReset()
    vi.mocked(getPatient).mockReset()
  })

  it('saves client address fields and normalizes blanks to null', async () => {
    const user = userEvent.setup()
    vi.mocked(createPatient).mockResolvedValue(patient)

    renderWithProviders(
      <PatientFormDialog
        businessId={business.id}
        open
        onOpenChange={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('patf.first'), 'Ada')
    await user.type(screen.getByLabelText('patf.address'), '  Via Roma 10  ')
    await user.type(screen.getByLabelText('patf.city'), '   ')
    await user.click(screen.getByRole('button', { name: 'patf.addClient' }))

    await waitFor(() => {
      expect(createPatient).toHaveBeenCalledWith(business.id, expect.objectContaining({
        first_name: 'Ada',
        address: 'Via Roma 10',
        city: null,
        postal_code: null,
      }))
    })
  })

  it('displays the effective stored client address on the profile', async () => {
    vi.mocked(getPatient).mockResolvedValue(patient)

    renderWithProviders(<PatientProfile id={patient.id} />)

    expect(await screen.findByText('Via Roma 10, 00100 Roma')).toBeInTheDocument()
    expect(screen.getByText('patient.location')).toBeInTheDocument()
  })
})
