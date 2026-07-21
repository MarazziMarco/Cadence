import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PreferencesClient } from '@/components/settings/preferences-client'
import {
  getBusinessSettings,
  updateBusinessSettings,
  type BusinessSettings,
} from '@/lib/api/working-hours'

const refresh = vi.fn()
const getCurrentPosition = vi.fn()
const watchPosition = vi.fn()
const locationMigration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/202607160006_client_availability.sql',
  ),
  'utf8',
)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const loadedSettings: BusinessSettings = {
  id: 'business-1',
  default_appointment_duration: 30,
  slot_interval_minutes: 15,
  default_buffer_minutes: 0,
  max_daily_appointments: null,
  lunch_break_enabled: false,
  lunch_start: null,
  lunch_end: null,
  currency: 'EUR',
  language: 'en',
  address: 'Via Vecchia 1',
  city: 'Roma',
  postal_code: '00100',
  location_latitude: null,
  location_longitude: null,
  location_accuracy_meters: null,
  location_source: null,
  location_captured_at: null,
}

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/i18n/use-t', () => ({
  useT: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/workspace-context', () => ({
  useWorkspace: () => ({
    business: {
      id: 'business-1',
      currency: 'EUR',
      language: 'en',
    },
  }),
  formatMoney: () => '€1,234.50',
}))

vi.mock('@/lib/api/working-hours', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/working-hours')>()
  return {
    ...actual,
    getBusinessSettings: vi.fn(),
    updateBusinessSettings: vi.fn(),
  }
})

vi.mock('@/components/common/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
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

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
}))

vi.mock('@/components/ui/alert-dialog', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    AlertDialog: Pass, AlertDialogAction: Pass, AlertDialogCancel: Pass,
    AlertDialogContent: Pass, AlertDialogDescription: Pass, AlertDialogFooter: Pass,
    AlertDialogHeader: Pass, AlertDialogTitle: Pass,
  }
})

describe('studio location preferences', () => {
  beforeEach(() => {
    vi.useRealTimers()
    refresh.mockReset()
    getCurrentPosition.mockReset()
    watchPosition.mockReset()
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition, watchPosition },
    })
    vi.mocked(updateBusinessSettings).mockReset()
    vi.mocked(getBusinessSettings).mockResolvedValue(loadedSettings)
  })

  it('loads localized address fields and saves blanks as null', async () => {
    const user = userEvent.setup()
    vi.mocked(updateBusinessSettings).mockResolvedValue()

    render(<PreferencesClient />)

    const address = await screen.findByLabelText('prefs.address')
    const city = screen.getByLabelText('prefs.city')
    const postalCode = screen.getByLabelText('prefs.postalCode')

    expect(address).toHaveValue('Via Vecchia 1')
    expect(city).toHaveValue('Roma')
    expect(postalCode).toHaveValue('00100')

    await user.clear(address)
    await user.type(address, '  Via Nuova 20  ')
    await user.clear(city)
    await user.type(city, '   ')
    await user.clear(postalCode)
    await user.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => {
      expect(updateBusinessSettings).toHaveBeenCalledWith('business-1', {
        currency: 'EUR',
        language: 'en',
        address: 'Via Nuova 20',
        city: null,
        postal_code: null,
      })
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('gates actions during load and does not erase address edits when load resolves late', async () => {
    const user = userEvent.setup()
    const pending = deferred<BusinessSettings>()
    vi.mocked(getBusinessSettings).mockReturnValue(pending.promise)

    render(<PreferencesClient />)

    const address = screen.getByLabelText('prefs.address')
    const save = screen.getByRole('button', { name: 'common.save' })
    const capture = screen.getByRole('button', {
      name: 'prefs.useApproximatePosition',
    })
    expect(save).toBeDisabled()
    expect(capture).toBeDisabled()

    await user.type(address, 'Draft dell utente')
    await user.click(capture)
    expect(getCurrentPosition).not.toHaveBeenCalled()

    pending.resolve(loadedSettings)

    await waitFor(() => {
      expect(address).toHaveValue('Draft dell utente')
      expect(capture).toBeEnabled()
      expect(save).toBeEnabled()
    })
  })

  it('surfaces settings load failure and keeps save and capture disabled', async () => {
    const user = userEvent.setup()
    vi.mocked(getBusinessSettings).mockRejectedValue(new Error('offline'))

    render(<PreferencesClient />)

    expect(await screen.findByRole('alert')).toHaveTextContent('prefs.loadError')
    const save = screen.getByRole('button', { name: 'common.save' })
    const capture = screen.getByRole('button', {
      name: 'prefs.useApproximatePosition',
    })
    expect(save).toBeDisabled()
    expect(capture).toBeDisabled()

    await user.click(save)
    await user.click(capture)
    expect(updateBusinessSettings).not.toHaveBeenCalled()
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('does not resend untouched stored location metadata', async () => {
    const user = userEvent.setup()
    vi.mocked(updateBusinessSettings).mockResolvedValue()
    vi.mocked(getBusinessSettings).mockResolvedValue({
      ...loadedSettings,
      location_latitude: 41.90278,
      location_longitude: 12.49637,
      location_accuracy_meters: 19,
      location_source: 'device_geolocation',
      location_captured_at: '2026-07-15T08:00:00.000Z',
    })

    render(<PreferencesClient />)

    const address = await screen.findByLabelText('prefs.address')
    await user.clear(address)
    await user.type(address, 'Via Nuova 30')
    await user.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => expect(updateBusinessSettings).toHaveBeenCalled())
    const patch = vi.mocked(updateBusinessSettings).mock.calls[0][1]
    expect(patch).not.toHaveProperty('location_latitude')
    expect(patch).not.toHaveProperty('location_longitude')
    expect(patch).not.toHaveProperty('location_accuracy_meters')
    expect(patch).not.toHaveProperty('location_source')
    expect(patch).not.toHaveProperty('location_captured_at')
  })

  it('captures one approximate position, rounds it, and persists capture metadata', async () => {
    const user = userEvent.setup()
    vi.mocked(updateBusinessSettings).mockResolvedValue()
    const capturedAt = Date.parse('2026-07-14T10:20:30.000Z')
    getCurrentPosition.mockImplementation((success: PositionCallback) => {
      success({
        coords: {
          latitude: 41.9027833,
          longitude: 12.4963655,
          accuracy: 18.6,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: capturedAt,
        toJSON: () => ({}),
      })
    })

    render(<PreferencesClient />)
    await screen.findByLabelText('prefs.address')

    await user.click(screen.getByRole('button', {
      name: 'prefs.useApproximatePosition',
    }))

    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ enableHighAccuracy: false }),
    )
    expect(watchPosition).not.toHaveBeenCalled()
    expect(screen.getByText('prefs.positionReady')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'common.save' }))

    await waitFor(() => {
      expect(updateBusinessSettings).toHaveBeenCalledWith(
        'business-1',
        expect.objectContaining({
          location_latitude: 41.90278,
          location_longitude: 12.49637,
          location_accuracy_meters: 19,
          location_source: 'device_geolocation',
          location_captured_at: '2026-07-14T10:20:30.000Z',
        }),
      )
    })
  })

  it('shows a localized permission error without starting a watcher', async () => {
    const user = userEvent.setup()
    getCurrentPosition.mockImplementation((
      _success: PositionCallback,
      error: PositionErrorCallback,
    ) => {
      error({
        code: 1,
        message: 'Permission denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      })
    })

    render(<PreferencesClient />)
    await screen.findByLabelText('prefs.address')
    await user.click(screen.getByRole('button', {
      name: 'prefs.useApproximatePosition',
    }))

    expect(screen.getByText('prefs.positionDenied')).toBeInTheDocument()
    expect(watchPosition).not.toHaveBeenCalled()
  })

  it('adds constrained business coordinate capture columns', () => {
    expect(locationMigration).toMatch(
      /alter table public\.business[\s\S]+location_latitude double precision[\s\S]+location_longitude double precision[\s\S]+location_accuracy_meters double precision[\s\S]+location_source text[\s\S]+location_captured_at timestamptz/i,
    )
    expect(locationMigration).toMatch(
      /business_location_latitude_check[\s\S]+between -90 and 90[\s\S]+round\(location_latitude::numeric, 5\)/i,
    )
    expect(locationMigration).toMatch(
      /business_location_longitude_check[\s\S]+between -180 and 180[\s\S]+round\(location_longitude::numeric, 5\)/i,
    )
    expect(locationMigration).toMatch(
      /business_location_source_check[\s\S]+device_geolocation/i,
    )
    expect(locationMigration).toMatch(
      /business_location_capture_check[\s\S]+location_accuracy_meters[\s\S]+location_captured_at/i,
    )
  })
})
