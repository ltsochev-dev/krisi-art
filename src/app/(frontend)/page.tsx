import type { Metadata } from 'next'

import {
  getAboutSection,
  getHeroSection,
  getHomepage,
  getHomepageGallery,
  getSiteSettings,
  getTestimonials,
} from '@/lib/content/queries'

import Hero from '@/components/Hero'
import Contact from '@/components/Contact'
import Testimonials from '@/components/Testimonials'
import About from '@/components/About'
import PortfolioGrid from '@/components/PortfolioGrid'
import { pageMetadata } from '@/lib/seo/metadata'
import { toGalleryImage } from '@/lib/content/gallery'

/**
 * The SEO tab on the `homepage` global, with the `site-settings` defaults behind
 * every field.
 *
 * `absoluteTitle` because `metaTitle` here is the whole title — the admin field
 * says as much ("Falls back to the site name when empty") — so it must not pick
 * up the layout's " — <site name>" suffix on top.
 */
export const generateMetadata = async (): Promise<Metadata> => {
  const [homepage, settings] = await Promise.all([getHomepage(), getSiteSettings()])

  return pageMetadata({
    absoluteTitle: true,
    description: homepage.metaDescription,
    image: toGalleryImage(homepage.ogImage),
    path: '/',
    settings,
    title: homepage.metaTitle,
  })
}

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
      <PortfolioGrid
        title={gallery.heading}
        subtitle={gallery.subheading}
        albums={gallery.albums}
        artworks={gallery.artworks}
      />
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
