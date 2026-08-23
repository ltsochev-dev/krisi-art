/**
 * Homepage — unstyled data preview.
 *
 * Everything here is read on the server through `@/lib/content/queries`, which
 * wraps the Payload Local API in tagged `unstable_cache` entries. No `fetch`, no
 * HTTP round-trip, no `getPayload()` in the component itself: the page asks for
 * the *projections* it renders (hero, about, gallery) and stays out of the
 * query details.
 *
 * The one client-side read is the album filter, which re-queries
 * `/api/artworks/gallery` as chips are toggled — see `./GalleryFilter`.
 */
import React from 'react'

import { getAboutSection, getContactPage, getHeroSection, getHomepage, getHomepageGallery } from '@/lib/content/queries'

import { GalleryFilter } from './GalleryFilter'

export default async function HomePage() {
  // Independent reads, so fire them together. They all hit the same cached
  // `getHomepage()` entry underneath, so this is one global read, not five.
  const [hero, about, gallery, homepage, contact] = await Promise.all([
    getHeroSection(),
    getAboutSection(),
    getHomepageGallery(),
    getHomepage(),
    getContactPage(),
  ])

  return (
    <>
      <section>
        <h2>{hero.heading}</h2>
        {hero.subheading ? <p>{hero.subheading}</p> : null}
        {hero.image ? (
          // Plain <img>: media is served from S3, and wiring up next/image
          // remote patterns is a styling-phase concern, not a data one.
          <img alt={hero.image.alt} src={hero.image.sizes.hero ?? hero.image.url ?? ''} width={480} />
        ) : (
          <p>
            <em>No hero image set.</em>
          </p>
        )}
      </section>

      <hr />

      <section id="work">
        <h2>{homepage.sectionTitle}</h2>
        <p>
          <small>
            {gallery.albums.length} album chip(s), {gallery.imagesPerAlbum} artwork(s) per album,{' '}
            {gallery.initial.totalDocs} artwork(s) in the initial selection.
          </small>
        </p>
        <GalleryFilter
          albums={gallery.albums}
          imagesPerAlbum={gallery.imagesPerAlbum}
          initial={gallery.initial}
        />
      </section>

      <hr />

      <section id="about">
        <h2>{about.heading}</h2>
        {(about.body ?? '')
          .split(/\n{2,}/)
          .filter(Boolean)
          .map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        <ul>
          {about.stats.map((stat) => (
            <li key={stat.label}>
              <strong>{stat.value}</strong> {stat.label}
            </li>
          ))}
        </ul>
        <ul>
          {about.images.map((row, index) => (
            <li key={row.image?.id ?? index}>
              {row.image ? (
                <img
                  alt={row.image.alt}
                  src={row.image.sizes.card ?? row.image.url ?? ''}
                  width={200}
                />
              ) : null}
              {row.caption ? <figcaption>{row.caption}</figcaption> : null}
            </li>
          ))}
        </ul>
      </section>

      <hr />

      <section id="contact">
        <h2>{contact.heading}</h2>
        {contact.intro ? <p>{contact.intro}</p> : null}
        <ul>
          {contact.displayEmail ? <li>Email: {contact.displayEmail}</li> : null}
          {contact.phone ? <li>Phone: {contact.phone}</li> : null}
          {contact.location ? <li>Location: {contact.location}</li> : null}
        </ul>
        <p>
          <a href="/contact">Contact form &rarr;</a>
        </p>
      </section>
    </>
  )
}
