'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Check, ChevronLeft, ChevronRight, Loader2, Building2, Clock, Timer, Globe } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/brand/logo'
import { Disclaimer } from '@/components/legal/disclaimer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { normalizeLocale, translate, bcp47 } from '@/lib/i18n'
import {
  BUSINESS_TYPES, BUSINESS_TYPE_LABELS, WEEKDAYS, WEEKDAY_LABELS,
  LANGUAGES, TIMEZONES, CURRENCIES, type Weekday,
} from '@/lib/types/db'

type DayState = { is_open: boolean; morning_start: string; morning_end: string; afternoon_start: string; afternoon_end: string }

const defaultDay = (open: boolean): DayState => ({
  is_open: open, morning_start: '09:00', morning_end: '13:00', afternoon_start: '14:00', afternoon_end: '18:00',
})

const STEP_KEYS = ['onb.step.business', 'onb.step.hours', 'onb.step.appts', 'onb.step.prefs']
const STEP_ICONS = [Building2, Clock, Timer, Globe]

export function OnboardingWizard({ defaultFirstName, defaultLastName }: { defaultFirstName: string; defaultLastName: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  const [firstName, setFirstName] = useState(defaultFirstName)
  const [lastName, setLastName] = useState(defaultLastName)
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState<string>('other')

  const [days, setDays] = useState<Record<Weekday, DayState>>(() => {
    const init = {} as Record<Weekday, DayState>
    WEEKDAYS.forEach((d) => { init[d] = defaultDay(d !== 'saturday' && d !== 'sunday') })
    return init
  })
  const [lunchEnabled, setLunchEnabled] = useState(true)
  const [lunchStart, setLunchStart] = useState('13:00')
  const [lunchEnd, setLunchEnd] = useState('14:00')

  const [duration, setDuration] = useState('30')
  const [maxDaily, setMaxDaily] = useState('')

  const [timezone, setTimezone] = useState('Europe/Rome')
  const [language, setLanguage] = useState('en')
  const [currency, setCurrency] = useState('EUR')

  // Live-translate to the language currently picked in the wizard (no business yet).
  const t = (k: string, vars?: Record<string, string | number>) => translate(normalizeLocale(language), k, vars)
  const dloc = bcp47(normalizeLocale(language))

  function updateDay(d: Weekday, patch: Partial<DayState>) {
    setDays((prev) => ({ ...prev, [d]: { ...prev[d], ...patch } }))
  }

  const canProceed = step !== 0 || businessName.trim().length > 0

  async function finish() {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error: pErr } = await supabase.from('profiles').update({
        first_name: firstName || null,
        last_name: lastName || null,
        display_name: [firstName, lastName].filter(Boolean).join(' ') || null,
        language, timezone, onboarding_completed: true,
      }).eq('id', user.id)
      if (pErr) throw pErr

      const { data: biz, error: bErr } = await supabase.from('business').insert({
        profile_id: user.id,
        business_name: businessName.trim(),
        business_type: businessType,
        timezone, language, currency,
        default_appointment_duration: parseInt(duration) || 30,
        max_daily_appointments: maxDaily ? parseInt(maxDaily) : null,
        lunch_break_enabled: lunchEnabled,
        lunch_start: lunchEnabled ? lunchStart : null,
        lunch_end: lunchEnabled ? lunchEnd : null,
      }).select('id').single()
      if (bErr) throw bErr

      const rows = WEEKDAYS.map((d) => {
        const s = days[d]
        return {
          business_id: biz.id, weekday: d, is_open: s.is_open,
          morning_start: s.is_open ? s.morning_start : null,
          morning_end: s.is_open ? s.morning_end : null,
          afternoon_start: s.is_open ? s.afternoon_start : null,
          afternoon_end: s.is_open ? s.afternoon_end : null,
        }
      })
      const { error: wErr } = await supabase.from('working_hours').insert(rows)
      if (wErr) throw wErr

      toast.success(t('onb.ready'))
      router.push('/dashboard')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message || t('onb.error'))
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <span className="text-sm text-muted-foreground">{t('onb.stepOf', { n: step + 1, total: STEP_KEYS.length })}</span>
        </div>

        <div className="mb-8 flex items-center gap-2">
          {STEP_KEYS.map((s, i) => (
            <div key={s} className="flex flex-1 items-center gap-2">
              <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                i < step ? 'border-primary bg-primary text-primary-foreground'
                : i === step ? 'border-primary text-primary' : 'border-border text-muted-foreground')}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < STEP_KEYS.length - 1 && <div className={cn('h-0.5 flex-1 rounded', i < step ? 'bg-primary' : 'bg-border')} />}
            </div>
          ))}
        </div>

        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}
              className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">{t(STEP_KEYS[step])}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('onb.desc' + step)}</p>
              </div>

              {step === 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>{t('onb.first')}</Label><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Anna" /></div>
                    <div className="space-y-2"><Label>{t('onb.last')}</Label><Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Rossi" /></div>
                  </div>
                  <div className="space-y-2"><Label>{t('onb.bizName')}</Label><Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Rossi Physiotherapy" /></div>
                  <div className="space-y-2">
                    <Label>{t('onb.bizType')}</Label>
                    <Select value={businessType} onValueChange={setBusinessType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{BUSINESS_TYPES.map((t) => <SelectItem key={t} value={t}>{BUSINESS_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-3">
                  {WEEKDAYS.map((d) => (
                    <div key={d} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Switch checked={days[d].is_open} onCheckedChange={(v) => updateDay(d, { is_open: v })} />
                          <span className="text-sm font-medium capitalize">{new Date(2024, 0, 1 + WEEKDAYS.indexOf(d)).toLocaleDateString(dloc, { weekday: 'long' })}</span>
                        </div>
                        {!days[d].is_open && <span className="text-xs text-muted-foreground">{t('onb.closed')}</span>}
                      </div>
                      {days[d].is_open && (
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Input type="time" value={days[d].morning_start} onChange={(e) => updateDay(d, { morning_start: e.target.value })} />
                          <Input type="time" value={days[d].morning_end} onChange={(e) => updateDay(d, { morning_end: e.target.value })} />
                          <Input type="time" value={days[d].afternoon_start} onChange={(e) => updateDay(d, { afternoon_start: e.target.value })} />
                          <Input type="time" value={days[d].afternoon_end} onChange={(e) => updateDay(d, { afternoon_end: e.target.value })} />
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Switch checked={lunchEnabled} onCheckedChange={setLunchEnabled} />
                        <span className="text-sm font-medium">{t('onb.lunch')}</span>
                      </div>
                    </div>
                    {lunchEnabled && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Input type="time" value={lunchStart} onChange={(e) => setLunchStart(e.target.value)} />
                        <Input type="time" value={lunchEnd} onChange={(e) => setLunchEnd(e.target.value)} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('onb.defaultDur')}</Label>
                    <Select value={duration} onValueChange={setDuration}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{['15','20','30','45','60','90'].map((m) => <SelectItem key={m} value={m}>{t('onb.minutes', { m })}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('onb.maxDaily')} <span className="text-muted-foreground">{t('onb.optional')}</span></Label>
                    <Input type="number" min="1" value={maxDaily} onChange={(e) => setMaxDaily(e.target.value)} placeholder={t('onb.noLimit')} />
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('onb.timezone')}</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('onb.language')}</Label>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('onb.currency')}</Label>
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving}>
            <ChevronLeft className="mr-1 h-4 w-4" /> {t('onb.back')}
          </Button>
          {step < STEP_KEYS.length - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed}>{t('onb.continue')} <ChevronRight className="ml-1 h-4 w-4" /></Button>
          ) : (
            <Button onClick={finish} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {t('onb.finish')}</Button>
          )}
        </div>

        <div className="mt-6">
          <Disclaimer lang={language === 'it' ? 'it' : 'en'} />
        </div>
      </div>
    </div>
  )
}
