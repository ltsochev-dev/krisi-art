/**
 * @vitest-environment node
 *
 * Payload is server-only; the project's default jsdom environment breaks it.
 *
 * These run against the configured DATABASE_URL, so every document created here
 * is namespaced with `PREFIX` and removed in `afterAll` — commissions and the
 * access-log rows that point at them, in that dependency order.
 *
 * **No test here touches AWS, and the whole file passes with
 * `S3_COMMISSIONS_BUCKET` unset.** Two separate mechanisms get that:
 *
 * - `deleteObjects` is replaced with a spy for the whole module, because the
 *   `beforeDelete` hook on `commissions` calls it for real. Everything else in
 *   `@/lib/aws/s3` is passed through untouched, so `payload.config.ts` (which
 *   reads `getS3Config` and `getMediaCdnUrl`) is unaffected, and so the bucket
 *   accessors under test below are the real ones.
 * - the cases that need a configured bucket set `S3_COMMISSIONS_BUCKET` to a
 *   name that does not exist and restore it afterwards. That is safe *because*
 *   the only function that would have gone to the network is the spy above.
 *   `getS3Config` memoises into a module-level `cachedConfig`, but
 *   `getCommissionsBucket` and `hasCommissionsBucket` deliberately read
 *   `process.env` on every call — which is what makes this manipulation work at
 *   all, and is asserted directly.
 *
 * Teardown goes through `payload.db` rather than `payload.delete` so it cannot
 * run the `beforeDelete` hook: the S3 side of a delete is exercised
 * deliberately in one place below, and a teardown that also fired it would make
 * the spy's call log depend on test ordering.
 */
import type { Commission, User } from '@/payload-types'

import { getPayload, type Payload, type RequiredDataFromCollectionSlug } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/aws/s3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/aws/s3')>()),
  deleteObjects: vi.fn(async () => {}),
}))

import { deleteObjects, getCommissionsBucket, hasCommissionsBucket } from '@/lib/aws/s3'
import {
  hasRecentView,
  logCommissionAccess,
  VIEW_DEDUPE_WINDOW_MS,
} from '@/lib/commissions/access-log'
import { buildCommissionKey, isKeyForCommission, sanitiseFilename } from '@/lib/commissions/keys'
import { verifyPassword } from '@/lib/commissions/password'
import {
  contentDispositionAttachment,
  getClientIp,
  parseUserAgent,
} from '@/lib/commissions/request'
import {
  evaluateCommissionGate,
  findCommissionByUuid,
  toPublicCommission,
} from '@/lib/content/commissions'
import config from '@/payload.config'

const PREFIX = 'zz-int-test'

/**
 * A bucket name no account owns. Only ever handed to the mocked
 * `deleteObjects`, so nothing resolves it — but it is visibly not the real
 * bucket, in case a future change here does reach the network.
 */
const FAKE_BUCKET = 'zz-int-test-commissions-does-not-exist'

let payload: Payload
/** Restored in `afterAll`, because several cases below rewrite it. */
let originalBucket: string | undefined
let originalRegion: string | undefined

const createCommission = async (
  overrides: Partial<RequiredDataFromCollectionSlug<'commissions'>> = {},
): Promise<Commission> =>
  await payload.create({
    collection: 'commissions',
    data: { title: `${PREFIX} commission`, ...overrides },
    depth: 0,
    // The counters, `files`, `uuid` and `passwordHash` are all server-owned
    // fields; the Local API with access off is their only writer, here as in
    // the endpoints.
    overrideAccess: true,
  })

/**
 * The row as the database actually holds it, with no `afterRead` hooks and no
 * field hooks in the way. This is the only way to tell a virtual field from a
 * stored one — a `find` runs the hooks that invent the virtual values.
 */
const storedRow = async (id: number): Promise<Record<string, unknown>> => {
  const row = await payload.db.findOne<Commission>({
    collection: 'commissions',
    where: { id: { equals: id } },
  })

  if (!row) {
    throw new Error(`No stored row for commission ${id}.`)
  }

  return row as unknown as Record<string, unknown>
}

/** How many access-log rows point at a commission, whatever the event. */
const accessLogCount = async (commissionId: number): Promise<number> =>
  (
    await payload.find({
      collection: 'commission-access-log',
      depth: 0,
      limit: 0,
      overrideAccess: true,
      pagination: false,
      where: { commission: { equals: commissionId } },
    })
  ).totalDocs

describe('commissions', () => {
  beforeAll(async () => {
    originalBucket = process.env.S3_COMMISSIONS_BUCKET
    originalRegion = process.env.S3_REGION

    payload = await getPayload({ config: await config })
  })

  afterAll(async () => {
    const { docs } = await payload.find({
      collection: 'commissions',
      depth: 0,
      joins: false,
      limit: 0,
      overrideAccess: true,
      pagination: false,
      where: { title: { like: PREFIX } },
    })

    const ids = docs.map((doc) => doc.id)

    if (ids.length > 0) {
      // The log rows first: `commission` is a required relationship, so an
      // orphaned row would be a document the admin panel cannot render.
      await payload.db.deleteMany({
        collection: 'commission-access-log',
        where: { commission: { in: ids } },
      })

      await payload.db.deleteMany({ collection: 'commissions', where: { id: { in: ids } } })
    }

    const restore = (name: string, value: string | undefined): void => {
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }

    restore('S3_COMMISSIONS_BUCKET', originalBucket)
    restore('S3_REGION', originalRegion)
  })

  // --- Pure functions ------------------------------------------------------

  describe('object keys', () => {
    const uuid = '11111111-2222-3333-4444-555555555555'
    const fileId = '66666666-7777-8888-9999-aaaaaaaaaaaa'

    it('cannot be made to climb out of the commission’s folder', () => {
      // The traversal is defused by stripping the separators rather than by
      // rejecting the name, so the key always has exactly three segments and
      // `isKeyForCommission` below can rely on that shape.
      expect(sanitiseFilename('../../etc/passwd')).toBe('etcpasswd')
      expect(
        buildCommissionKey({ commissionUuid: uuid, fileId, filename: '../../etc/passwd' }).split(
          '/',
        ),
      ).toHaveLength(3)
    })

    it('strips the backslashes a Windows browser sends in a full path', () => {
      // A drag-and-drop from Explorer can hand over a whole path. The
      // separators go and the rest is kept, so the name still reads.
      expect(sanitiseFilename('C:\\Users\\krisi\\Desktop\\final.zip')).toBe(
        'C:UserskrisiDesktopfinal.zip',
      )
    })

    it('leaves Cyrillic and spaces alone, because S3 keys are UTF-8', () => {
      expect(sanitiseFilename('Портрет на Мария.jpg')).toBe('Портрет на Мария.jpg')
      expect(sanitiseFilename('  final   artwork .png  ')).toBe('final artwork .png')
    })

    it('drops a leading dot so nothing arrives as a hidden file', () => {
      expect(sanitiseFilename('.htaccess')).toBe('htaccess')
      expect(sanitiseFilename('...final.zip')).toBe('final.zip')
    })

    it('keeps the extension when it truncates a very long name', () => {
      const long = `${'a'.repeat(300)}.zip`
      const safe = sanitiseFilename(long)

      // The extension is the half that matters to whoever double-clicks the
      // file, so the cap has to eat the name and not the suffix.
      expect(safe.endsWith('.zip')).toBe(true)
      expect(safe.length).toBe(120)
    })

    it('falls back to a placeholder for a name that sanitises to nothing', () => {
      expect(sanitiseFilename('///')).toBe('file')
      expect(sanitiseFilename('...')).toBe('file')
      expect(sanitiseFilename('   ')).toBe('file')
      expect(buildCommissionKey({ commissionUuid: uuid, fileId, filename: '..' })).toBe(
        `${uuid}/${fileId}/file`,
      )
    })

    it('accepts only a well-formed key for this exact commission', () => {
      expect(isKeyForCommission(`${uuid}/${fileId}/final.zip`, uuid)).toBe(true)
    })

    it('rejects a key for another commission, including a prefix collision', () => {
      const other = '99999999-2222-3333-4444-555555555555'

      expect(isKeyForCommission(`${other}/${fileId}/final.zip`, uuid)).toBe(false)
      // The check is on the whole segment, not on a `startsWith` — otherwise
      // `abc` would match a key belonging to `abcdef`.
      expect(isKeyForCommission(`${uuid}extra/${fileId}/final.zip`, uuid)).toBe(false)
      expect(isKeyForCommission(`${uuid}/${fileId}/final.zip`, `${uuid}extra`)).toBe(false)
    })

    it('rejects a traversal attempt and a key of the wrong shape', () => {
      expect(isKeyForCommission(`${uuid}/../${fileId}/final.zip`, uuid)).toBe(false)
      expect(isKeyForCommission(`${uuid}/${fileId}/../../secrets.txt`, uuid)).toBe(false)
      // Two segments, four segments, and an empty middle one: all not a key
      // this endpoint issued.
      expect(isKeyForCommission(`${uuid}/final.zip`, uuid)).toBe(false)
      expect(isKeyForCommission(`${uuid}/${fileId}/nested/final.zip`, uuid)).toBe(false)
      expect(isKeyForCommission(`${uuid}//final.zip`, uuid)).toBe(false)
      expect(isKeyForCommission('', uuid)).toBe(false)
    })
  })

  describe('the bucket accessors', () => {
    it('throws when the bucket is unset, and re-reads the environment every call', () => {
      // Not memoised, unlike `getS3Config` — which is the property the rest of
      // this file leans on when it swaps the bucket name per case.
      delete process.env.S3_COMMISSIONS_BUCKET

      expect(() => getCommissionsBucket()).toThrow(/S3_COMMISSIONS_BUCKET/)

      process.env.S3_COMMISSIONS_BUCKET = FAKE_BUCKET

      expect(getCommissionsBucket()).toBe(FAKE_BUCKET)

      // Blank counts as unset: an empty env var in a container is a very
      // ordinary way to end up here.
      process.env.S3_COMMISSIONS_BUCKET = '   '

      expect(() => getCommissionsBucket()).toThrow(/S3_COMMISSIONS_BUCKET/)
    })

    it('probes without throwing, so a page can render an honest message', () => {
      delete process.env.S3_COMMISSIONS_BUCKET

      expect(hasCommissionsBucket()).toBe(false)

      // A bucket name with no region is not a working configuration — the
      // shared client cannot be built without one.
      process.env.S3_COMMISSIONS_BUCKET = FAKE_BUCKET
      delete process.env.S3_REGION

      expect(hasCommissionsBucket()).toBe(false)

      process.env.S3_REGION = 'eu-west-2'

      expect(hasCommissionsBucket()).toBe(true)
    })
  })

  describe('the access gate', () => {
    it('refuses a commission that is not enabled yet', () => {
      expect(evaluateCommissionGate({ enabled: false, expiresAt: null })).toEqual({
        ok: false,
        reason: 'disabled',
      })
      // The field is optional in the type, and an absent value is not "enabled".
      expect(evaluateCommissionGate({ enabled: null, expiresAt: null }).ok).toBe(false)
    })

    it('refuses a commission whose expiry has passed', () => {
      expect(
        evaluateCommissionGate(
          { enabled: true, expiresAt: '2026-03-20T00:00:00.000Z' },
          new Date('2026-04-01T09:00:00.000Z'),
        ),
      ).toEqual({ ok: false, reason: 'expired' })
    })

    it('treats a day-only expiry as valid through the whole of that day', () => {
      // `expiresAt` comes from a dayOnly picker, so it is midnight UTC on the
      // chosen day. Picking "the 20th" has to mean the link works *on* the
      // 20th; comparing against the start of the day would expire it on the
      // 19th as far as the client is concerned. Both sides of the boundary are
      // asserted because this is the one arithmetic decision in the helper.
      const expiring = { enabled: true, expiresAt: '2026-03-20T00:00:00.000Z' }

      expect(evaluateCommissionGate(expiring, new Date('2026-03-20T00:00:00.000Z')).ok).toBe(true)
      expect(evaluateCommissionGate(expiring, new Date('2026-03-20T23:59:59.999Z')).ok).toBe(true)
      expect(evaluateCommissionGate(expiring, new Date('2026-03-21T00:00:00.000Z'))).toEqual({
        ok: false,
        reason: 'expired',
      })
    })

    it('resolves an enabled commission with no expiry', () => {
      expect(evaluateCommissionGate({ enabled: true, expiresAt: null })).toEqual({ ok: true })
    })
  })

  describe('request metadata', () => {
    it('parses the user agents the access log actually sees', () => {
      const cases: [string, ReturnType<typeof parseUserAgent>][] = [
        [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          { browser: 'Chrome', deviceType: 'desktop', os: 'Windows' },
        ],
        [
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
          // iOS claims `like Mac OS X`, so the OS table has to test iPhone
          // first — and Safari is only reached because every Chrome-ish token
          // is tested ahead of it.
          { browser: 'Safari', deviceType: 'mobile', os: 'iOS' },
        ],
        [
          'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          // An Android tablet is an Android UA with no `Mobile` token; that
          // absence is the only thing separating it from a phone.
          { browser: 'Chrome', deviceType: 'tablet', os: 'Android' },
        ],
        [
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
          { browser: 'Chrome', deviceType: 'mobile', os: 'Android' },
        ],
        [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
          // Edge says `Chrome/` too, so it only reads as Edge because `Edg/`
          // is tested first.
          { browser: 'Edge', deviceType: 'desktop', os: 'Windows' },
        ],
        [
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
          { browser: 'Safari', deviceType: 'desktop', os: 'macOS' },
        ],
        [
          'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          { browser: 'Bot', deviceType: 'desktop', os: 'Unknown' },
        ],
        ['curl/8.7.1', { browser: 'curl', deviceType: 'desktop', os: 'Unknown' }],
      ]

      for (const [userAgent, expected] of cases) {
        expect(parseUserAgent(userAgent), userAgent).toEqual(expected)
      }
    })

    it('says Unknown rather than guessing when there is no user agent', () => {
      const unknown = { browser: 'Unknown', deviceType: 'Unknown', os: 'Unknown' }

      expect(parseUserAgent('')).toEqual(unknown)
      expect(parseUserAgent('   ')).toEqual(unknown)
      expect(parseUserAgent(null)).toEqual(unknown)
      expect(parseUserAgent(undefined)).toEqual(unknown)
    })

    it('takes the left-most entry of a forwarded chain', () => {
      expect(
        getClientIp(
          new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' }),
        ),
      ).toBe('203.0.113.7')
    })

    it('falls back to x-real-ip, then to a placeholder', () => {
      expect(getClientIp(new Headers({ 'x-real-ip': ' 198.51.100.4 ' }))).toBe('198.51.100.4')
      // A present but empty chain is the case a naive `?? ` would return as an
      // empty string, which would then group every such caller under one
      // rate-limit key.
      expect(
        getClientIp(new Headers({ 'x-forwarded-for': ' , ', 'x-real-ip': '198.51.100.4' })),
      ).toBe('198.51.100.4')
      expect(getClientIp(new Headers())).toBe('unknown')
    })

    it('emits both Content-Disposition filename forms', () => {
      const ascii = contentDispositionAttachment('final artwork.zip')

      expect(ascii).toBe(
        `attachment; filename="final artwork.zip"; filename*=UTF-8''final%20artwork.zip`,
      )
    })

    it('RFC 5987-encodes a Cyrillic filename so it survives the trip', () => {
      const header = contentDispositionAttachment('Портрет.jpg')
      const [, plain] = header.match(/filename="([^"]+)"/) ?? []
      const [, extended] = header.match(/filename\*=UTF-8''(.+)$/) ?? []

      // The plain form is transliterated to underscores for clients that
      // cannot read the extended parameter; the extended one carries the real
      // name and is what a modern browser saves the file as.
      expect(plain).toBe('_______.jpg')
      expect(decodeURIComponent(extended ?? '')).toBe('Портрет.jpg')
      expect(extended?.startsWith('%D0%9F')).toBe(true)
    })
  })

  // --- Documents -----------------------------------------------------------

  describe('a commission document', () => {
    it('mints a UUID on create and carries it through updates', async () => {
      const commission = await createCommission()

      expect(commission.uuid).toMatch(/^[0-9a-f-]{36}$/)

      const renamed = await payload.update({
        collection: 'commissions',
        data: { enabled: true, title: `${PREFIX} commission renamed` },
        depth: 0,
        id: commission.id,
        overrideAccess: true,
      })

      const reread = await payload.findByID({
        collection: 'commissions',
        depth: 0,
        id: commission.id,
        joins: false,
        overrideAccess: true,
      })

      expect(renamed.uuid).toBe(commission.uuid)
      expect(reread.uuid).toBe(commission.uuid)
    })

    it('discards a write to its UUID, even through the Local API', async () => {
      const commission = await createCommission()

      /**
       * A regression test for a real hole. The UUID *is* the authorisation for
       * a link already in a client's hands, so it has to be immutable in the
       * hook and not merely read-only in the admin panel: field access is the
       * only thing `uuid` had, and every Local API call in this codebase
       * passes `overrideAccess: true`, which skips field access entirely. A
       * UUID that moved would silently break every link already sent, and
       * nothing about that is visible to the artist — the document still looks
       * fine, and the client just gets "not available".
       *
       * So this is the strongest form of the case: access control is off, and
       * only `prepareCommission` stands between the write and the row.
       */
      const tampered = await payload.update({
        collection: 'commissions',
        data: {
          title: `${PREFIX} commission tampered`,
          uuid: '00000000-0000-4000-8000-000000000000',
        },
        depth: 0,
        id: commission.id,
        overrideAccess: true,
      })

      expect(tampered.uuid).toBe(commission.uuid)
      // The rest of the write still lands: this refuses one field, it is not a
      // veto on the save.
      expect(tampered.title).toBe(`${PREFIX} commission tampered`)

      // And it is the stored row that kept the original, not just the returned
      // document.
      expect(await storedRow(commission.id)).toMatchObject({ uuid: commission.uuid })
      // The link the artist copied therefore still points where it did.
      expect(tampered.publicUrl?.endsWith(`/commission/${commission.uuid}`)).toBe(true)
    })

    it('builds publicUrl on read and stores no column for it', async () => {
      const commission = await createCommission()
      const row = await storedRow(commission.id)

      // A virtual field has no column at all, which is the whole point: no
      // origin is ever baked into a row, so pointing the deployment at another
      // domain changes every commission link at once. Checked against the
      // database rather than against a `find`, because a `find` runs the
      // `afterRead` hook that invents the value.
      expect(row).not.toHaveProperty('publicUrl')
      expect(row).not.toHaveProperty('hasPassword')

      expect(commission.publicUrl).toBeTruthy()
      expect(commission.publicUrl?.endsWith(`/commission/${commission.uuid}`)).toBe(true)
    })

    it('hashes a password and never stores the plaintext', async () => {
      const plain = 'корабче 42'
      const commission = await createCommission({ password: plain })

      // Nulled on the way in by `prepareCommission` and again on the way out
      // by the field's `afterRead` hook, so neither the API nor the admin
      // panel can surface it.
      expect(commission.password).toBeNull()
      expect(commission.passwordHash).toMatch(/^scrypt\$/)
      expect(commission.hasPassword).toBe(true)

      const row = await storedRow(commission.id)

      expect(row.password).toBeFalsy()
      expect(JSON.stringify(row)).not.toContain('корабче')

      expect(await verifyPassword(plain, commission.passwordHash ?? null)).toBe(true)
      expect(await verifyPassword('корабче 43', commission.passwordHash ?? null)).toBe(false)
      expect(await verifyPassword('', commission.passwordHash ?? null)).toBe(false)
    })

    it('leaves an existing password alone when the box is submitted empty', async () => {
      const commission = await createCommission({ password: 'first-secret' })

      const saved = await payload.update({
        collection: 'commissions',
        // Exactly what the admin panel sends on every subsequent save: the
        // password box is always rendered empty, so an empty submit must not
        // be read as "remove it".
        data: { internalNotes: 'unrelated edit', password: '' },
        depth: 0,
        id: commission.id,
        overrideAccess: true,
      })

      expect(saved.passwordHash).toBe(commission.passwordHash)
      expect(await verifyPassword('first-secret', saved.passwordHash ?? null)).toBe(true)
    })

    it('replaces the hash when a new password is typed', async () => {
      const commission = await createCommission({ password: 'first-secret' })

      const changed = await payload.update({
        collection: 'commissions',
        data: { password: 'second-secret' },
        depth: 0,
        id: commission.id,
        overrideAccess: true,
      })

      expect(changed.passwordHash).not.toBe(commission.passwordHash)
      expect(await verifyPassword('second-secret', changed.passwordHash ?? null)).toBe(true)
      expect(await verifyPassword('first-secret', changed.passwordHash ?? null)).toBe(false)
    })

    it('clears the hash on the explicit gesture, and unticks itself', async () => {
      const commission = await createCommission({ password: 'first-secret' })

      const cleared = await payload.update({
        collection: 'commissions',
        data: { removePassword: true },
        depth: 0,
        id: commission.id,
        overrideAccess: true,
      })

      expect(cleared.passwordHash).toBeFalsy()
      expect(cleared.hasPassword).toBe(false)
      // The checkbox is a gesture, not a state: left ticked it would clear the
      // hash again on the next unrelated save.
      expect(cleared.removePassword).toBe(false)

      const reset = await payload.update({
        collection: 'commissions',
        data: { password: 'third-secret' },
        depth: 0,
        id: commission.id,
        overrideAccess: true,
      })

      expect(await verifyPassword('third-secret', reset.passwordHash ?? null)).toBe(true)
    })
  })

  describe('the server-owned files array', () => {
    /**
     * A real session, because this is the one guarantee `overrideAccess: true`
     * cannot demonstrate. Every other Local API call in this file has access
     * off, which skips field access entirely — and field access is exactly
     * what governs the `files` array.
     */
    let editor: User

    beforeAll(async () => {
      editor = await payload.create({
        collection: 'users',
        data: {
          cognitoSub: `${PREFIX}-commissions-editor`,
          email: 'zz-int-test-commissions@example.com',
          name: `${PREFIX} Editor`,
          roles: ['editor'],
        },
        // The users collection denies `create` outright, so that accounts can
        // only ever be provisioned from verified Cognito claims.
        overrideAccess: true,
      })
    })

    afterAll(async () => {
      await payload.delete({
        collection: 'users',
        overrideAccess: true,
        where: { cognitoSub: { equals: `${PREFIX}-commissions-editor` } },
      })
    })

    it('reverts a hand-written array wholesale rather than applying part of it', async () => {
      const created = await createCommission({ title: `${PREFIX} server owned files` })
      const seeded = await payload.update({
        collection: 'commissions',
        data: {
          files: [
            {
              fileId: 'row-one',
              filename: 'original.zip',
              key: `${created.uuid}/row-one/original.zip`,
              label: 'Original',
            },
          ],
        },
        depth: 0,
        id: created.id,
        overrideAccess: true,
      })

      const tampered = await payload.update({
        collection: 'commissions',
        data: {
          files: [
            {
              fileId: 'row-one',
              filename: 'original.zip',
              // A key belonging to somebody else's commission, which is the
              // whole reason this array is not writable by hand.
              key: 'another-commission/row-one/original.zip',
              label: 'Renamed by hand',
            },
          ],
        },
        depth: 0,
        id: created.id,
        // A real editor, so field access is actually consulted.
        overrideAccess: false,
        user: editor,
      })

      /**
       * The write is a silent no-op, not a rejection: when the array's
       * `update` access denies the value, Payload refills it from the stored
       * document before it ever descends into the row subfields. That is also
       * why the `label` subfield cannot carve itself out of the rule, and why
       * renaming a file goes through
       * `PATCH /api/commissions/:id/files/:fileId` instead.
       */
      expect(tampered.files).toEqual(seeded.files)
      expect(tampered.files?.[0]?.key).toBe(`${created.uuid}/row-one/original.zip`)
      expect(tampered.files?.[0]?.label).toBe('Original')
    })
  })

  describe('the public projection', () => {
    /**
     * Asserted as an exact, sorted key set rather than field by field, and
     * deliberately so: the keys of this object are the entire boundary between
     * an internal note and the client. A field added to `PublicCommission`
     * later has to fail this test and be looked at, instead of quietly
     * arriving in the browser.
     */
    const PUBLIC_COMMISSION_KEYS = ['description', 'files', 'hasPassword', 'title']
    const PUBLIC_FILE_KEYS = ['fileId', 'filesize', 'mimeType', 'name']

    let commission: Commission

    beforeAll(async () => {
      commission = await createCommission({
        description: 'Two files, delivered.',
        enabled: true,
        files: [
          {
            downloadCount: 3,
            fileId: 'file-one',
            filename: 'Портрет.jpg',
            filesize: 2048,
            key: 'unused-in-this-test/file-one/Портрет.jpg',
            mimeType: 'image/jpeg',
            uploadedAt: '2026-03-01T00:00:00.000Z',
          },
          {
            fileId: 'file-two',
            filename: 'sources.zip',
            filesize: 4096,
            key: 'unused-in-this-test/file-two/sources.zip',
            label: '  Working files  ',
            mimeType: 'application/zip',
          },
        ],
        internalNotes: 'The client still owes for this one.',
        password: 'a-secret',
        title: `${PREFIX} projected commission`,
      })
    })

    it('exposes exactly the agreed keys and nothing else', () => {
      const projected = toPublicCommission(commission)

      expect(Object.keys(projected).sort()).toEqual(PUBLIC_COMMISSION_KEYS)

      for (const file of projected.files) {
        expect(Object.keys(file).sort()).toEqual(PUBLIC_FILE_KEYS)
      }
    })

    it('omits the hash, the notes, the counters, the expiry and every S3 key', () => {
      const projected = toPublicCommission(commission)
      const serialised = JSON.stringify(projected)

      for (const leak of ['passwordHash', 'internalNotes', 'viewCount', 'downloadCount', 'key']) {
        expect(Object.keys(projected)).not.toContain(leak)
        expect(Object.keys(projected.files[0] ?? {})).not.toContain(leak)
      }

      expect(Object.keys(projected)).not.toContain('expiresAt')
      // Belt and braces on the values as well as the keys: a nested key would
      // survive a key-set check on the top level.
      expect(serialised).not.toContain('unused-in-this-test')
      expect(serialised).not.toContain('still owes')
      expect(serialised).not.toContain('scrypt$')
    })

    it('tells the page a password is set without handing over the hash', () => {
      const projected = toPublicCommission(commission)

      expect(projected.hasPassword).toBe(true)
      expect(projected.title).toBe(`${PREFIX} projected commission`)
    })

    it('prefers the artist’s label over the original filename', () => {
      const projected = toPublicCommission(commission)

      expect(projected.files.map((file) => file.name)).toEqual(['Портрет.jpg', 'Working files'])
    })

    it('projects the same key set when read through findCommissionByUuid', async () => {
      // The finder is the path the page actually takes, so the guarantee has
      // to hold there too and not only on the pure projection above.
      const found = await findCommissionByUuid({ payload, uuid: commission.uuid ?? '' })

      expect(found).not.toBeNull()
      expect(Object.keys(found ?? {}).sort()).toEqual(PUBLIC_COMMISSION_KEYS)
      expect(Object.keys(found?.files[0] ?? {}).sort()).toEqual(PUBLIC_FILE_KEYS)
    })

    it('returns null through the finder when the gate refuses', async () => {
      const disabled = await createCommission({ title: `${PREFIX} not enabled` })

      // `null` for "no such commission", "not enabled" and "expired" alike, so
      // a caller cannot accidentally render one of the last two.
      expect(await findCommissionByUuid({ payload, uuid: disabled.uuid ?? '' })).toBeNull()
      expect(await findCommissionByUuid({ payload, uuid: 'not-a-uuid' })).toBeNull()
      expect(await findCommissionByUuid({ payload, uuid: '' })).toBeNull()
    })
  })

  describe('view tracking', () => {
    /**
     * Exercised through `hasRecentView` + `logCommissionAccess` rather than by
     * calling `POST /api/commissions/:uuid/track`, because the endpoint is a
     * thin wrapper over exactly these two plus one `payload.update` — and an
     * HTTP round trip would need a running Next server, which an integration
     * spec does not have. The dedupe rule lives entirely in the helpers, so
     * testing them tests the rule.
     */
    const USER_AGENT =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

    const visitHeaders = (ip: string): Headers =>
      new Headers({ 'user-agent': USER_AGENT, 'x-forwarded-for': ip })

    /** What the endpoint does, minus the rate limit and the gate. */
    const track = async (commission: Commission, headers: Headers): Promise<void> => {
      const repeat = await hasRecentView({ commissionId: commission.id, headers, payload })

      if (!repeat) {
        await logCommissionAccess({
          commissionId: commission.id,
          event: 'view',
          headers,
          payload,
        })
      }

      const current = await payload.findByID({
        collection: 'commissions',
        depth: 0,
        id: commission.id,
        joins: false,
        overrideAccess: true,
      })

      await payload.update({
        collection: 'commissions',
        data: {
          lastAccessedAt: new Date().toISOString(),
          ...(repeat ? {} : { viewCount: (current.viewCount ?? 0) + 1 }),
        },
        depth: 0,
        id: commission.id,
        overrideAccess: true,
      })
    }

    const viewRows = async (commission: Commission): Promise<number> =>
      (
        await payload.find({
          collection: 'commission-access-log',
          depth: 0,
          limit: 0,
          overrideAccess: true,
          pagination: false,
          where: {
            and: [{ commission: { equals: commission.id } }, { event: { equals: 'view' } }],
          },
        })
      ).totalDocs

    it('counts two loads from the same visitor inside the window once', async () => {
      const commission = await createCommission({
        enabled: true,
        title: `${PREFIX} tracked commission`,
      })
      const headers = visitHeaders('198.51.100.10')

      await track(commission, headers)
      await track(commission, headers)

      const after = await payload.findByID({
        collection: 'commissions',
        depth: 0,
        id: commission.id,
        joins: false,
        overrideAccess: true,
      })

      expect(await viewRows(commission)).toBe(1)
      expect(after.viewCount).toBe(1)
      // Updated on every call even when the view itself was deduped — the
      // artist wants to know the link was opened, not only that it was a new
      // visitor.
      expect(after.lastAccessedAt).toBeTruthy()
    })

    it('counts a different visitor separately', async () => {
      const commission = await createCommission({
        enabled: true,
        title: `${PREFIX} two visitors`,
      })

      await track(commission, visitHeaders('198.51.100.20'))
      await track(commission, visitHeaders('198.51.100.21'))
      await track(commission, visitHeaders('198.51.100.21'))

      const after = await payload.findByID({
        collection: 'commissions',
        depth: 0,
        id: commission.id,
        joins: false,
        overrideAccess: true,
      })

      expect(await viewRows(commission)).toBe(2)
      expect(after.viewCount).toBe(2)
    })

    it('keys the window off the IP and user agent together', async () => {
      const commission = await createCommission({
        enabled: true,
        title: `${PREFIX} two agents`,
      })
      const ip = '198.51.100.30'

      await track(commission, new Headers({ 'user-agent': USER_AGENT, 'x-forwarded-for': ip }))

      expect(
        await hasRecentView({
          commissionId: commission.id,
          headers: new Headers({ 'user-agent': 'curl/8.7.1', 'x-forwarded-for': ip }),
          payload,
        }),
      ).toBe(false)

      // Half an hour, so a client who opens the link, closes the tab and comes
      // back after lunch is a second visit rather than a second page load.
      expect(VIEW_DEDUPE_WINDOW_MS).toBe(30 * 60 * 1000)
    })

    it('records the parsed browser and OS on the row it writes', async () => {
      const commission = await createCommission({
        enabled: true,
        title: `${PREFIX} parsed row`,
      })

      await track(commission, visitHeaders('198.51.100.40'))

      const { docs } = await payload.find({
        collection: 'commission-access-log',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        pagination: false,
        where: { commission: { equals: commission.id } },
      })

      expect(docs[0]).toMatchObject({
        browser: 'Chrome',
        deviceType: 'desktop',
        event: 'view',
        ip: '198.51.100.40',
        os: 'Windows',
      })
    })
  })

  describe('deleting a commission', () => {
    const filesFor = (uuid: string): NonNullable<Commission['files']> => [
      {
        fileId: 'delete-one',
        filename: 'first.zip',
        key: `${uuid}/delete-one/first.zip`,
      },
      {
        fileId: 'delete-two',
        filename: 'second.jpg',
        key: `${uuid}/delete-two/second.jpg`,
      },
    ]

    it('hands every file’s key to S3 in one call', async () => {
      process.env.S3_COMMISSIONS_BUCKET = FAKE_BUCKET
      process.env.S3_REGION = 'eu-west-2'
      vi.mocked(deleteObjects).mockClear()

      const created = await createCommission({ title: `${PREFIX} delete me` })
      const commission = await payload.update({
        collection: 'commissions',
        data: { files: filesFor(created.uuid ?? '') },
        depth: 0,
        id: created.id,
        overrideAccess: true,
      })

      await payload.delete({ collection: 'commissions', id: commission.id, overrideAccess: true })

      expect(deleteObjects).toHaveBeenCalledTimes(1)
      expect(deleteObjects).toHaveBeenCalledWith({
        bucket: FAKE_BUCKET,
        keys: [`${created.uuid}/delete-one/first.zip`, `${created.uuid}/delete-two/second.jpg`],
      })

      expect(
        await payload.find({
          collection: 'commissions',
          overrideAccess: true,
          where: { id: { equals: commission.id } },
        }),
      ).toMatchObject({ totalDocs: 0 })
    })

    it('deletes the document anyway when S3 fails', async () => {
      process.env.S3_COMMISSIONS_BUCKET = FAKE_BUCKET
      process.env.S3_REGION = 'eu-west-2'
      vi.mocked(deleteObjects).mockClear()
      vi.mocked(deleteObjects).mockRejectedValueOnce(new Error('S3 is unreachable'))

      const created = await createCommission({ title: `${PREFIX} delete me anyway` })
      const commission = await payload.update({
        collection: 'commissions',
        data: { files: filesFor(created.uuid ?? '') },
        depth: 0,
        id: created.id,
        overrideAccess: true,
      })

      // An orphaned object costs a fraction of a cent a month; a document that
      // cannot be deleted because a bucket is unreachable is a support call.
      // The logged error below is expected output, not a failure.
      await payload.delete({ collection: 'commissions', id: commission.id, overrideAccess: true })

      expect(deleteObjects).toHaveBeenCalledTimes(1)
      expect(
        await payload.find({
          collection: 'commissions',
          overrideAccess: true,
          where: { id: { equals: commission.id } },
        }),
      ).toMatchObject({ totalDocs: 0 })
    })

    it('cascades its access-log rows, so a commission that was viewed can go', async () => {
      // Regression test for a bug that reached the working tree.
      // `commission-access-log.commission` is `required`, which makes the
      // column NOT NULL, while the generated foreign key is `ON DELETE set
      // null` — a pair SQLite cannot satisfy. Before `deleteCommissionAccessLog`
      // existed, deleting any commission that had ever been opened failed with
      // `SQLITE_CONSTRAINT_NOTNULL` and the document was stuck for good. So the
      // assertion that matters here is simply that the delete returns at all.
      delete process.env.S3_COMMISSIONS_BUCKET

      const commission = await createCommission({
        enabled: true,
        title: `${PREFIX} viewed then deleted`,
      })

      await logCommissionAccess({
        commissionId: commission.id,
        event: 'view',
        headers: new Headers({ 'user-agent': 'curl/8.7.1', 'x-forwarded-for': '198.51.100.99' }),
        payload,
      })

      expect(await accessLogCount(commission.id)).toBe(1)

      await payload.delete({ collection: 'commissions', id: commission.id, overrideAccess: true })

      // And nothing is left pointing at a commission that no longer exists: a
      // log row is only ever read through the `accessLog` join on its parent,
      // so an orphan would be unreachable rather than merely untidy.
      expect(await accessLogCount(commission.id)).toBe(0)
      expect(
        await payload.find({
          collection: 'commissions',
          overrideAccess: true,
          where: { id: { equals: commission.id } },
        }),
      ).toMatchObject({ totalDocs: 0 })
    })

    it('skips S3 entirely when no bucket is configured', async () => {
      // The case a fresh checkout with no AWS environment is in: the delete
      // has to work, and nothing may try to sign anything.
      delete process.env.S3_COMMISSIONS_BUCKET
      vi.mocked(deleteObjects).mockClear()

      const created = await createCommission({ title: `${PREFIX} delete unconfigured` })
      const commission = await payload.update({
        collection: 'commissions',
        data: { files: filesFor(created.uuid ?? '') },
        depth: 0,
        id: created.id,
        overrideAccess: true,
      })

      await payload.delete({ collection: 'commissions', id: commission.id, overrideAccess: true })

      expect(deleteObjects).not.toHaveBeenCalled()
    })
  })
})
