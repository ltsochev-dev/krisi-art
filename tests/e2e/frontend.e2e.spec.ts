import { test, expect } from '@playwright/test'

test.describe('Frontend', () => {
  test('renders the site chrome from the site-settings global', async ({ page }) => {
    await page.goto('http://localhost:3000')

    // Both come from `site-settings`; `Kristina Kostova` is the field default,
    // so this holds on a database where the global has never been saved.
    await expect(page).toHaveTitle(/Kristina Kostova/)
    await expect(page.locator('h1').first()).toHaveText('Kristina Kostova')
  })
})
