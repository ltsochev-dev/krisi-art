/**
 * The commission as the client sees it: a title, a note from the artist, and a
 * list of files to download.
 *
 * Addressed by the commission's UUID and by nothing else — possession of the
 * link is the authorisation, which is why the read helper is one of only two
 * places in the app that reach into an `editors`-only collection on an anonymous
 * request. See the note at the top of `@/lib/content/commissions`.
 *
 * Three things about what this page does and does not send:
 *
 * - **`notFound()` covers every refusal.** `findCommissionByUuid` returns `null`
 *   for a commission that does not exist, one that is not enabled and one whose
 *   expiry has passed, and all three render the same 404. A client with a lapsed
 *   link gets no confirmation that the UUID was ever valid, and someone probing
 *   for links learns nothing from the response.
 * - **The password gate is an early return, not a conditional branch in the
 *   tree.** When a password is required and the request has no valid unlock
 *   cookie, the file list is never constructed at all — so it cannot end up in
 *   the RSC payload, which is a thing that reaches the browser whether or not
 *   the markup renders it.
 * - **Nothing on this page is a secret in the S3 sense.** The projection carries
 *   `fileId`s, never keys; the client asks the download endpoint for a signed URL
 *   at the moment it clicks.
 */
import type { Metadata } from 'next'

import React from 'react'

import { cookies as getCookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import CommissionFiles from '@/components/commission/CommissionFiles'
import PasswordGate from '@/components/commission/PasswordGate'
import { unlockCookieName, verifyUnlockToken } from '@/lib/commissions/password'
import { findCommissionByUuid } from '@/lib/content/commissions'
import config from '@/payload.config'

type Props = { params: Promise<{ uuid: string }> }

/**
 * Only the title, so the `robots` directives set on the layout survive — Next
 * merges metadata field by field at the top level, and this route must stay
 * unindexed.
 *
 * A password-protected commission does not put its title here. The tab, and any
 * link unfurl a chat app generates from the `<title>`, are both outside the
 * gate; the title is the one field the gate is protecting, so it is withheld
 * until the password has been typed. That this costs a second uncached read of
 * the same document is deliberate and cheap: the audience for the page is one
 * person clicking one link.
 */
export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { uuid } = await params
  const payload = await getPayload({ config: await config })
  const commission = await findCommissionByUuid({ payload, uuid })

  if (!commission) {
    return {}
  }

  return { title: commission.hasPassword ? 'Protected files' : commission.title }
}

export default async function CommissionPage({ params }: Props) {
  const { uuid } = await params
  const payload = await getPayload({ config: await config })
  const commission = await findCommissionByUuid({ payload, uuid })

  if (!commission) {
    notFound()
  }

  if (commission.hasPassword) {
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

  return (
    <main className="page">
      <div className="card">
        <h1 className="card__title">{commission.title}</h1>
        {commission.description ? <p className="card__intro">{commission.description}</p> : null}

        <h2 className="card__heading">Files</h2>
        <CommissionFiles files={commission.files} uuid={uuid} />
      </div>

      {/* Said once, near the buttons, because it is the one surprising thing
          about the page: a download link is minted per click and dies within
          minutes, so a copied URL will not work later or for anyone else. */}
      <p className="note">
        Each download link is generated for you and expires within a few minutes. Come back to this
        page whenever you need the files again.
      </p>
    </main>
  )
}
