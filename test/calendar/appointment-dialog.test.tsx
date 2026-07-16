import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { AppointmentDialog } from '@/components/calendar/appointment-dialog'

vi.mock('@/components/calendar/appointment-form', () => ({
  AppointmentForm: (props: {
    onCancel(): void
    onDirtyChange?(dirty: boolean): void
  }) => {
    const [value, setValue] = useState('')
    return (
      <div>
        <input
          aria-label="Appointment note"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            props.onDirtyChange?.(true)
          }}
        />
        <button onClick={props.onCancel}>Cancel form</button>
      </div>
    )
  },
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: (props: {
    open: boolean
    onOpenChange(open: boolean): void
    children: React.ReactNode
  }) => props.open ? (
    <div>
      {props.children}
      <button onClick={() => props.onOpenChange(false)}>Dismiss dialog</button>
    </div>
  ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/drawer', () => ({
  Drawer: (props: {
    open: boolean
    onOpenChange(open: boolean): void
    children: React.ReactNode
  }) => props.open ? (
    <div>
      {props.children}
      <button onClick={() => props.onOpenChange(false)}>Dismiss drawer</button>
    </div>
  ) : null,
  DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: (props: {
    open?: boolean
    children: React.ReactNode
  }) => props.open ? <div>{props.children}</div> : null,
  AlertDialogAction: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
  AlertDialogCancel: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

describe('AppointmentDialog', () => {
  it('guards Cancel and drawer dismissal when the form is dirty', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()
    render(
      <AppointmentDialog
        businessId="business-1"
        open
        presentation="drawer"
        onOpenChange={onOpenChange}
      />,
    )

    await user.type(screen.getByLabelText('Appointment note'), 'keep this')
    await user.click(screen.getByRole('button', { name: 'Cancel form' }))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByText(/discard unsaved changes/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /keep editing/i }))
    await user.click(screen.getByRole('button', { name: 'Dismiss drawer' }))
    expect(onOpenChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /discard changes/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
