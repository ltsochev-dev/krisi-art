/**
 * A commission at its UUID — the address minted with the document, and the one
 * that never changes.
 *
 * Possession of the link is the authorisation, which is why the read helper is
 * one of only two places in the app that reach into an `editors`-only collection
 * on an anonymous request. See the note at the top of `@/lib/content/commissions`.
 *
 * **When the artist has set a vanity slug this route redirects to it** rather
 * than serving the same page at a second URL. `@/lib/commissions/routes` explains
 * why that is not merely tidiness: the unlock cookie is scoped to the page's own
 * path, so two live addresses would mean a password typed at one of them not
 * being remembered at the other. The UUID link therefore keeps working forever,
 * as promised — it just hands over.
 *
 * `notFound()` covers every refusal. `findCommissionRecordByUuid` plus
 * `evaluateCommissionGate` reject a commission that does not exist, one that is
 * not enabled and one whose expiry has passed, and all three render the same
 * 404. A client with a lapsed link gets no confirmation that the UUID was ever
 * valid, and someone probing for links learns nothing from the response.
 */
import type { Metadata } from 'next'

import React from 'react'

import { notFound, redirect } from 'next/navigation'
import { getPayload } from 'payload'

import CommissionView from '@/components/commission/CommissionView'
import { commissionPath } from '@/lib/commissions/routes'
import { evaluateCommissionGate, findCommissionRecordByUuid } from '@/lib/content/commissions'
import config from '@/payload.config'

type Props = { params: Promise<{ uuid: string }> }

const resolve = async (uuid: string) => {
  const payload = await getPayload({ config: await config })
  const commission = await findCommissionRecordByUuid({ payload, uuid })

  return commission?.uuid && evaluateCommissionGate(commission).ok ? commission : null
}

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
  const commission = await resolve(uuid)

  if (!commission) {
    return {}
  }

  return { title: commission.passwordHash ? 'Protected files' : commission.title }
}

export default async function CommissionPage({ params }: Props) {
  const { uuid } = await params
  const commission = await resolve(uuid)

  if (!commission?.uuid) {
    notFound()
  }

  const canonical = commissionPath(commission)

  if (canonical && canonical !== `/commission/${encodeURIComponent(uuid)}`) {
    redirect(canonical)
  }

  return <CommissionView commission={commission} uuid={commission.uuid} />
}
