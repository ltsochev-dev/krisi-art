/**
 * A commission at its vanity slug — `/album/prague-2026`.
 *
 * The same document, the same gate and the same rendering as the UUID route
 * next door; only the lookup differs. What differs *in kind* is the address
 * itself: a slug is chosen to be memorable, which means it is also guessable, so
 * this route is a shallower hole than the UUID one. `@/lib/commissions/routes`
 * writes that trade down, and the collection's field description repeats it to
 * the artist at the moment they type one in.
 *
 * It follows that a slug is a convenience and never the protection. An album
 * that must stay unfindable either has no slug or carries a password as well —
 * and either way the layout sends `noindex` and `robots.ts` disallows the whole
 * `/album/` prefix, so nothing here reaches a search index by the usual route.
 *
 * `notFound()` covers every refusal, exactly as on the UUID route, and for the
 * same reason: a probe must not be able to tell a slug that is wrong from one
 * that is right but expired.
 */
import type { Metadata } from 'next'

import React from 'react'

import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import CommissionView from '@/components/commission/CommissionView'
import { evaluateCommissionGate, findCommissionRecordBySlug } from '@/lib/content/commissions'
import config from '@/payload.config'

type Props = { params: Promise<{ slug: string }> }

const resolve = async (slug: string) => {
  const payload = await getPayload({ config: await config })
  const commission = await findCommissionRecordBySlug({ payload, slug })

  return commission?.uuid && evaluateCommissionGate(commission).ok ? commission : null
}

/**
 * The title only, so the layout's `robots` directives survive the merge — and
 * withheld entirely behind a password, for the reason the UUID route gives: the
 * `<title>` is outside the gate and is the one field the gate protects.
 */
export const generateMetadata = async ({ params }: Props): Promise<Metadata> => {
  const { slug } = await params
  const commission = await resolve(slug)

  if (!commission) {
    return {}
  }

  return { title: commission.passwordHash ? 'Protected album' : commission.title }
}

export default async function AlbumPage({ params }: Props) {
  const { slug } = await params
  const commission = await resolve(slug)

  if (!commission?.uuid) {
    notFound()
  }

  return <CommissionView commission={commission} uuid={commission.uuid} />
}
