'use client'

import { motion } from 'motion/react'
import { ArrowDown } from 'lucide-react'
import logoDefault from '@/assets/logo-light.png'
import Image, { StaticImageData } from 'next/image'

interface Props {
  title: string
  subtitle: string
  logo?: StaticImageData
  /** Chip captions, in render order. Comes from the Homepage global. */
  skills?: string[]
}
const Hero = ({ title, subtitle, logo = logoDefault, skills = [] }: Props) => {
  const scrollToWork = () => {
    const element = document.querySelector('#work')
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-linear-to-b from-charcoal-deep via-background to-background" />

      {/* Decorative elements */}
      <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute right-1/4 bottom-1/4 h-64 w-64 rounded-full bg-gold/5 blur-3xl" />

      <div className="relative z-10 container mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
          className="mb-8"
        >
          <Image
            src={logo}
            alt={`${title} Logo`}
            className="mx-auto h-32 w-auto opacity-90 invert md:h-40"
          />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-6 font-serif text-5xl tracking-tight text-foreground md:text-7xl lg:text-8xl"
        >
          {title}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mx-auto mb-4 max-w-2xl font-sans text-lg text-muted-foreground md:text-xl"
        >
          {subtitle}
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mb-16 flex flex-wrap justify-center gap-3"
        >
          {skills.map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors duration-300 hover:border-primary hover:text-primary"
            >
              {skill}
            </span>
          ))}
        </motion.div>

        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          onClick={scrollToWork}
          className="group mx-auto flex flex-col items-center gap-2 text-muted-foreground transition-colors duration-300 hover:text-primary"
        >
          <span className="font-sans text-sm tracking-widest uppercase">View Work</span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ArrowDown size={20} />
          </motion.div>
        </motion.button>
      </div>
    </section>
  )
}

export default Hero
