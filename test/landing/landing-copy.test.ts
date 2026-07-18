import { describe, expect, it } from 'vitest'

import {
  LANDING_COPY,
  LANDING_LOCALES,
  type LandingLocale,
} from '@/components/landing/landing-copy'

const STEP_ORDER = [
  'voice',
  'gaps',
  'suggestions',
  'optimized',
  'messages',
  'route',
  'waiting',
  'personal',
]

describe('landing copy', () => {
  it('contains complete English, Italian, and Spanish dictionaries', () => {
    expect(LANDING_LOCALES).toEqual(['en', 'it', 'es'])

    for (const locale of LANDING_LOCALES) {
      const copy = LANDING_COPY[locale]
      expect(copy.header.login).toBeTruthy()
      expect(copy.hero.title).toBeTruthy()
      expect(copy.value.title).toBeTruthy()
      expect(copy.mobile.title).toBeTruthy()
      expect(copy.features).toHaveLength(5)
      expect(copy.footer.disclaimer).toBeTruthy()
      expect(copy.demo.button).toBeTruthy()
      expect(copy.phone.cards).toHaveLength(3)
    }
  })

  it.each(LANDING_LOCALES)(
    'keeps all eight %s story chapters in the required order',
    (locale: LandingLocale) => {
      expect(LANDING_COPY[locale].story.steps.map((step) => step.id)).toEqual(
        STEP_ORDER,
      )
      expect(LANDING_COPY[locale].story.steps).toHaveLength(8)
    },
  )

  it('uses real product asset paths for every chapter', () => {
    for (const step of LANDING_COPY.en.story.steps) {
      expect(step.image).toMatch(/^\/landing\/.+\.(png|webp)$/)
      expect(step.alt).not.toBe(step.title)
    }
  })
})
