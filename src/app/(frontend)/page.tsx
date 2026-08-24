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

import {
  getAboutSection,
  getHeroSection,
  getHomepage,
  getHomepageGallery,
  getSiteSettings,
  getTestimonials,
} from '@/lib/content/queries'

import { GalleryFilter } from './GalleryFilter'
import Hero from '@/components/Hero'
import Contact from '@/components/Contact'
import Testimonials from '@/components/Testimonials'
import About from '@/components/About'

export default async function HomePage() {
  // Independent reads, so fire them together. The first four share the same
  // cached `getHomepage()` entry underneath, so that stays one global read.
  const [hero, about, gallery, homepage, settings, testimonials] = await Promise.all([
    getHeroSection(),
    getAboutSection(),
    getHomepageGallery(),
    getHomepage(),
    getSiteSettings(),
    getTestimonials(),
  ])

  return (
    <>
      <Hero title={hero.heading} subtitle={hero.subheading ?? ''} skills={hero.skills} />
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
      <About title={about.heading} stats={about.stats} images={about.images}>
        {(about.body ?? '')
          .split(/\n{2,}/)
          .filter(Boolean)
          .map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
      </About>
      <Testimonials testimonials={testimonials} />
      <Contact
        title={homepage.contactsHeading}
        subtitle={homepage.contactsSubtitle}
        socials={settings.socials ?? []}
      />
    </>
  )
}
