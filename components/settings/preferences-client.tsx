'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, LocateFixed, Save } from 'lucide-react'
import { useWorkspace, formatMoney } from '@/lib/workspace-context'
import { useT } from '@/lib/i18n/use-t'
import {
  getBusinessSettings,
  roundApproximateCoordinate,
  updateBusinessSettings,
  type BusinessLocationCapture,
} from '@/lib/api/working-hours'
import { CURRENCIES, LANGUAGES } from '@/lib/types/db'
import { PageHeader } from '@/components/common/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  PHONE_WEEK_LAYOUT_STORAGE_KEY,
  parsePhoneWeekLayout,
  type PhoneWeekLayout,
} from '@/lib/calendar/week-layout'

const EMPTY_LOCATION: BusinessLocationCapture = {
  location_latitude: null,
  location_longitude: null,
  location_accuracy_meters: null,
  location_source: null,
  location_captured_at: null,
}

function geolocationCapturedAt(timestamp: number) {
  if (Number.isFinite(timestamp)) {
    const capturedAt = new Date(timestamp)
    if (!Number.isNaN(capturedAt.getTime())) return capturedAt.toISOString()
  }
  return new Date().toISOString()
}

// Business preferences that aren't tied to the daily flow. Currency lives on the
// existing business.currency column (no schema change); saving refreshes the
// server components so amounts re-render in the chosen currency everywhere.
export function PreferencesClient() {
  const { business } = useWorkspace()
  const { t } = useT()
  const router = useRouter()
  const businessId = business?.id ?? ''
  const [currency, setCurrency] = useState(business?.currency || 'EUR')
  const [language, setLanguage] = useState(business?.language || 'en')
  const [address, setAddress] = useState(business?.address ?? '')
  const [city, setCity] = useState(business?.city ?? '')
  const [postalCode, setPostalCode] = useState(business?.postal_code ?? '')
  const [storedAddress, setStoredAddress] = useState(business?.address ?? '')
  const [storedCity, setStoredCity] = useState(business?.city ?? '')
  const [storedPostalCode, setStoredPostalCode] = useState(business?.postal_code ?? '')
  const [location, setLocation] =
    useState<BusinessLocationCapture>(EMPTY_LOCATION)
  const [locationDirty, setLocationDirty] = useState(false)
  const editedAddressFieldsRef = useRef({
    address: false,
    city: false,
    postalCode: false,
  })
  const [loadStatus, setLoadStatus] = useState<
    'loading' | 'loaded' | 'error'
  >(businessId ? 'loading' : 'error')
  const [locationStatus, setLocationStatus] = useState<
    'idle' | 'locating' | 'ready' | 'denied' | 'error' | 'unsupported'
  >('idle')
  const [saving, setSaving] = useState(false)
  const [phoneWeekLayout, setPhoneWeekLayout] =
    useState<PhoneWeekLayout>('grid')

  useEffect(() => {
    setPhoneWeekLayout(parsePhoneWeekLayout(
      localStorage.getItem(PHONE_WEEK_LAYOUT_STORAGE_KEY),
    ))
  }, [])

  useEffect(() => {
    if (!businessId) {
      setLoadStatus('error')
      return
    }
    let active = true
    editedAddressFieldsRef.current = {
      address: false,
      city: false,
      postalCode: false,
    }
    setLoadStatus('loading')
    setLocationDirty(false)
    getBusinessSettings(businessId)
      .then((settings) => {
        if (!active) return
        const nextAddress = settings?.address ?? ''
        const nextCity = settings?.city ?? ''
        const nextPostalCode = settings?.postal_code ?? ''
        if (!editedAddressFieldsRef.current.address) setAddress(nextAddress)
        if (!editedAddressFieldsRef.current.city) setCity(nextCity)
        if (!editedAddressFieldsRef.current.postalCode) {
          setPostalCode(nextPostalCode)
        }
        setStoredAddress(nextAddress)
        setStoredCity(nextCity)
        setStoredPostalCode(nextPostalCode)
        const nextLocation: BusinessLocationCapture = {
          location_latitude: settings?.location_latitude ?? null,
          location_longitude: settings?.location_longitude ?? null,
          location_accuracy_meters: settings?.location_accuracy_meters ?? null,
          location_source: settings?.location_source ?? null,
          location_captured_at: settings?.location_captured_at ?? null,
        }
        setLocation(nextLocation)
        setLocationStatus(
          nextLocation.location_latitude !== null ? 'ready' : 'idle',
        )
        setLoadStatus('loaded')
      })
      .catch(() => {
        if (active) setLoadStatus('error')
      })
    return () => { active = false }
  }, [businessId])

  const dirty = loadStatus === 'loaded' && (
    currency !== business?.currency
    || language !== business?.language
    || address !== storedAddress
    || city !== storedCity
    || postalCode !== storedPostalCode
    || locationDirty
  )

  function captureApproximatePosition() {
    if (loadStatus !== 'loaded') return
    if (!navigator.geolocation) {
      setLocationStatus('unsupported')
      return
    }
    setLocationStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          location_latitude: roundApproximateCoordinate(position.coords.latitude),
          location_longitude: roundApproximateCoordinate(position.coords.longitude),
          location_accuracy_meters: Math.round(Math.max(0, position.coords.accuracy)),
          location_source: 'device_geolocation',
          location_captured_at: geolocationCapturedAt(position.timestamp),
        })
        setLocationDirty(true)
        setLocationStatus('ready')
      },
      (error) => {
        setLocationStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'error')
      },
      {
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 300_000,
      },
    )
  }

  async function save() {
    if (!businessId || loadStatus !== 'loaded') return
    setSaving(true)
    try {
      const nextAddress = address.trim()
      const nextCity = city.trim()
      const nextPostalCode = postalCode.trim()
      const locationPatch = locationDirty ? location : {}
      await updateBusinessSettings(businessId, {
        currency,
        language,
        address: nextAddress || null,
        city: nextCity || null,
        postal_code: nextPostalCode || null,
        ...locationPatch,
      })
      setAddress(nextAddress)
      setCity(nextCity)
      setPostalCode(nextPostalCode)
      setStoredAddress(nextAddress)
      setStoredCity(nextCity)
      setStoredPostalCode(nextPostalCode)
      setLocationDirty(false)
      toast.success(t('prefs.saved'))
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Link href="/settings" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {t('nav.settings')}</Link>
      <PageHeader title={t('prefs.title')} description={t('prefs.subtitle')} />
      <Card className="max-w-lg shadow-sm">
        <CardHeader><CardTitle className="text-base">{t('prefs.cardTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('prefs.language')}</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t('prefs.currency')}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('prefs.preview')}: {formatMoney(1234.5, currency)}</p>
          </div>
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold">{t('prefs.studioLocation')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t('prefs.studioLocationHint')}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="studio-address">{t('prefs.address')}</Label>
            <Input
              id="studio-address"
              value={address}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                editedAddressFieldsRef.current.address = true
                setAddress(event.target.value)
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="studio-city">{t('prefs.city')}</Label>
              <Input
                id="studio-city"
                value={city}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  editedAddressFieldsRef.current.city = true
                  setCity(event.target.value)
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="studio-postal-code">{t('prefs.postalCode')}</Label>
              <Input
                id="studio-postal-code"
                value={postalCode}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  editedAddressFieldsRef.current.postalCode = true
                  setPostalCode(event.target.value)
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={captureApproximatePosition}
              disabled={loadStatus !== 'loaded' || locationStatus === 'locating'}
            >
              {locationStatus === 'locating'
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <LocateFixed className="h-4 w-4" />}
              {locationStatus === 'locating'
                ? t('prefs.locatingPosition')
                : t('prefs.useApproximatePosition')}
            </Button>
            {locationStatus === 'ready' && (
              <p className="text-xs text-muted-foreground" role="status">
                {t('prefs.positionReady')}
              </p>
            )}
            {locationStatus === 'denied' && (
              <p className="text-xs text-destructive" role="alert">
                {t('prefs.positionDenied')}
              </p>
            )}
            {locationStatus === 'error' && (
              <p className="text-xs text-destructive" role="alert">
                {t('prefs.positionUnavailable')}
              </p>
            )}
            {locationStatus === 'unsupported' && (
              <p className="text-xs text-destructive" role="alert">
                {t('prefs.positionUnsupported')}
              </p>
            )}
            {loadStatus === 'error' && (
              <p className="text-xs text-destructive" role="alert">
                {t('prefs.loadError')}
              </p>
            )}
          </div>
          <Button
            onClick={save}
            disabled={loadStatus !== 'loaded' || saving || !dirty}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} {t('common.save')}
          </Button>
        </CardContent>
      </Card>
      <Card className="mt-6 max-w-lg shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">{t('prefs.calendarTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="phone-week-layout">
            {t('prefs.phoneWeekLayout')}
          </Label>
          <select
            id="phone-week-layout"
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={phoneWeekLayout}
            onChange={(event) => {
              const value = parsePhoneWeekLayout(event.target.value)
              setPhoneWeekLayout(value)
              localStorage.setItem(PHONE_WEEK_LAYOUT_STORAGE_KEY, value)
            }}
          >
            <option value="grid">{t('prefs.phoneWeekGrid')}</option>
            <option value="timeline">{t('prefs.phoneWeekTimeline')}</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {t('prefs.phoneWeekLayoutHint')}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
