#!/usr/bin/env node
/**
 * Idempotent bootstrap for the production Stripe webhook endpoint.
 *
 * Creates (or finds) a webhook endpoint pointing at
 * http://localhost:3000/api/stripe/webhook subscribed to the
 * events our handler cares about, then prints the signing secret to
 * paste into Vercel as STRIPE_WEBHOOK_SECRET (production).
 *
 * Stripe only reveals the secret once at creation. If an endpoint
 * already exists for this URL, this script can't recover the secret —
 * it'll print a notice and refuse to delete/recreate by default.
 * Pass `--rotate` to delete + recreate (gives a fresh secret).
 *
 * Run from repo root:
 *   node scripts/stripe-webhook-bootstrap.mjs           # create or noop
 *   node scripts/stripe-webhook-bootstrap.mjs --rotate  # force-rotate
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Stripe from 'stripe'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

async function loadEnv() {
  const text = await readFile(join(ROOT, '.env.local'), 'utf8')
  const out = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
}

// Webhook URL: pass it as the first argument, or set NEXT_PUBLIC_APP_URL in
// .env.local — e.g. `node scripts/stripe-webhook-bootstrap.mjs https://myapp.vercel.app`
function resolveProdUrl(env) {
  const base = process.argv.find((a) => a.startsWith('http')) || env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${base.replace(/\/+$/, '')}/api/stripe/webhook`
}

const EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]

async function main() {
  const rotate = process.argv.includes('--rotate')
  const env = await loadEnv()
  const PROD_URL = resolveProdUrl(env)
  const secret = env.STRIPE_SECRET_KEY
  if (!secret) {
    console.error('STRIPE_SECRET_KEY not found in .env.local')
    process.exit(1)
  }
  const stripe = new Stripe(secret, { apiVersion: '2026-04-22.dahlia' })

  // Look for existing endpoint on the prod URL.
  let existing = null
  for await (const ep of stripe.webhookEndpoints.list({ limit: 100 })) {
    if (ep.url === PROD_URL) {
      existing = ep
      break
    }
  }

  if (existing && !rotate) {
    console.log(`Found existing webhook endpoint ${existing.id}`)
    console.log(`Status: ${existing.status}, Events: ${existing.enabled_events.length}`)
    console.log('')
    console.log('Stripe can only reveal the signing secret at creation time.')
    console.log('If you already have STRIPE_WEBHOOK_SECRET set in Vercel from a')
    console.log('previous run, you do NOT need to do anything.')
    console.log('')
    console.log('If you need a fresh secret (lost the old one, etc.):')
    console.log('  node scripts/stripe-webhook-bootstrap.mjs --rotate')
    return
  }

  if (existing && rotate) {
    console.log(`Deleting existing endpoint ${existing.id}…`)
    await stripe.webhookEndpoints.del(existing.id)
  }

  console.log(`Creating webhook endpoint for ${PROD_URL}…`)
  const created = await stripe.webhookEndpoints.create({
    url: PROD_URL,
    enabled_events: EVENTS,
    description: 'Vitality production billing webhook (created by stripe-webhook-bootstrap.mjs)',
  })

  console.log(`Created ${created.id}`)
  console.log('')
  console.log('───────────────────────────────────────────────')
  console.log('  Paste this into Vercel as STRIPE_WEBHOOK_SECRET (production):')
  console.log('')
  console.log(`  ${created.secret}`)
  console.log('───────────────────────────────────────────────')
}

main().catch((err) => {
  console.error('stripe-webhook-bootstrap failed:', err.message)
  if (err.raw) console.error(err.raw)
  process.exit(1)
})
