// Sentry — server (Node runtime) error monitoring. Catches errors thrown in
// route handlers, server actions, and server components. Production-only.
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: process.env.NODE_ENV === 'production',
})
