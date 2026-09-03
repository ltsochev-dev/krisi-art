import type { Page } from '@playwright/test'
import type { User } from '@/payload-types'

import { expect, test } from '@playwright/test'

import { login } from '../helpers/login'
import { cleanupTestUser, seedTestUser } from '../helpers/seedUser'

test.describe('Admin Panel', () => {
  let page: Page
  let user: User

  test.beforeAll(async ({ browser }) => {
    user = await seedTestUser()

    const context = await browser.newContext()
    page = await context.newPage()

    await login({ page, user })
  })

  test.afterAll(async () => {
    await cleanupTestUser()
  })

  test('can navigate to dashboard', async () => {
    await page.goto('http://localhost:3000/admin')
    await expect(page).toHaveURL('http://localhost:3000/admin')
    const dashboardArtifact = page.locator('span[title="Dashboard"]').first()
    await expect(dashboardArtifact).toBeVisible()
  })

  test('can navigate to list view', async () => {
    await page.goto('http://localhost:3000/admin/collections/users')
    await expect(page).toHaveURL('http://localhost:3000/admin/collections/users')
    const listViewArtifact = page.locator('h1', { hasText: 'Users' }).first()
    await expect(listViewArtifact).toBeVisible()
  })

  test('can navigate to edit view', async () => {
    // Not /users/create: accounts are only ever provisioned from verified
    // Cognito claims, so the collection denies `create` outright.
    await page.goto(`http://localhost:3000/admin/collections/users/${user.id}`)
    await expect(page).toHaveURL(`http://localhost:3000/admin/collections/users/${user.id}`)
    const editViewArtifact = page.locator('input[name="email"]')
    await expect(editViewArtifact).toBeVisible()
  })

  test('the login screen offers Cognito only, with no local password form', async ({ browser }) => {
    const anonymous = await browser.newContext()
    const anonymousPage = await anonymous.newPage()

    await anonymousPage.goto('http://localhost:3000/admin/login')

    await expect(anonymousPage.getByText('Continue with AWS Cognito')).toBeVisible()
    await expect(anonymousPage.locator('#field-password')).toHaveCount(0)
    await expect(anonymousPage.locator('#field-email')).toHaveCount(0)

    await anonymous.close()
  })

  test('the local login endpoint is rejected', async ({ request }) => {
    const response = await request.post('http://localhost:3000/api/users/login', {
      data: { email: 'dev@payloadcms.com', password: 'test' },
      failOnStatusCode: false,
    })

    expect(response.status()).toBe(403)
  })
})
