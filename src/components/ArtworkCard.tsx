'use client'

import { motion } from 'motion/react'

import type { GalleryArtwork } from '@/lib/content/queries'

interface ArtworkCardProps {
  artwork: GalleryArtwork
  index: number
  /** Opens the lightbox on this card. Omit to render a non-interactive card. */
  onOpen?: () => void
}

const ArtworkCard = ({ artwork, index, onOpen }: ArtworkCardProps) => {
  // `findGalleryArtworks` already filters on `image.enabled`, so this is a
  // belt-and-braces guard rather than an expected branch.
  const src = artwork.image?.sizes.card ?? artwork.image?.url

  if (!src) {
    return null
  }

  const meta = [artwork.year, artwork.medium].filter(Boolean).join(' · ')

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="gallery-card group rounded-lg"
    >
      <div className="relative aspect-4/5 overflow-hidden rounded-lg">
        <motion.img
          src={src}
          alt={artwork.image?.alt ?? artwork.title}
          width={artwork.image?.width ?? undefined}
          height={artwork.image?.height ?? undefined}
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
          loading="lazy"
        />

        {/* Overlay */}
        <div className="absolute inset-0 z-10 bg-linear-to-t from-background/90 via-background/20 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

        {/* Content */}
        <div className="absolute right-0 bottom-0 left-0 z-20 translate-y-4 p-6 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
          <span className="mb-2 block font-sans text-xs tracking-widest text-primary uppercase">
            {artwork.album.title}
          </span>
          <h3 className="mb-1 font-serif text-2xl text-foreground">{artwork.title}</h3>
          {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
        </div>

        {/*
          The trigger is an empty button stretched over the card rather than a
          wrapper around it: a button may only contain phrasing content, and the
          caption above carries a heading. This way the lightbox is reachable by
          keyboard — focus, Enter and Space for free — without invalid nesting or
          a div pretending to be a control.
        */}
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`View ${artwork.title} enlarged`}
            className="absolute inset-0 z-30 cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset"
          />
        )}
      </div>
    </motion.article>
  )
}

export default ArtworkCard
