/**
 * Contact — unstyled data preview.
 *
 * Reads (the copy) come from the cached `contact-page` global on the server;
 * the write goes through the `submitContactForm` server action, not through an
 * API route. See `@/lib/actions/contact`.
 */
import React from 'react'

import { getContactPage } from '@/lib/content/queries'

import { ContactForm } from './ContactForm'

export default async function ContactPage() {
  const contact = await getContactPage()

  return (
    <>
      <h2>{contact.heading}</h2>
      {contact.intro ? <p>{contact.intro}</p> : null}
      <ul>
        {contact.displayEmail ? <li>Email: {contact.displayEmail}</li> : null}
        {contact.phone ? <li>Phone: {contact.phone}</li> : null}
        {contact.location ? <li>Location: {contact.location}</li> : null}
      </ul>
      {contact.formIntro ? <p>{contact.formIntro}</p> : null}
      <ContactForm />
    </>
  )
}
