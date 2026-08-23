/**
 * Bulk media importer.
 *
 * Walks a directory whose immediate subfolders are albums and whose image files
 * become Media documents with a matching Artwork each:
 *
 *     import/portraits/anna-in-blue.jpg  ->  Album "Portraits"
 *                                            Media (alt: "Anna in blue")
 *                                            Artwork "Anna in blue"
 *
 * Everything lands with `media.enabled = false`, which is the point of running
 * this rather than clicking through the admin: the whole archive goes in at once
 * and stays invisible until the artist reviews each image and ticks it live. The
 * artworks themselves are created published, so an image appears on the site the
 * moment its media doc is enabled and not before — see `toGalleryImage` in
 * `@/lib/content/gallery`.
 *
 * Safe to re-run. Albums are matched on slug, images on filename and artworks on
 * the media they point at, so a second pass over the same folder imports only
 * what is new — which also makes a run that dies halfway resumable.
 *
 * Run it with `pnpm seed:media <directory>`, and add `--dry-run` to see the plan
 * without writing anything.
 */
import 'dotenv/config'

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import type { Album, Media } from '@/payload-types'

import { type Payload, getPayload } from 'payload'
import { slugify } from 'payload/shared'

import { ensureDefaultAlbum } from '@/lib/content/default-album'
import config from '@/payload.config'

/**
 * `Media.upload.mimeTypes` is `image/*`, so anything Payload would reject is
 * filtered out here rather than failing mid-import. The extension decides the
 * mimetype because `payload.create` wants one supplied with the buffer.
 */
const IMAGE_MIME_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.webp': 'image/webp',
}

/** `anna-in-blue` -> `Anna in blue`. Reads as a caption. */
const toSentenceCase = (value: string): string => {
  const words = value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** `oil-paintings` -> `Oil Paintings`. Reads as a chip label. */
const toTitleCase = (value: string): string =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

type Counts = { albums: number; artworks: number; media: number; skipped: number }

const findAlbumBySlug = async (payload: Payload, slug: string): Promise<Album | undefined> => {
  const { docs } = await payload.find({
    collection: 'albums',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { slug: { equals: slug } },
  })

  return docs[0]
}

const findMediaByFilename = async (
  payload: Payload,
  filename: string,
): Promise<Media | undefined> => {
  const { docs } = await payload.find({
    collection: 'media',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: { filename: { equals: filename } },
  })

  return docs[0]
}

const artworkExistsForMedia = async (payload: Payload, mediaId: number): Promise<boolean> => {
  const { totalDocs } = await payload.find({
    collection: 'artworks',
    depth: 0,
    limit: 0,
    overrideAccess: true,
    where: { image: { equals: mediaId } },
  })

  return totalDocs > 0
}

/**
 * Imports one folder of images into one album.
 *
 * The album is only created once a usable image has actually been found, so a
 * folder of stray `.txt` files does not leave an empty album behind.
 */
const importAlbum = async ({
  albumTitle,
  counts,
  dryRun,
  files,
  payload,
  resolveAlbum,
  sourceDir,
}: {
  albumTitle: string
  counts: Counts
  dryRun: boolean
  files: string[]
  payload: Payload
  resolveAlbum: () => Promise<Album>
  sourceDir: string
}): Promise<void> => {
  const images = files.filter((file) => IMAGE_MIME_TYPES[path.extname(file).toLowerCase()])
  const ignored = files.filter((file) => !images.includes(file))

  if (images.length === 0) {
    counts.skipped += ignored.length
    return
  }

  console.log(`  ${albumTitle} — ${images.length} image(s)`)

  for (const skipped of ignored) {
    console.log(`    - ${skipped} (not an image, skipped)`)
    counts.skipped += 1
  }

  // Safe to resolve up front now that the folder is known to hold images, so a
  // folder of stray files still never leaves an empty album behind.
  const album = await resolveAlbum()
  let sortOrder = 0

  for (const file of images) {
    const existingMedia = await findMediaByFilename(payload, file)

    if (existingMedia && (await artworkExistsForMedia(payload, existingMedia.id))) {
      console.log(`    = ${file} (already imported)`)
      counts.skipped += 1
      sortOrder += 1
      continue
    }

    const title = toSentenceCase(path.basename(file, path.extname(file)))

    if (dryRun) {
      console.log(`    + ${file} -> "${title}"`)
      counts.media += existingMedia ? 0 : 1
      counts.artworks += 1
      sortOrder += 1
      continue
    }

    let media = existingMedia

    if (!media) {
      const data = await readFile(path.join(sourceDir, file))

      media = await payload.create({
        collection: 'media',
        // Nothing is public yet and there is no request to revalidate from, so
        // skip the per-document cache churn.
        context: { disableRevalidate: true },
        data: { alt: title, enabled: false },
        file: {
          data,
          mimetype: IMAGE_MIME_TYPES[path.extname(file).toLowerCase()] ?? 'image/jpeg',
          name: file,
          size: data.byteLength,
        },
        overrideAccess: true,
      })

      counts.media += 1
    }

    await payload.create({
      collection: 'artworks',
      context: { disableRevalidate: true },
      data: { album: album.id, image: media.id, published: true, sortOrder, title },
      overrideAccess: true,
    })

    counts.artworks += 1
    sortOrder += 1

    console.log(`    + ${file} -> "${title}"`)
  }
}

const main = async (): Promise<void> => {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const target = args.find((arg) => !arg.startsWith('--'))

  if (!target) {
    console.error('Usage: pnpm seed:media <directory> [--dry-run]')
    process.exit(1)
  }

  const sourceRoot = path.resolve(target)
  const entries = await readdir(sourceRoot, { withFileTypes: true }).catch(() => {
    console.error(`Cannot read directory: ${sourceRoot}`)
    process.exit(1)
  })

  // Announce the destinations before touching either. Uploads go wherever
  // `.env` points, which on this project is a real bucket.
  console.log(`\nSource:   ${sourceRoot}`)
  console.log(`Database: ${process.env.DATABASE_URL || '(unset)'}`)
  console.log(`Uploads:  ${process.env.S3_BUCKET?.trim() || 'local disk (media/)'}`)
  console.log(dryRun ? '\nDRY RUN — nothing will be written.\n' : '')

  const payload = await getPayload({ config: await config })
  const counts: Counts = { albums: 0, artworks: 0, media: 0, skipped: 0 }

  const directories = entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))
  const looseFiles = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort()

  for (const [index, directory] of directories.entries()) {
    const albumTitle = toTitleCase(directory.name)
    // `slugify` strips everything that is not a word character, so a folder
    // named only in punctuation or a non-Latin script can reduce to nothing —
    // and `albums.slug` is required and unique.
    const albumSlug = slugify(albumTitle) || ''

    if (!albumSlug) {
      console.log(`  ${directory.name} — no usable slug from this folder name, skipped`)
      counts.skipped += 1
      continue
    }

    const sourceDir = path.join(sourceRoot, directory.name)
    const files = (await readdir(sourceDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort()

    await importAlbum({
      albumTitle,
      counts,
      dryRun,
      files,
      payload,
      resolveAlbum: async () => {
        const existing = await findAlbumBySlug(payload, albumSlug)

        if (existing) {
          return existing
        }

        counts.albums += 1

        // A dry run still has to hand back something for the artwork rows to
        // reference, but it must not reach the database.
        if (dryRun) {
          return { id: -1, slug: albumSlug, title: albumTitle } as Album
        }

        return await payload.create({
          collection: 'albums',
          context: { disableRevalidate: true },
          // Published so the album can be offered as a homepage chip. Its
          // artworks stay invisible regardless until their media is enabled.
          data: { published: true, slug: albumSlug, sortOrder: index, title: albumTitle },
          overrideAccess: true,
        })
      },
      sourceDir,
    })
  }

  // Images sitting loose at the top level still belong somewhere, and the
  // fallback album is exactly the staging bucket for "not filed yet".
  if (looseFiles.length > 0) {
    await importAlbum({
      albumTitle: 'Uncategorized (loose files)',
      counts,
      dryRun,
      files: looseFiles,
      payload,
      resolveAlbum: async () => await ensureDefaultAlbum({ payload }),
      sourceDir: sourceRoot,
    })
  }

  console.log(
    `\n${dryRun ? 'Would import' : 'Imported'}: ${counts.albums} album(s), ${counts.media} image(s), ` +
      `${counts.artworks} artwork(s). ${counts.skipped} skipped.`,
  )

  if (!dryRun && counts.media > 0) {
    console.log(
      '\nEvery image is disabled. Enable them in the admin (Media list -> select -> Edit),\n' +
        'then add the albums as chips under Settings -> Homepage -> Gallery.',
    )
  }

  process.exit(0)
}

await main()
