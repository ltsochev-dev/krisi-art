'use client'

/**
 * The file list a client downloads from.
 *
 * A client component for two reasons, and neither is the list itself — that is
 * rendered from props the server already resolved. Both now live in hooks of
 * their own, because a gallery commission needs the same two behaviours:
 * `useCommissionDownload` explains why a download is a `fetch` and not a link,
 * and `useCommissionView` explains why the view is reported from the browser.
 *
 * `trackView` is off when this list is the tail of a gallery page — the grid
 * above it has already reported the view, and one page must not count as two.
 */
import React from 'react'

import type { PublicCommissionFile } from '@/lib/content/commissions'

import { useCommissionDownload } from './useCommissionDownload'
import { useCommissionView } from './useCommissionView'

/**
 * Sizes as a person reads them.
 *
 * One decimal below 10 in a unit and none above it, so a list of files reads as
 * "820 KB / 4.2 MB / 130 MB" rather than as a column of spurious precision.
 * `null` for a missing or zero size — the metadata comes from S3's own
 * `HeadObject`, but a row written before that check existed would have none, and
 * "0 B" is worse than nothing.
 */
export const formatSize = (bytes: null | number): null | string => {
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
  trackView = true,
  uuid,
}: {
  files: PublicCommissionFile[]
  trackView?: boolean
  uuid: string
}) {
  const { download, errors, pendingFileId } = useCommissionDownload(uuid)

  // Hooks cannot be called conditionally, so the flag is passed down rather
  // than used to decide whether to call this.
  useCommissionView(trackView ? uuid : '')

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
