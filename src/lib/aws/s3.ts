import type { S3ClientConfig } from '@aws-sdk/client-s3'

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
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

/** Time-limited download URL for a private object. */
export const getPresignedDownloadUrl = async ({
  expiresIn = 900,
  key,
}: {
  expiresIn?: number
  key: string
}): Promise<string> =>
  await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({ Bucket: getS3Config().bucket, Key: key }),
    { expiresIn },
  )

/** Time-limited URL a client can PUT directly to, bypassing this server. */
export const getPresignedUploadUrl = async ({
  contentType,
  expiresIn = 900,
  key,
}: {
  contentType?: string
  expiresIn?: number
  key: string
}): Promise<string> =>
  await getSignedUrl(
    getS3Client(),
    new PutObjectCommand({ Bucket: getS3Config().bucket, ContentType: contentType, Key: key }),
    { expiresIn },
  )
