import type { S3ClientConfig } from '@aws-sdk/client-s3'

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export type S3Config = {
  bucket: string
  /**
   * Public base URL of a CDN in front of the bucket (a CloudFront distribution).
   *
   * When set, media URLs point straight at it and the bytes never pass through
   * this server. Leave unset and uploads are streamed through
   * `/api/media/file/...` instead, which is what keeps a checkout with no CDN
   * working.
   */
  cdnUrl?: string
  /** Set for S3-compatible providers (MinIO, R2, Spaces); leave unset for real S3. */
  endpoint?: string
  forcePathStyle: boolean
  region: string
}

/**
 * Accepts either a bare hostname or a full origin, and returns it without a
 * trailing slash — so `d111.cloudfront.net`, `https://d111.cloudfront.net` and
 * `https://d111.cloudfront.net/` all normalise to the same thing.
 */
const normaliseCdnUrl = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim().replace(/\/+$/, '')

  if (!trimmed) {
    return undefined
  }

  return trimmed.includes('://') ? trimmed : `https://${trimmed}`
}

/**
 * Joins a CDN base, an optional per-document prefix and a filename into a public
 * media URL. Shared so `generateFileURL` in `payload.config.ts` and the admin
 * thumbnail in the media collection cannot drift apart.
 */
export const joinCdnFileURL = (cdnUrl: string, filename: string, prefix?: string): string =>
  [cdnUrl, prefix, encodeURIComponent(filename)].filter(Boolean).join('/')

/**
 * CDN base for public media URLs, or `undefined` when there is none and files
 * are served by this app instead.
 *
 * Unlike `getS3Config` this never throws, so it is safe to call from a
 * collection config that also has to work in a checkout with no AWS environment
 * at all. It mirrors the same guard `payload.config.ts` uses to decide whether
 * to configure the storage plugin: no bucket means no CDN, whatever
 * `S3_CDN_URL` happens to say.
 */
export const getMediaCdnUrl = (): string | undefined =>
  process.env.S3_BUCKET?.trim() ? normaliseCdnUrl(process.env.S3_CDN_URL) : undefined

class S3ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'S3ConfigError'
  }
}

const required = (name: string): string => {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new S3ConfigError(`Missing required environment variable ${name}.`)
  }

  return value
}

let cachedConfig: S3Config | undefined

export const getS3Config = (): S3Config => {
  if (cachedConfig) {
    return cachedConfig
  }

  cachedConfig = {
    bucket: required('S3_BUCKET'),
    cdnUrl: normaliseCdnUrl(process.env.S3_CDN_URL),
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    region: required('S3_REGION'),
  }

  return cachedConfig
}

let cachedClient: S3Client | undefined

/**
 * Shared S3 client.
 *
 * This app is deployed as a container on a plain VPS, so there is no instance
 * role to fall back on — static keys from the environment are the normal path.
 * We still omit `credentials` when they are absent so the default AWS provider
 * chain (instance/task role, SSO, shared config) keeps working if this ever
 * moves onto AWS infrastructure.
 */
export const getS3Client = (): S3Client => {
  if (cachedClient) {
    return cachedClient
  }

  const { endpoint, forcePathStyle, region } = getS3Config()
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()

  const config: S3ClientConfig = { region }

  if (endpoint) {
    config.endpoint = endpoint
    config.forcePathStyle = forcePathStyle
  }

  if (accessKeyId && secretAccessKey) {
    config.credentials = {
      accessKeyId,
      secretAccessKey,
      ...(process.env.AWS_SESSION_TOKEN?.trim()
        ? { sessionToken: process.env.AWS_SESSION_TOKEN.trim() }
        : {}),
    }
  }

  cachedClient = new S3Client(config)

  return cachedClient
}

/**
 * The private bucket commission deliverables live in.
 *
 * A *second* bucket rather than a prefix in the media one, and the difference
 * matters: `S3_BUCKET` is public-by-CDN (see `getMediaCdnUrl` and the storage
 * plugin note in `payload.config.ts`), while this one has public access blocked
 * and no distribution in front of it, so a presigned URL is the only way to read
 * a byte out of it. That is a property of the infrastructure, not of a code path
 * someone could later "optimise" — see `docs/plans/commissions-infra.md`.
 *
 * Region, credentials, endpoint and path-style are shared with the media
 * config: one client, one region. If this bucket ever moves elsewhere, that is
 * the moment to add `S3_COMMISSIONS_REGION` and a second client.
 */
export const getCommissionsBucket = (): string => required('S3_COMMISSIONS_BUCKET')

/**
 * Non-throwing probe for the same thing.
 *
 * `getCommissionsBucket` throws, which is right for a code path that is about to
 * sign a URL and wrong for one that has to render a page. The endpoints and the
 * admin uploader call this first so a checkout with no AWS environment says
 * "file storage is not configured" instead of returning a 500.
 *
 * `S3_REGION` is part of the check because the shared client cannot be
 * constructed without it — a bucket name on its own is not a working
 * configuration.
 */
export const hasCommissionsBucket = (): boolean =>
  Boolean(process.env.S3_COMMISSIONS_BUCKET?.trim() && process.env.S3_REGION?.trim())

/**
 * Time-limited download URL for a private object.
 *
 * `bucket` defaults to the media bucket so existing call sites are unaffected.
 * Commission code always passes `getCommissionsBucket()` explicitly and never
 * relies on the default: a commission key signed against the media bucket would
 * either 404 or, worse, resolve to an unrelated object, and the media bucket is
 * the one with a CDN in front of it.
 *
 * `responseContentDisposition` and `responseContentType` are *signed*
 * parameters — they are part of what the signature covers, so whoever holds the
 * URL cannot rewrite them to render an attachment inline. Without the first, a
 * browser paints a JPEG on screen instead of saving it and the client loses the
 * original filename.
 *
 * `signingDate` pins the timestamp the signature is computed from, which is
 * otherwise "now" and therefore different on every call. Passing a rounded one
 * makes repeated signings of the same object produce the *same* URL, so a
 * browser can serve it from cache instead of re-downloading — see
 * `GALLERY_URL_WINDOW_SECONDS`. It shortens the URL's remaining life by however
 * far back it is rounded, so a caller that pins it has to budget `expiresIn`
 * accordingly.
 */
export const getPresignedDownloadUrl = async ({
  bucket,
  expiresIn = 900,
  key,
  responseContentDisposition,
  responseContentType,
  signingDate,
}: {
  bucket?: string
  expiresIn?: number
  key: string
  responseContentDisposition?: string
  responseContentType?: string
  signingDate?: Date
}): Promise<string> =>
  await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: bucket ?? getS3Config().bucket,
      Key: key,
      ResponseContentDisposition: responseContentDisposition,
      ResponseContentType: responseContentType,
    }),
    { expiresIn, ...(signingDate ? { signingDate } : {}) },
  )

/**
 * Time-limited URL a client can PUT directly to, bypassing this server.
 *
 * The signature pins `ContentType`, so S3 rejects a PUT whose header says
 * something else. That is what makes a MIME allowlist at the point the URL is
 * issued worth anything at all.
 */
export const getPresignedUploadUrl = async ({
  bucket,
  contentType,
  expiresIn = 900,
  key,
}: {
  bucket?: string
  contentType?: string
  expiresIn?: number
  key: string
}): Promise<string> =>
  await getSignedUrl(
    getS3Client(),
    new PutObjectCommand({
      Bucket: bucket ?? getS3Config().bucket,
      ContentType: contentType,
      Key: key,
    }),
    { expiresIn },
  )

/**
 * Size and type of an object as S3 actually stored it.
 *
 * The server never trusts a client-reported size: a presigned PUT cannot
 * enforce a content length, so the only honest number is the one read back
 * afterwards. Returns `null` when the object is not there, which is the normal
 * answer for an upload that never completed.
 */
export const headObject = async ({
  bucket,
  key,
}: {
  bucket: string
  key: string
}): Promise<null | { contentLength: number; contentType: string | undefined }> => {
  try {
    const head = await getS3Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }))

    return { contentLength: head.ContentLength ?? 0, contentType: head.ContentType }
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode

    if (status === 404 || (error as Error)?.name === 'NotFound') {
      return null
    }

    throw error
  }
}

/**
 * Delete objects in one call. A no-op on an empty list — `DeleteObjects` rejects
 * a request with no keys, and every caller here builds its list from a document
 * that may legitimately have no files.
 */
export const deleteObjects = async ({
  bucket,
  keys,
}: {
  bucket: string
  keys: string[]
}): Promise<void> => {
  if (keys.length === 0) {
    return
  }

  await getS3Client().send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    }),
  )
}
