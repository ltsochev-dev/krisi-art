'use client'

/**
 * The file list a client downloads from.
 *
 * A client component for two reasons, and neither is the list itself — that is
 * rendered from props the server already resolved.
 *
 * **Downloads go through a `fetch`, not a link.** The endpoint answers with a
 * presigned S3 URL as JSON and the browser is then navigated to it, rather than
 * being 302'd. That keeps the signed URL out of the referrer chain and out of
 * any proxy log that records redirect targets, and it is why there is a button
 * here instead of an `<a href>`. The URL is short-lived (see
 * `DOWNLOAD_URL_TTL_SECONDS`), so it is fetched at the moment of the click and
 * never rendered into the page.
 *
 * **View tracking is client-side** because a `<meta>`-scraping preview bot
 * (Slack, WhatsApp, Signal) fetches the HTML but never runs the effect, so
 * unfurls do not inflate the counter.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { PublicCommissionFile } from '@/lib/content/commissions'

const DOWNLOAD_FAILED = 'That download could not be started. Please try again in a moment.'

/**
 * Sizes as a person reads them.
 *
 * One decimal below 10 in a unit and none above it, so a list of files reads as
 * "820 KB / 4.2 MB / 130 MB" rather than as a column of spurious precision.
 * `null` for a missing or zero size — the metadata comes from S3's own
 * `HeadObject`, but a row written before that check existed would have none, and
 * "0 B" is worse than nothing.
 */
const formatSize = (bytes: null | number): null | string => {
  if (!bytes || bytes <= 0) {
    return null
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let index = 0
  let value = bytes

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }

  return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`
}

export default function CommissionFiles({
  files,
  uuid,
}: {
  files: PublicCommissionFile[]
  uuid: string
}) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pendingFileId, setPendingFileId] = useState<null | string>(null)

  /**
   * Belt to `sessionStorage`'s braces: React runs effects twice in development
   * under Strict Mode, and a ref is the only guard that survives that in a tab
   * where storage is unavailable.
   */
  const tracked = useRef(false)

  useEffect(() => {
    const storageKey = `commission-view:${uuid}`

    /**
     * `sessionStorage` throws outright in some private-browsing and
     * cookies-blocked configurations rather than returning null, so every access
     * is guarded. Losing the guard only means the view is reported again on a
     * remount, and the endpoint dedupes by IP and user-agent inside a
     * thirty-minute window anyway — so the failure mode is a duplicate request
     * that changes nothing, not a broken page.
     */
    try {
      if (window.sessionStorage.getItem(storageKey)) {
        tracked.current = true
      }
    } catch {
      // Storage unavailable; the ref and the server-side dedupe cover it.
    }

    if (tracked.current) {
      return
    }

    tracked.current = true

    try {
      window.sessionStorage.setItem(storageKey, '1')
    } catch {
      // As above.
    }

    // Fire and forget: nothing on the page depends on the answer, and a failed
    // view count must never surface as an error to the client.
    void fetch(`/api/commissions/${encodeURIComponent(uuid)}/track`, {
      body: '{}',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }).catch(() => {
      // Ignored on purpose.
    })
  }, [uuid])

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
        // client is on does not change.
        window.location.href = body.url
      } catch {
        setErrors((previous) => ({ ...previous, [fileId]: DOWNLOAD_FAILED }))
      } finally {
        setPendingFileId(null)
      }
    },
    [uuid],
  )

  if (files.length === 0) {
    return <p className="note">There are no files on this delivery yet.</p>
  }

  return (
    <ul className="files">
      {files.map((file) => {
        const size = formatSize(file.filesize)

        return (
          <li className="file" key={file.fileId}>
            <div className="file__text">
              <div className="file__name">{file.name}</div>
              {size ? <div className="file__meta">{size}</div> : null}
            </div>

            <button
              className="button"
              disabled={pendingFileId === file.fileId}
              onClick={() => void download(file.fileId)}
              type="button"
            >
              {pendingFileId === file.fileId ? 'Preparing…' : 'Download'}
            </button>

            {errors[file.fileId] ? (
              <p className="file__error" role="alert">
                {errors[file.fileId]}
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
