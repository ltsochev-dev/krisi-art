import type { Payload } from 'payload'

import sharp from 'sharp'

import type { Media } from '@/payload-types'

/**
 * Creates a real Media document from a generated PNG.
 *
 * Real rather than faked because `artworks.image` is a required upload
 * relationship with a foreign key behind it — a made-up id would fail at the
 * database, not at validation. Generating the bytes also means the `imageSizes`
 * pipeline actually runs, so tests can assert on the derivatives.
 *
 * `vitest.setup.ts` unsets `S3_BUCKET`, so these land on local disk.
 */
export const seedMedia = async ({
  alt = 'Test image',
  height = 1200,
  name,
  payload,
  width = 1600,
}: {
  alt?: string
  height?: number
  name: string
  payload: Payload
  width?: number
}): Promise<Media> => {
  const data = await sharp({
    create: {
      background: { b: 200, g: 150, r: 100 },
      channels: 3,
      height,
      width,
    },
  })
    .png()
    .toBuffer()

  return await payload.create({
    collection: 'media',
    data: { alt },
    file: {
      data,
      mimetype: 'image/png',
      name: `${name}.png`,
      size: data.byteLength,
    },
    overrideAccess: true,
  })
}
