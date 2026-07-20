import { describe, expect, it } from 'vitest'

import { DICTS } from '@/lib/i18n/dictionaries'
import {
  defaultBody,
  fmtDate,
  serviceFallback,
} from '@/lib/api/templates'

const REQUIRED_KEYS = [
  'account.yourAccount',
  'account.lightMode',
  'account.darkMode',
  'account.logOut',
  'auth.backHome',
  'auth.signingIn',
  'auth.forgotPassword',
  'auth.resetTitle',
  'auth.resetSubtitle',
  'auth.sendReset',
  'auth.backLogin',
  'auth.layoutTitle',
  'auth.layoutDescription',
  'auth.layoutTrust',
  'working.title',
  'working.subtitle',
  'working.weekly',
  'working.closed',
  'working.defaults',
  'working.holidays',
  'templates.title',
  'templates.subtitle',
  'templates.movedTitle',
  'templates.availablePlaceholders',
  'patient.back',
  'patient.total',
  'patient.upcoming',
  'patient.plans',
  'patient.archive',
  'patient.delete',
  'plan.new',
  'plan.edit',
  'plan.treatmentType',
  'plan.preferredDays',
  'notes.title',
  'notes.add',
  'voice.title',
  'voice.description',
  'voice.speak',
  'voice.listening',
  'assistant.title',
  'assistant.description',
  'demo.title',
  'demo.subtitle',
  'demo.optimize',
  'demo.voiceTitle',
  'demo.previewTitle',
  'demo.messagesTitle',
  'legal.terms',
  'legal.privacy',
  'legal.lastUpdated',
  'legal.terms.title',
  'legal.privacy.title',
  'analytics.subtitle',
  'businessType.physiotherapist',
  'businessType.other',
] as const

describe('localization completeness', () => {
  it('keeps the same translation keys in every language', () => {
    const englishKeys = Object.keys(DICTS.en).sort()

    expect(Object.keys(DICTS.it).sort()).toEqual(englishKeys)
    expect(Object.keys(DICTS.es).sort()).toEqual(englishKeys)
  })

  it.each(['en', 'it', 'es'] as const)(
    'contains every newly visible UI string in %s',
    (locale) => {
      for (const key of REQUIRED_KEYS) {
        expect(DICTS[locale][key], `${locale}.${key}`).toBeTruthy()
      }
    },
  )

  it('provides native Spanish appointment-message defaults', () => {
    expect(defaultBody('es')).toContain('Hola')
    expect(serviceFallback('es')).toBe('cita')
    expect(fmtDate('2026-07-20', 'es')).toMatch(/lun/i)
  })

  it('does not leave the Italian studio fallback in English', () => {
    expect(DICTS.it['sched.edgeStudioPlaceholder']).toBe('Studio (predefinito)')
  })
})
