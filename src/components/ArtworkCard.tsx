'use client'

import { motion } from 'motion/react'

import type { GalleryArtwork } from '@/lib/content/queries'

interface ArtworkCardProps {
  artwork: GalleryArtwork
  index: number
}

const ArtworkCard = ({ artwork, index }: ArtworkCardProps) => {
  // `findGalleryArtworks` already filters on `image.enabled`, so this is a
  // belt-and-braces guard rather than an expected branch.
  const src = artwork.image?.sizes.card ?? artwork.image?.url

  if (!src) {
    return null
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="gallery-card group cursor-pointer rounded-lg"
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
          {artwork.year !== null && (
            <span className="text-sm text-muted-foreground">{artwork.year}</span>
          )}
        </div>
      </div>
    </motion.article>
  )
}

export default ArtworkCard
