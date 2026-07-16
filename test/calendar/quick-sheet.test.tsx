import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppointmentForm } from '@/components/calendar/appointment-form'
import { AppointmentQuickSheet } from '@/components/calendar/appointment-quick-sheet'
import { MoveAppointmentSheet } from '@/components/calendar/move-appointment-sheet'
import type { CalendarAppointment } from '@/lib/api/appointments'
import {
  createAppointment,
  deleteAppointment,
} from '@/lib/api/appointments'
import {
  CalendarMutationError,
  mutateCalendarOrThrow,
} from '@/lib/api/calendar'
import {
  WorkspaceProvider,
  type WorkspaceBusiness,
} from '@/lib/workspace-context'

vi.mock('@/components/ui/button', async () => {
  const React = await import('react')
  return {
    Button: React.forwardRef(function TestButton(
      {
        asChild,
        children,
        ...props
      }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
        asChild?: boolean
      },
      ref: React.ForwardedRef<HTMLButtonElement>,
    ) {
      if (asChild) return children
      return <button ref={ref} {...props}>{children}</button>
    }),
  }
})

vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
    open ? <div>{children}</div> : null
  ),
  DrawerClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DrawerFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
  AlertDialogCancel: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}))

vi.mock('@/components/ui/label', () => ({
  Label: (props: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props} />,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}))

vi.mock('@/components/ui/switch', () => ({
  Switch: (props: { checked?: boolean; onCheckedChange?(value: boolean): void }) => (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      onClick={() => props.onCheckedChange?.(!props.checked)}
    />
  ),
}))

vi.mock('@/lib/api/appointments', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/appointments')>()
  return {
    ...original,
    listPatientsForSelect: vi.fn().mockResolvedValue([]),
    createAppointment: vi.fn(),
    deleteAppointment: vi.fn(),
  }
})

vi.mock('@/lib/api/services', () => ({
  listServices: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/api/calendar', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/calendar')>()
  return {
    ...original,
    mutateCalendarOrThrow: vi.fn(),
  }
})

vi.mock('@/lib/voice/use-speech', () => ({
  speechLang: () => 'en-US',
  useSpeech: () => ({
    supported: false,
    listening: false,
    start: vi.fn(),
    stop: vi.fn(),
  }),
}))

const business: WorkspaceBusiness = {
  id: '00000000-0000-4000-8000-000000000001',
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

const appointment: CalendarAppointment = {
  id: '00000000-0000-4000-8000-000000000002',
  appointment_date: '2026-07-16',
  start_time: '09:15:00',
  end_time: '10:00:00',
  duration_minutes: 45,
  status: 'scheduled',
  color: '#6d4bd8',
  title: 'Physio',
  price: 50,
  patient_id: '00000000-0000-4000-8000-000000000003',
  service_id: '00000000-0000-4000-8000-000000000004',
  locked: false,
  version: 1,
  manual_override: false,
  patients: {
    first_name: 'Marco',
    last_name: 'Rossi',
    full_name: 'Marco Rossi',
    color: null,
    phone: '+39 333 123 4567',
    email: 'marco@example.com',
  },
  services: {
    name: 'Physio',
    color: '#6d4bd8',
    buffer_before_minutes: 0,
    buffer_after_minutes: 0,
    max_daily_bookings: null,
  },
}

function renderForm({
  currentBusiness = business,
  currentAppointment,
  defaultDate = '2026-07-16',
  useBusinessToday = false,
}: {
  currentBusiness?: WorkspaceBusiness
  currentAppointment?: CalendarAppointment
  defaultDate?: string
  useBusinessToday?: boolean
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceProvider business={currentBusiness}>
        <AppointmentForm
          businessId={currentBusiness.id}
          appointment={currentAppointment}
          defaultDate={useBusinessToday ? undefined : defaultDate}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </WorkspaceProvider>
    </QueryClientProvider>,
  )
}

describe('AppointmentQuickSheet', () => {
  it('shows details, safe contact links, lock state, and primary actions', async () => {
    const onMove = vi.fn()
    const onToggleLock = vi.fn()
    render(
      <AppointmentQuickSheet
        open
        appointment={appointment}
        onOpenChange={() => {}}
        onMove={onMove}
        onEdit={() => {}}
        onToggleLock={onToggleLock}
        onDuplicate={() => {}}
        onDelete={() => {}}
      />,
    )

    expect(screen.getByText('Marco Rossi')).toBeInTheDocument()
    expect(screen.getByText(/unlocked/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /call/i })).toHaveAttribute(
      'href',
      'tel:+393331234567',
    )
    expect(screen.getByRole('link', { name: /email/i })).toHaveAttribute(
      'href',
      'mailto:marco@example.com',
    )

    await userEvent.click(screen.getByRole('button', { name: /move/i }))
    await userEvent.click(screen.getByRole('button', { name: /^lock$/i }))
    expect(onMove).toHaveBeenCalledOnce()
    expect(onToggleLock).toHaveBeenCalledOnce()
  })

  it('requires explicit confirmation before delete', async () => {
    const onDelete = vi.fn()
    render(
      <AppointmentQuickSheet
        open
        appointment={appointment}
        onOpenChange={() => {}}
        onMove={() => {}}
        onEdit={() => {}}
        onToggleLock={() => {}}
        onDuplicate={() => {}}
        onDelete={onDelete}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(onDelete).not.toHaveBeenCalled()
    await userEvent.click(
      screen.getByRole('button', { name: /delete appointment/i }),
    )
    expect(onDelete).toHaveBeenCalledOnce()
  })
})

describe('MoveAppointmentSheet', () => {
  beforeEach(() => {
    vi.mocked(mutateCalendarOrThrow).mockReset()
  })

  it('moves with one versioned request while preserving duration', async () => {
    vi.mocked(mutateCalendarOrThrow).mockResolvedValue({
      ok: true,
      appointment: { ...appointment, version: 2 },
      warnings: [],
    })
    const onMoved = vi.fn()
    render(
      <MoveAppointmentSheet
        businessId={business.id}
        open
        appointment={appointment}
        onOpenChange={() => {}}
        onMoved={onMoved}
      />,
    )

    const duration = screen.getByLabelText(/duration/i)
    expect(duration).toBeDisabled()
    await userEvent.clear(screen.getByLabelText(/^date$/i))
    await userEvent.type(screen.getByLabelText(/^date$/i), '2026-07-17')
    await userEvent.clear(screen.getByLabelText(/^start$/i))
    await userEvent.type(screen.getByLabelText(/^start$/i), '10:30')
    await userEvent.click(screen.getByRole('button', { name: /move appointment/i }))

    await waitFor(() => expect(mutateCalendarOrThrow).toHaveBeenCalledOnce())
    expect(mutateCalendarOrThrow).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'move',
      appointmentId: appointment.id,
      expectedVersion: 1,
      values: {
        appointment_date: '2026-07-17',
        start_time: '10:30:00',
        end_time: '11:15:00',
      },
    }))
    expect(onMoved).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }))
  })

  it('shows warnings and retries with exact codes and a new idempotency key', async () => {
    const warningRequest = {
      businessId: business.id,
      operation: 'move' as const,
      appointmentId: appointment.id,
      expectedVersion: 1,
      idempotencyKey: '00000000-0000-4000-8000-000000000010',
      values: {
        appointment_date: '2026-07-16',
        start_time: '09:15:00',
        end_time: '10:00:00',
      },
    }
    vi.mocked(mutateCalendarOrThrow)
      .mockRejectedValueOnce(new CalendarMutationError({
        ok: false,
        code: 'WARNING_CONFIRMATION',
        constraints: [{
          code: 'PREFERRED_TIME',
          level: 'warning',
          message: 'Marco prefers mornings.',
        }],
      }, warningRequest))
      .mockResolvedValueOnce({
        ok: true,
        appointment: { ...appointment, version: 2 },
        warnings: [],
      })

    render(
      <MoveAppointmentSheet
        businessId={business.id}
        open
        appointment={appointment}
        onOpenChange={() => {}}
        onMoved={() => {}}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /move appointment/i }))
    expect(await screen.findByText('Marco prefers mornings.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /move anyway/i }))

    await waitFor(() => expect(mutateCalendarOrThrow).toHaveBeenCalledTimes(2))
    const first = vi.mocked(mutateCalendarOrThrow).mock.calls[0][0]
    const retry = vi.mocked(mutateCalendarOrThrow).mock.calls[1][0]
    expect(retry.confirmWarnings).toEqual(['PREFERRED_TIME'])
    expect(retry.idempotencyKey).not.toBe(first.idempotencyKey)
  })
})

describe('AppointmentForm', () => {
  beforeEach(() => {
    vi.mocked(createAppointment).mockReset()
    vi.mocked(deleteAppointment).mockReset()
  })

  it('keeps optional optimizer controls collapsed behind More options', async () => {
    renderForm()

    expect(screen.queryByText(/client availability/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /more options/i }))
    expect(screen.getByText(/client availability/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /more options/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('blocks an appointment that would end after midnight before the API', async () => {
    renderForm()
    await userEvent.type(
      screen.getByPlaceholderText(/new client name/i),
      'Ada',
    )
    await userEvent.clear(screen.getByLabelText(/^start$/i))
    await userEvent.type(screen.getByLabelText(/^start$/i), '23:30')
    await userEvent.selectOptions(
      screen.getByLabelText(/duration/i),
      '60',
    )
    await userEvent.click(screen.getByRole('button', { name: /create/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/before midnight/i)
    expect(createAppointment).not.toHaveBeenCalled()
  })

  it('requires confirmation before deleting from the edit form', async () => {
    vi.mocked(deleteAppointment).mockResolvedValue(null)
    renderForm({ currentAppointment: appointment })

    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(deleteAppointment).not.toHaveBeenCalled()
    await userEvent.click(
      screen.getByRole('button', { name: /delete appointment/i }),
    )
    await waitFor(() => expect(deleteAppointment).toHaveBeenCalledOnce())
  })
})
