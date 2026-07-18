import { expect, test } from '@playwright/test'

const assets = [
  '/cadence-mark.png',
  '/cadence-wordmark.png',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.webmanifest',
  '/landing/voice.png',
  '/landing/calendar-before.png',
  '/landing/optimizer.png',
  '/landing/calendar-after.png',
  '/landing/messages.png',
  '/landing/route.webp',
  '/landing/waiting-list.webp',
  '/landing/personal-algorithm.webp',
  '/landing/mobile-calendar.png',
  '/landing/mobile-clients.png',
  '/landing/mobile-voice.png',
  '/landing/mobile-scheduler.png',
]

test('all Emergent-sensitive public assets resolve', async ({ request }) => {
  for (const asset of assets) {
    const response = await request.get(asset)
    expect(response.status(), asset).toBe(200)
  }
})
