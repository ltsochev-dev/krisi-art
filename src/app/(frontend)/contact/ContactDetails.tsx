'use client'

/**
 * The published contact details, beside the form.
 *
 * Everything here comes from the `contact-page` and `site-settings` globals, and
 * every row is optional — an editor who fills in only an email gets a column
 * with one row rather than three placeholders. The column is dropped entirely by
 * the page when nothing at all is set.
 */
import { motion } from 'motion/react'
import { Mail, MapPin, Phone } from 'lucide-react'

import SocialIcon from '@/components/SocialIcon'

type Social = { platform: string; url?: null | string }

interface Props {
  displayEmail?: null | string
  location?: null | string
  phone?: null | string
  socials?: Social[]
}

const ContactDetails = ({ displayEmail, location, phone, socials = [] }: Props) => {
  const rows = [
    displayEmail
      ? { href: `mailto:${displayEmail}`, icon: Mail, label: 'Email', value: displayEmail }
      : null,
    phone
      ? // `tel:` wants the number without the spaces an editor types for legibility.
        { href: `tel:${phone.replace(/\s+/g, '')}`, icon: Phone, label: 'Phone', value: phone }
      : null,
    location ? { href: null, icon: MapPin, label: 'Location', value: location } : null,
  ].filter((row) => row !== null)

  const links = socials.filter((social) => Boolean(social.url))

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="space-y-10"
    >
      {rows.length > 0 ? (
        <div className="space-y-6">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start gap-4">
              <span className="mt-0.5 rounded-full border border-border p-2.5 text-primary">
                <row.icon size={18} />
              </span>
              <div>
                <p className="font-sans text-xs tracking-widest text-muted-foreground uppercase">
                  {row.label}
                </p>
                {row.href ? (
                  <a
                    href={row.href}
                    className="font-serif text-lg text-foreground transition-colors duration-300 hover:text-primary"
                  >
                    {row.value}
                  </a>
                ) : (
                  <p className="font-serif text-lg text-foreground">{row.value}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {links.length > 0 ? (
        <div>
          <p className="mb-4 font-sans text-xs tracking-widest text-muted-foreground uppercase">
            Elsewhere
          </p>
          {/* Same circular buttons as the homepage contact section. */}
          <div className="flex flex-wrap gap-4">
            {links.map((social) => (
              <motion.a
                key={social.url}
                href={social.url ?? undefined}
                whileHover={{ scale: 1.1, y: -2 }}
                className="rounded-full border border-border p-3 text-muted-foreground transition-colors duration-300 hover:border-primary hover:text-primary"
                aria-label={social.platform}
                title={social.platform}
                target="_blank"
                rel="noopener noreferrer nofollow external"
              >
                <SocialIcon platform={social.platform} />
              </motion.a>
            ))}
          </div>
        </div>
      ) : null}
    </motion.div>
  )
}

export default ContactDetails
