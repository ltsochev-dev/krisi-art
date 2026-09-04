'use client'

/**
 * The card grid plus its lightbox, shared by the homepage preview and the album
 * pages so both behave identically.
 *
 * Owning the open index here is what makes the lightbox step through exactly
 * what the viewer can see: the homepage passes its filtered set, an album page
 * passes the whole album, and neither needs to know the difference.
 */
import { useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'
import posthog from 'posthog-js'

import type { GalleryArtwork } from '@/lib/content/queries'

import ArtworkCard from './ArtworkCard'
import Lightbox from './Lightbox'

interface Props {
  artworks: GalleryArtwork[]
  /** Rendered in place of the grid when there is nothing to show. */
  emptyMessage?: string
}

const ArtworkGrid = ({ artworks, emptyMessage = 'Nothing here yet.' }: Props) => {
  const [openIndex, setOpenIndex] = useState<null | number>(null)

  if (artworks.length === 0) {
    return <p className="py-12 text-center text-muted-foreground">{emptyMessage}</p>
  }

  return (
    <>
      <motion.div layout className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {artworks.map((artwork, index) => (
            <ArtworkCard
              key={artwork.id}
              artwork={artwork}
              index={index}
              onOpen={() => {
                posthog.capture('artwork_viewed', {
                  artwork_id: artwork.id,
                  artwork_title: artwork.title,
                  album_title: artwork.album.title,
                  medium: artwork.medium,
                  year: artwork.year,
                })
                setOpenIndex(index)
              }}
            />
          ))}
        </AnimatePresence>
      </motion.div>

      <Lightbox
        artworks={artworks}
        index={openIndex}
        onClose={() => setOpenIndex(null)}
        onIndexChange={setOpenIndex}
      />
    </>
  )
}

export default ArtworkGrid
