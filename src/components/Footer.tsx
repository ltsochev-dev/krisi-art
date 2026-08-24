import logo from '@/assets/logo-light.png'
import Image from 'next/image'
import Link from 'next/link'

interface Props {
  siteName: string
  footerText?: string | null
  privacyUrl?: string
  termsUrl?: string
}
const Footer = ({ siteName, footerText, privacyUrl = '#', termsUrl = '#' }: Props) => {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-charcoal-deep py-12">
      <div className="container mx-auto px-6">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-3">
            <Image src={logo} alt={siteName} className="h-8 w-auto opacity-70 invert" />
            <span className="font-serif text-lg text-muted-foreground">{siteName}</span>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            &copy; {currentYear} {siteName}. {footerText}
          </p>

          <div className="flex gap-6">
            {privacyUrl && (
              <Link
                href={privacyUrl}
                className="text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                Privacy
              </Link>
            )}
            {termsUrl && (
              <Link
                href={termsUrl}
                className="text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                Terms
              </Link>
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
