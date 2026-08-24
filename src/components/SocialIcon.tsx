'use client'

import dynamic from 'next/dynamic'
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
  if (!isPlatform(platform)) return null

  const Icon = PlatformMap[platform]

  return (
    <Suspense>
      <Icon />
    </Suspense>
  )
}

export default SocialIcon
