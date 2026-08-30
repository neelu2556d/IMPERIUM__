// Sentry — edge runtime (middleware + edge routes) error monitoring. Production-only.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
})
