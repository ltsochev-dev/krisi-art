'use client'

import dynamic from 'next/dynamic'
import { ExternalLink } from 'lucide-react'
import { ReactNode, Suspense } from 'react'

const PlatformMap = {
  facebook: dynamic(() => import('@/components/icons/facebook')),
  instagram: dynamic(() => import('@/components/icons/instagram')),
  pinterest: dynamic(() => import('@/components/icons/pinterest')),
  artstation: dynamic(() => import('@/components/icons/artstation')),
}

type Platform = keyof typeof PlatformMap

interface Props {
  platform: string
}

const isPlatform = (value: string): value is Platform => Object.hasOwn(PlatformMap, value)

const SocialIcon = ({ platform }: Props): ReactNode => {
  // The select offers more platforms than there are brand marks in
  // `./icons` — linkedin, behance, tiktok, youtube, other. Falling back to a
  // generic mark keeps those links visible; returning null left an empty circle.
  if (!isPlatform(platform)) return <ExternalLink size={20} />

  const Icon = PlatformMap[platform]

  return (
    <Suspense>
      <Icon />
    </Suspense>
  )
}

export default SocialIcon
