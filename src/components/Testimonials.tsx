'use client'

import { motion } from 'motion/react'
import { Quote } from 'lucide-react'
import type { getTestimonials } from '@/lib/content/queries'

type TestimonialList = Awaited<ReturnType<typeof getTestimonials>>

interface Props {
  title?: string
  subtitle?: string | null
  testimonials?: TestimonialList
}

const Testimonials = ({ title = 'Kind Words', subtitle, testimonials = [] }: Props) => {
  return (
    <section id="testimonials" className="bg-background py-24 md:py-32">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="mb-4 font-serif text-4xl text-foreground md:text-5xl">{title}</h2>
          <div className="section-divider mb-8" />
          {subtitle ? <p className="mb-4 text-muted-foreground">{subtitle}</p> : null}
        </motion.div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-8 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <motion.figure
              key={testimonial.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              // Capped so a long list still finishes animating in promptly.
              transition={{ duration: 0.6, delay: Math.min(index * 0.1, 0.4) }}
              className="flex h-full flex-col rounded-2xl border border-border bg-card p-8 transition-colors duration-300 hover:border-primary"
            >
              <Quote size={20} className="mb-6 text-primary" aria-hidden="true" />

              <blockquote className="flex-1 font-sans text-muted-foreground">
                {/* Plain text out of a textarea, same as the about body: blank
                    lines separate paragraphs. */}
                {testimonial.testimonial
                  .split(/\n{2,}/)
                  .filter(Boolean)
                  .map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex} className="mb-4 last:mb-0">
                      {paragraph}
                    </p>
                  ))}
              </blockquote>

              {/* `testimonial.socials` is deliberately not rendered. The rating
                  is internal-only per its field description, and the social
                  links stay out of the card for now. */}
              <figcaption className="mt-8 border-t border-border pt-6 font-sans text-sm tracking-widest text-foreground uppercase">
                {testimonial.name}
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Testimonials
