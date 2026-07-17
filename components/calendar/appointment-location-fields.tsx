'use client'

import { APPOINTMENT_LOCATION_MODES, type AppointmentLocationMode } from '@/lib/types/db'
import { useT } from '@/lib/i18n/use-t'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface AppointmentLocationValue {
  mode: AppointmentLocationMode
  address: string
  city: string
  postalCode: string
}

export function emptyLocation(mode: AppointmentLocationMode = 'inherit'): AppointmentLocationValue {
  return { mode, address: '', city: '', postalCode: '' }
}

// Shared Automatic / Studio / Client / Custom location picker. `custom` reveals
// editable address fields; the other modes show a read-only effective address so
// the user always sees where the appointment resolves.
export function AppointmentLocationFields({
  value,
  onChange,
  studioAddress,
  patientAddress,
  idPrefix = 'appt-location',
}: {
  value: AppointmentLocationValue
  onChange: (next: AppointmentLocationValue) => void
  studioAddress?: string | null
  patientAddress?: string | null
  idPrefix?: string
}) {
  const { t } = useT()
  const modeLabel: Record<AppointmentLocationMode, string> = {
    inherit: t('loc.inherit'), studio: t('loc.studio'), patient: t('loc.patient'), custom: t('loc.custom'),
  }
  const effective = value.mode === 'studio' ? (studioAddress || null)
    : value.mode === 'patient' ? (patientAddress || null)
    : value.mode === 'inherit' ? (studioAddress || null)
    : null

  return (
    <div className="space-y-2">
      <Label>{t('loc.label')}</Label>
      <div className="flex flex-wrap gap-1.5">
        {APPOINTMENT_LOCATION_MODES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={value.mode === m}
            onClick={() => onChange({ ...value, mode: m })}
            className={cn(
              'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              value.mode === m ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-accent',
            )}
          >
            {modeLabel[m]}
          </button>
        ))}
      </div>

      {value.mode === 'custom' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`${idPrefix}-address`} className="text-xs">{t('loc.address')}</Label>
            <Input id={`${idPrefix}-address`} value={value.address} onChange={(e) => onChange({ ...value, address: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-city`} className="text-xs">{t('loc.city')}</Label>
            <Input id={`${idPrefix}-city`} value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-postal`} className="text-xs">{t('loc.postal')}</Label>
            <Input id={`${idPrefix}-postal`} value={value.postalCode} onChange={(e) => onChange({ ...value, postalCode: e.target.value })} />
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('loc.uses', { label: effective || t('loc.noAddress') })}
        </p>
      )}
    </div>
  )
}
