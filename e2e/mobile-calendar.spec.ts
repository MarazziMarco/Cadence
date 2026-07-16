import { expect, test } from '@playwright/test'

const email = process.env.CADENCE_E2E_EMAIL ?? 'test@cadence.com'
const password = process.env.CADENCE_E2E_PASSWORD ?? 'Cadence!'

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile calendar flow runs in the mobile project')
  await page.goto('/login?redirect=/calendar')
  const emailInput = page.locator('#email')
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.pressSequentially(email)
    await page.locator('#password').pressSequentially(password)
    await page.getByRole('button', { name: /log in/i }).click()
  }
  await page.waitForURL('**/calendar', { timeout: 45_000 })
  await expect(page.getByTestId('mobile-day-calendar')).toBeVisible({
    timeout: 45_000,
  })
})

test('phone calendar switches views without document overflow', async ({ page }) => {
  const view = page.locator('select').filter({
    has: page.locator('option[value="month"]'),
  }).first()
  await expect(view).toHaveValue('day')
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )).toBe(true)

  const dayOptimizerTitle = await page.locator('button[title]').last().getAttribute('title')
  await view.selectOption('week')
  await expect(page.getByTestId('mobile-week-time-grid')).toBeVisible()

  await view.selectOption('month')
  await expect(page.getByTestId('mobile-month-calendar')).toBeVisible()
  const monthOptimizerTitle = await page.locator('button[title]').last().getAttribute('title')
  expect(monthOptimizerTitle).not.toBe(dayOptimizerTitle)

  await view.selectOption('agenda')
  await expect(page.locator('section').filter({
    has: page.locator('select option[value="agenda"]'),
  }).first()).toBeVisible()
})

test('quick sheet, guarded move, zoom limits, and landscape layout work', async ({ page }) => {
  const appointment = page.locator('[data-appointment-id]').first()
  if (await appointment.count()) {
    await appointment.click()
    const move = page.getByRole('button', { name: /^(move|sposta|mover)$/i })
    await expect(move).toBeVisible()
    const locked = await move.isDisabled()
    if (!locked) {
      await move.click()
      const start = page.locator('#move-appointment-start')
      const previous = await start.inputValue()
      const [hour, minute] = previous.split(':').map(Number)
      const total = hour * 60 + minute + 15
      if (total < 24 * 60) {
        await start.fill(
          `${String(Math.floor(total / 60)).padStart(2, '0')}:${
            String(total % 60).padStart(2, '0')
          }`,
        )
        await page.locator('form').filter({
          has: page.locator('#move-appointment-start'),
        }).locator('button[type="submit"]').click()
        const undo = page.getByRole('button', {
          name: /^(undo|annulla|deshacer)$/i,
        })
        if (await undo.isVisible().catch(() => false)) await undo.click()
      }
    }
  }

  const zoom = page.getByRole('group').filter({
    has: page.locator('button'),
  }).last()
  const buttons = zoom.getByRole('button')
  for (let index = 0; index < 10; index += 1) await buttons.nth(0).click()
  await expect.poll(() => page.evaluate(
    () => localStorage.getItem('cadence.calendar.density'),
  )).toBe('36')
  await buttons.nth(1).click()
  await expect.poll(() => page.evaluate(
    () => localStorage.getItem('cadence.calendar.density'),
  )).toBe('60')
  for (let index = 0; index < 10; index += 1) await buttons.nth(2).click()
  await expect.poll(() => page.evaluate(
    () => localStorage.getItem('cadence.calendar.density'),
  )).toBe('120')

  await page.setViewportSize({ width: 844, height: 390 })
  await expect(page.getByTestId('tablet-3-day-calendar')).toBeVisible()
})
