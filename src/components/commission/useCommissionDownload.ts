'use client'

/**
 * Asking the server for a download, and remembering how it went.
 *
 * **Downloads go through a `fetch`, not a link.** The endpoint answers with a
 * presigned S3 URL as JSON and the browser is then navigated to it, rather than
 * being 302'd. That keeps the signed URL out of the referrer chain and out of
 * any proxy log that records redirect targets, and it is why the callers render
 * a button instead of an `<a href>`. The URL is short-lived (see
 * `DOWNLOAD_URL_TTL_SECONDS`), so it is fetched at the moment of the click and
 * never rendered into the page.
 *
 * Shared by the file list and the gallery's viewer. Note that it is the only
 * *counted* way to take a copy of a gallery photo: the grid's own images are
 * already-signed inline URLs, so a right-click-and-save reads a URL the page
 * handed over and never reaches the server. See `@/lib/commissions/gallery`.
 */
import { useCallback, useState } from 'react'

const DOWNLOAD_FAILED = 'That download could not be started. Please try again in a moment.'

export type CommissionDownload = {
  download: (fileId: string) => Promise<void>
  errors: Record<string, string>
  pendingFileId: null | string
}

export const useCommissionDownload = (uuid: string): CommissionDownload => {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pendingFileId, setPendingFileId] = useState<null | string>(null)

  const download = useCallback(
    async (fileId: string) => {
      setErrors((previous) => {
        const { [fileId]: _removed, ...rest } = previous

        return rest
      })
      setPendingFileId(fileId)

      try {
        const response = await fetch(
          `/api/commissions/${encodeURIComponent(uuid)}/download/${encodeURIComponent(fileId)}`,
          { method: 'POST' },
        )

        // The error bodies carry a `message` worth showing — "the password is
        // required", "file storage is not configured" — but a 429 or a proxy
        // error may not be JSON at all, hence the fallback.
        const body = (await response.json().catch(() => null)) as null | {
          message?: string
          url?: string
        }

        if (!response.ok || !body?.url) {
          setErrors((previous) => ({ ...previous, [fileId]: body?.message ?? DOWNLOAD_FAILED }))

          return
        }

        // A plain navigation, not an `<a download>`: the signed URL already
        // carries a `Content-Disposition: attachment` that S3 will honour, so
        // the browser saves the file under its original name and the page the
        // visitor is on does not change.
        window.location.href = body.url
      } catch {
        setErrors((previous) => ({ ...previous, [fileId]: DOWNLOAD_FAILED }))
      } finally {
        setPendingFileId(null)
      }
    },
    [uuid],
  )

  return { download, errors, pendingFileId }
}
