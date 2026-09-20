/**
 * Everything a commission's two routes have in common, which is everything
 * except how the document was looked up.
 *
 * `/commission/<uuid>` and `/album/<slug>` address the same document — see
 * `@/lib/commissions/routes` — so the password gate, the layout switch and the
 * signing of gallery URLs all live here rather than being written twice and
 * drifting. The pages resolve a record and gate it; this renders it.
 *
 * Two things about what this sends to the browser:
 *
 * - **The password gate is an early return, not a conditional branch in the
 *   tree.** When a password is required and the request has no valid unlock
 *   cookie, the file list and the signed image URLs are never constructed at
 *   all — so they cannot end up in the RSC payload, which is a thing that
 *   reaches the browser whether or not the markup renders it.
 * - **No S3 key ever leaves the server.** The file list carries `fileId`s and
 *   asks the download endpoint for a URL at the moment of a click. The gallery
 *   carries signed URLs, which are bearer tokens for one object for one window
 *   and are not keys — `@/lib/commissions/gallery` has the detail.
 */
import React from 'react'

import { cookies as getCookies } from 'next/headers'

import type { Commission } from '@/payload-types'

import CommissionFiles from '@/components/commission/CommissionFiles'
import CommissionGallery from '@/components/commission/CommissionGallery'
import PasswordGate from '@/components/commission/PasswordGate'
import { buildCommissionGallery } from '@/lib/commissions/gallery'
import { unlockCookieName, verifyUnlockToken } from '@/lib/commissions/password'
import { toCommissionLayout, toPublicCommission } from '@/lib/content/commissions'

/**
 * Said once, near the buttons, because it is the one surprising thing about the
 * file list: a download link is minted per click and dies within minutes, so a
 * copied URL will not work later or for anyone else.
 */
const FILES_NOTE =
  'Each download link is generated for you and expires within a few minutes. Come back to this page whenever you need the files again.'

/**
 * The gallery's version of the same warning, and it says something different
 * from what it used to.
 *
 * The grid draws resized copies now (see `@/components/commission/CommissionGallery`),
 * so right-clicking a tile saves a few kilobytes of preview rather than the
 * photograph. That is the right trade for a page that has to open at all on a
 * phone, but it would be a nasty surprise to find out afterwards — hence the
 * sentence pointing at the viewer, where the original is what is on screen and
 * Download original is what saves it.
 *
 * Nothing is said about the links expiring: they do, but a reload silently mints
 * new ones, so a visitor never meets it.
 */
const GALLERY_NOTE =
  'Open a photo to see it full size, then use Download original to save it — the small pictures in the grid are previews, not the full-resolution files. This page is private: only people with the link can see it.'

export default async function CommissionView({
  commission,
  uuid,
}: {
  commission: Commission
  uuid: string
}) {
  const projection = toPublicCommission(commission)

  if (projection.hasPassword) {
    const cookieStore = await getCookies()
    const unlocked = await verifyUnlockToken(cookieStore.get(unlockCookieName(uuid))?.value, uuid)

    if (!unlocked) {
      return (
        <main className="page">
          <PasswordGate uuid={uuid} />
        </main>
      )
    }
  }

  if (toCommissionLayout(commission.layout) === 'gallery') {
    const { files, images } = await buildCommissionGallery({ commission })

    return (
      <main className="page page--wide">
        <div className="card">
          <h1 className="card__title">{projection.title}</h1>
          {projection.description ? <p className="card__intro">{projection.description}</p> : null}

          <CommissionGallery images={images} uuid={uuid} />

          {/* Whatever the browser cannot paint — an archive, a PDF, the HEICs
              an iPhone album is full of. `trackView` is off because the grid
              above has already reported this visit. */}
          {files.length > 0 ? (
            <>
              <h2 className="card__heading">Files</h2>
              <CommissionFiles files={files} trackView={false} uuid={uuid} />
            </>
          ) : null}
        </div>

        <p className="note">{GALLERY_NOTE}</p>
      </main>
    )
  }

  return (
    <main className="page">
      <div className="card">
        <h1 className="card__title">{projection.title}</h1>
        {projection.description ? <p className="card__intro">{projection.description}</p> : null}

        <h2 className="card__heading">Files</h2>
        <CommissionFiles files={projection.files} uuid={uuid} />
      </div>

      <p className="note">{FILES_NOTE}</p>
    </main>
  )
}
