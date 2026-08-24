'use client'

import { getAboutSection } from '@/lib/content/queries'
import { motion } from 'motion/react'
import { ReactNode } from 'react'
import Image from 'next/image'
import clsx from 'clsx'

type AboutSection = NonNullable<Awaited<ReturnType<typeof getAboutSection>>>
type AboutStat = AboutSection['stats'][number]
type AboutImage = AboutSection['images'][number]

/**
 * The collage, as data.
 *
 * Its shape is fixed design — two columns, the right one dropped half a slot,
 * alternating square and 4:3 — while the number of about images an editor
 * supplies is not. Keeping the slots in a list is what lets one `map` render the
 * arrangement the markup used to spell out four times over.
 *
 * The order here is *fill* order, not DOM order: left, right, left, right. That
 * is what makes a partial set look deliberate — two images land one per column
 * at the top instead of stacking up on the left with a bare column beside them.
 *
 * The aspect classes are written out in full so Tailwind's source scan finds
 * them. Building them from fragments (`aspect-${ratio}`) would compile to
 * nothing.
 */
const SLOTS = [
  { aspect: 'aspect-square', column: 'left' },
  { aspect: 'aspect-4/3', column: 'right' },
  { aspect: 'aspect-4/3', column: 'left' },
  { aspect: 'aspect-square', column: 'right' },
] as const

const COLUMNS = ['left', 'right'] as const

interface Props {
  title: string
  stats: AboutStat[]
  images: AboutImage[]
  children?: ReactNode
}

const About = ({ title, stats = [], images = [], children }: Props) => {
  // Rows whose media is missing or disabled are dropped *before* the slots are
  // handed out, so a disabled image closes the gap rather than leaving a hole in
  // the middle of the collage. `slice` then caps the set, which is what makes
  // `SLOTS[index]` safe below.
  const tiles = images
    .flatMap((row) => (row.image ? [{ caption: row.caption, image: row.image }] : []))
    .slice(0, SLOTS.length)
    .map((tile, index) => ({ ...tile, ...SLOTS[index] }))

  return (
    <section id="about" className="bg-charcoal py-24 md:py-32">
      <div className="container mx-auto px-6">
        <div className={clsx('grid items-center gap-16', tiles.length > 0 && 'lg:grid-cols-2')}>
          {/* Text Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="mb-6 font-serif text-4xl text-foreground md:text-5xl">{title}</h2>
            <div className="section-divider mx-0! mb-8" />

            <div className="space-y-6 leading-relaxed text-muted-foreground">{children}</div>

            <div className="mt-10 grid grid-cols-3 gap-8">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <span className="text-gradient-gold font-serif text-3xl md:text-4xl">
                    {stat.value}
                  </span>
                  <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Image collage. Omitted entirely when there is nothing to show, which
              is why the wrapping grid only splits in two when tiles exist. */}
          {tiles.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="grid grid-cols-2 gap-4">
                {COLUMNS.map((column) => (
                  <div key={column} className={clsx('space-y-4', column === 'right' && 'pt-8')}>
                    {tiles
                      .filter((tile) => tile.column === column)
                      .map((tile) => (
                        <figure
                          key={tile.image.id}
                          className={clsx(
                            'group relative overflow-hidden rounded-lg bg-secondary',
                            tile.aspect,
                          )}
                        >
                          {/* `fill` rather than width/height: the slot's aspect
                              ratio is the design, and the `card` derivative's
                              height is whatever the original's ratio produced.
                              `object-cover` reconciles the two. */}
                          <Image
                            alt={tile.image.alt}
                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                            fill
                            // 768w — roughly 2x the widest this slot ever gets,
                            // so the collage never pulls a hero-sized original.
                            src={tile.image.sizes.card ?? tile.image.url ?? ''}
                            sizes="(min-width: 1024px) 23vw, 45vw"
                          />
                          {tile.caption ? (
                            <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-3 text-xs text-cream opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                              {tile.caption}
                            </figcaption>
                          ) : null}
                        </figure>
                      ))}
                  </div>
                ))}
              </div>

              {/* Floating accent */}
              <div className="absolute -bottom-6 -left-6 h-24 w-24 rounded-lg border border-primary/30" />
              <div className="absolute -top-6 -right-6 h-16 w-16 rounded-full border border-gold/20" />
            </motion.div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default About
