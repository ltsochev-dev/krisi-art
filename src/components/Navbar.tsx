'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Menu, X } from 'lucide-react'
import Image, { StaticImageData } from 'next/image'
import { getSiteSettings } from '@/lib/content/queries'
import Link from 'next/link'

type NavLink = NonNullable<Awaited<ReturnType<typeof getSiteSettings>>['nav']>[number]

const navLinks: NavLink[] = [
  { label: 'Work', href: '#work' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
]

interface Props {
  siteName: string
  logo: StaticImageData
  links?: NavLink[]
}

const Navbar = ({ siteName, logo, links = navLinks }: Props) => {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollTo = (href: string) => {
    // Only in-page anchors are scrolled to; a real path has no element to find
    // and is left to the `Link` that renders it.
    if (href.startsWith('#')) {
      document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' })
    }

    setIsMobileMenuOpen(false)
  }

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        className={`fixed top-0 right-0 left-0 z-50 transition-all duration-500 ${
          isScrolled ? 'border-b border-border bg-background/90 backdrop-blur-md' : 'bg-transparent'
        }`}
      >
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <motion.a href="/" whileHover={{ scale: 1.05 }} className="flex items-center gap-3">
              <Image src={logo} alt={siteName} className="h-10 w-auto" />
              <span className="font-serif text-xl tracking-wide text-foreground">{siteName}</span>
            </motion.a>

            {/* Desktop Navigation */}
            <div className="hidden items-center gap-8 md:flex">
              {links.map((link) => (
                <Link
                  key={link.label}
                  className="nav-link font-sans text-sm tracking-widest uppercase"
                  href={link.href}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-foreground md:hidden"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 bg-background/98 pt-24 backdrop-blur-lg md:hidden"
          >
            <div className="flex flex-col items-center gap-8 py-12">
              {links.map((link, index) => (
                <motion.div
                  key={link.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  {link.href.startsWith('#') ? (
                    <button
                      onClick={() => scrollTo(link.href)}
                      className="font-serif text-3xl text-foreground transition-colors hover:text-primary"
                    >
                      {link.label}
                    </button>
                  ) : (
                    <Link
                      href={link.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="font-serif text-3xl text-foreground transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default Navbar
