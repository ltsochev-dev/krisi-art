'use client'

import { motion } from 'motion/react'
import { Mail, Send } from 'lucide-react'
import Instagram from './icons/instagram'

const Contact = () => {
  return (
    <section id="contact" className="bg-background py-24 md:py-32">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="mb-4 font-serif text-4xl text-foreground md:text-5xl">
            Let&apos;s Create Together
          </h2>
          <div className="section-divider mb-8" />
          <p className="mb-12 text-muted-foreground">
            Interested in commissioning a piece or collaborating on a project? I&apos;d love to hear
            about your vision.
          </p>

          <motion.a
            href="/contact"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-3 rounded-full bg-primary px-8 py-4 font-sans text-sm tracking-widest text-primary-foreground uppercase transition-colors duration-300 hover:bg-gold-light"
          >
            <Mail size={18} />
            Get in Touch
          </motion.a>

          <div className="mt-12 flex justify-center gap-6">
            {[
              { icon: Instagram, label: 'Instagram', href: '#' },
              { icon: Send, label: 'Telegram', href: '#' },
            ].map((social) => (
              <motion.a
                key={social.label}
                href={social.href}
                whileHover={{ scale: 1.1, y: -2 }}
                className="rounded-full border border-border p-3 text-muted-foreground transition-colors duration-300 hover:border-primary hover:text-primary"
                aria-label={social.label}
              >
                <social.icon size={20} />
              </motion.a>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export default Contact
