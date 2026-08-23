import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { resendAdapter } from '@payloadcms/email-resend'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Only configure Resend when an API key is present, so local dev and tests fall
// back to Payload's built-in adapter (which logs emails instead of sending).
const email = process.env.RESEND_API_KEY
  ? resendAdapter({
      apiKey: process.env.RESEND_API_KEY,
      defaultFromAddress: process.env.RESEND_FROM_ADDRESS || 'noreply@krisi.art',
      defaultFromName: process.env.RESEND_FROM_NAME || 'Krisi Art',
      // Set in non-production to route every email to a single inbox.
      ...(process.env.RESEND_OVERRIDE_RECIPIENT
        ? { overrideRecipientAddress: process.env.RESEND_OVERRIDE_RECIPIENT }
        : {}),
    })
  : undefined

export default buildConfig({
  admin: {
    components: {
      // Payload's own login form is gone (the users collection disables the
      // local strategy), so this is the only way into the admin panel.
      beforeLogin: ['@/components/admin/CognitoLoginButton#CognitoLoginButton'],
      logout: {
        Button: '@/components/admin/CognitoLogoutButton#CognitoLogoutButton',
      },
    },
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media],
  // The app only talks to Payload through the Local API and REST, so the
  // GraphQL endpoint and its playground stay off.
  graphQL: {
    disable: true,
  },
  editor: lexicalEditor(),
  email,
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [],
})
