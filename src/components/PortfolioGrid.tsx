'use client'

import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import Link from 'next/link'
import posthog from 'posthog-js'
import ArtworkGrid from './ArtworkGrid'
import type { FeaturedAlbum, GalleryArtwork } from '@/lib/content/queries'

interface Props {
  title: string
  subtitle?: string | null
  albums: FeaturedAlbum[]
  artworks: GalleryArtwork[]
}

const PortfolioGrid = ({ title, subtitle, albums, artworks }: Props) => {
  // The first album in the list starts selected. Album order is drag-and-drop in
  // the admin, so "which pill opens the page" is set by moving that album to the
  // top rather than by a separate flag. Falls back to the catch-all only when
  // there are no albums to select.
  const [activeAlbum, setActiveAlbum] = useState<string>(() => albums[0]?.slug ?? 'all')

  const categories = useMemo<Record<string, string>>(() => {
    const byAlbum = albums.reduce<Record<string, string>>((acc, album) => {
      acc[album.slug] = album.title

      return acc
    }, {})

    // `Object.entries` below walks insertion order, so spreading the albums first
    // and adding the catch-all last is what puts "All" at the end of the pills.
    return { ...byAlbum, all: 'All' }
  }, [albums])

  const filteredArtworks = useMemo(
    () =>
      activeAlbum === 'all'
        ? artworks
        : artworks.filter((artwork) => artwork.album.slug === activeAlbum),
    [artworks, activeAlbum],
  )

  return (
    <section id="work" className="bg-background py-24 md:py-32">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="mb-4 font-serif text-4xl text-foreground md:text-5xl">{title}</h2>
          <div className="section-divider mb-6" />
          {subtitle && <p className="mx-auto max-w-xl text-muted-foreground">{subtitle}</p>}
        </motion.div>

        {/* Category Filter */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-12 flex flex-wrap justify-center gap-3"
        >
          {Object.entries(categories).map(([slug, category]) => (
            <button
              key={slug}
              onClick={() => {
                posthog.capture('portfolio_album_filtered', {
                  album_slug: slug,
                  album_title: category,
                })
                setActiveAlbum(slug)
              }}
              className={`rounded-full px-5 py-2 font-sans text-sm tracking-wider uppercase transition-all duration-300 ${
                activeAlbum === slug
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:border-primary hover:text-foreground'
              }`}
            >
              {category}
            </button>
          ))}
        </motion.div>

        {/* Grid */}
        <ArtworkGrid artworks={filteredArtworks} emptyMessage="No work in this album yet." />

        {/*
          The homepage shows at most six per album, so there is almost always
          more behind this than the grid above admits.
        */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mt-16 text-center"
        >
          <Link
            href={activeAlbum === 'all' ? '/gallery' : `/gallery/${activeAlbum}`}
            className="inline-block rounded-full border border-border px-8 py-3 font-sans text-sm tracking-widest text-muted-foreground uppercase transition-colors hover:border-primary hover:text-foreground"
          >
            {activeAlbum === 'all' ? 'Browse all albums' : `See all of ${categories[activeAlbum]}`}
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

export default PortfolioGrid
