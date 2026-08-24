/**
 * Contact.
 *
 * Reads (the copy and the published details) come from the cached `contact-page`
 * and `site-settings` globals on the server; the write goes through the
 * `submitContactForm` server action, not through an API route. Rate limiting and
 * the honeypot live in there too — see `@/lib/actions/contact`.
 *
 * A thin server shell, the same way the homepage is: it does the reads and hands
 * plain props to the two client components that need `motion` and
 * `useActionState`.
 */
import type { Metadata } from 'next'

import React from 'react'

import { getContactPage, getSiteSettings } from '@/lib/content/queries'

import ContactDetails from './ContactDetails'
import { ContactForm } from './ContactForm'

export const generateMetadata = async (): Promise<Metadata> => {
  const contact = await getContactPage()

  return { title: contact.heading }
}

export default async function ContactPage() {
  const [contact, settings] = await Promise.all([getContactPage(), getSiteSettings()])

  const socials = settings.socials ?? []
  // Nothing published and nowhere to point: the form gets the full width rather
  // than sitting beside an empty column.
  const hasDetails = Boolean(
    contact.displayEmail || contact.phone || contact.location || socials.length,
  )

  return (
    <section className="relative overflow-hidden bg-background py-24 md:py-32">
      {/* The gradient the hero opens with, so a page reached from the navbar
          still reads as part of the site. */}
      <div className="absolute inset-x-0 top-0 h-64 bg-linear-to-b from-charcoal-deep to-background" />

      <div className="relative z-10 container mx-auto px-6">
        <header className="mx-auto max-w-2xl text-center">
          <h1 className="mb-4 font-serif text-4xl text-foreground md:text-5xl">
            {contact.heading}
          </h1>
          <div className="section-divider mb-8" />
          {contact.intro ? (
            <div className="space-y-4 text-muted-foreground">
              {/* Plain text out of a textarea, split the way the about body is. */}
              {contact.intro
                .split(/\n{2,}/)
                .filter(Boolean)
                .map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
            </div>
          ) : null}
        </header>

        <div className="mx-auto mt-16 grid max-w-5xl gap-12 lg:mt-20 lg:grid-cols-5 lg:gap-16">
          {hasDetails ? (
            <div className="lg:col-span-2">
              <ContactDetails
                displayEmail={contact.displayEmail}
                location={contact.location}
                phone={contact.phone}
                socials={socials}
              />
            </div>
          ) : null}

          <div className={hasDetails ? 'lg:col-span-3' : 'lg:col-span-5'}>
            <ContactForm formIntro={contact.formIntro} />
          </div>
        </div>
      </div>
    </section>
  )
}
