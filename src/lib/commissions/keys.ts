/**
 * S3 object keys for commission deliverables.
 *
 * **The bucket these keys live in has public access blocked and no CDN in front
 * of it.** A presigned URL is therefore the only way to read one of these
 * objects, by construction rather than by configuration — nothing here or
 * anywhere else may ever build a CDN URL for a commission key. `joinCdnFileURL`
 * in `@/lib/aws/s3` is for the media bucket and only the media bucket; the two
 * buckets exist separately precisely so that the difference cannot come down to
 * remembering.
 *
 * Layout is `<commission uuid>/<file id>/<safe filename>`, with no leading
 * prefix segment: the bucket is single-purpose and its name says so, so a
 * `commissions/` folder inside `krisi-commission-files` would be noise.
 *
 * The `fileId` segment is what guarantees uniqueness, which is why
 * `sanitiseFilename` only has to make a name *safe* — two files called
 * `final.zip` land in different folders and neither has to be renamed.
 */

/** Longest filename that goes into a key. Well under S3's 1024-byte key limit. */
const MAX_FILENAME_LENGTH = 120

/** What is left when a filename sanitises down to nothing at all. */
const FALLBACK_FILENAME = 'file'

/** ASCII control characters, including DEL. */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g

/**
 * Makes an uploaded filename safe to put in a key.
 *
 * Cyrillic, accents and spaces survive — the artist's clients get files named
 * the way the artist named them, and S3 keys are UTF-8. What does not survive:
 *
 * - path separators, including the backslash Windows sends, so `../../secrets`
 *   cannot climb out of the commission's folder;
 * - control characters, which have no business in a key or in a
 *   `Content-Disposition` header;
 * - leading dots, so nothing becomes a hidden file when it is saved;
 * - runs of whitespace, collapsed to one space.
 *
 * The length cap is applied last and keeps the extension, because a name
 * truncated to `verylongname` and one truncated to `verylongname.zip` are not
 * equally useful to whoever downloads it.
 */
export const sanitiseFilename = (input: string): string => {
  const stripped = input
    .replace(CONTROL_CHARACTERS, '')
    .replace(/[/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .trim()

  if (!stripped) {
    return FALLBACK_FILENAME
  }

  if (stripped.length <= MAX_FILENAME_LENGTH) {
    return stripped
  }

  const dot = stripped.lastIndexOf('.')
  // Only treat a trailing dot group as an extension when it looks like one — a
  // dot in the middle of a 300-character sentence is not.
  const extension = dot > 0 && stripped.length - dot <= 12 ? stripped.slice(dot) : ''

  return stripped.slice(0, MAX_FILENAME_LENGTH - extension.length) + extension
}

/** `<commission uuid>/<file id>/<safe filename>`. */
export const buildCommissionKey = ({
  commissionUuid,
  fileId,
  filename,
}: {
  commissionUuid: string
  fileId: string
  filename: string
}): string => `${commissionUuid}/${fileId}/${sanitiseFilename(filename)}`

/**
 * Whether a key belongs to this commission.
 *
 * The register endpoint hands the key it was given straight to `headObject`, so
 * without this check an editor could register an object from *another*
 * commission — or any object in the bucket — as a file of theirs. The check is
 * on the exact path shape as well as the first segment, so neither a prefix
 * collision (`abc` matching `abcd/...`) nor a traversal attempt gets through.
 */
export const isKeyForCommission = (key: string, commissionUuid: string): boolean => {
  if (!key || !commissionUuid || key.includes('..')) {
    return false
  }

  const segments = key.split('/')

  return (
    segments.length === 3 &&
    segments[0] === commissionUuid &&
    Boolean(segments[1]) &&
    Boolean(segments[2])
  )
}
