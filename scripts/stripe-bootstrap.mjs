#!/usr/bin/env node
/**
 * Idempotent bootstrap for Vitality's Stripe Product + Price.
 *
 * Looks for an existing product tagged `metadata.vitality_id=pro_monthly`.
 * If found, prints its active monthly price id. If not, creates the
 * product + a recurring $15/month USD price and prints the new id.
 *
 * Print contract: stdout ends with one line — `STRIPE_PRICE_ID=price_…`.
 * Paste that into .env.local AND Vercel.
 *
 * Run from repo root:
 *   node scripts/stripe-bootstrap.mjs
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Stripe from 'stripe'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENV_FILE = join(ROOT, '.env.local')

// Tiny .env reader — keeps this script dependency-free. Handles
// `KEY=value`, comments, blank lines. Doesn't try to be dotenv.
async function loadEnv(file) {
  const text = await readFile(file, 'utf8')
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

const VITALITY_ID = 'pro_monthly'
const PRODUCT_NAME = 'Vitality Pro'
const PRODUCT_DESCRIPTION =
  'The dashboard. Your workouts, your data, every month.'
const UNIT_AMOUNT_CENTS = 1500 // $15.00 USD
const CURRENCY = 'usd'
const INTERVAL = 'month'

async function main() {
  const env = await loadEnv(ENV_FILE)
  const secret = env.STRIPE_SECRET_KEY
  if (!secret) {
    console.error('STRIPE_SECRET_KEY not found in .env.local')
    process.exit(1)
  }
  if (!secret.startsWith('sk_test_') && !secret.startsWith('sk_live_')) {
    console.error('STRIPE_SECRET_KEY does not look like a Stripe key.')
    process.exit(1)
  }
  const mode = secret.startsWith('sk_live_') ? 'LIVE' : 'TEST'
  console.log(`Bootstrapping Vitality Pro in ${mode} mode…`)

  const stripe = new Stripe(secret, { apiVersion: '2026-04-22.dahlia' })

  // Find an existing product by our metadata tag. We page through
  // products because there's no metadata search on the list endpoint
  // in the older API surface — at the scale of one product per app,
  // this is fine.
  let existingProduct = null
  for await (const p of stripe.products.list({ active: true, limit: 100 })) {
    if (p.metadata?.vitality_id === VITALITY_ID) {
      existingProduct = p
      break
    }
  }

  let product
  if (existingProduct) {
    product = existingProduct
    console.log(`Found existing product ${product.id} (${product.name})`)
  } else {
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      description: PRODUCT_DESCRIPTION,
      metadata: { vitality_id: VITALITY_ID },
    })
    console.log(`Created product ${product.id}`)
  }

  // Reuse an active recurring price if one already matches our spec.
  // Stripe doesn't allow editing a Price's amount/interval once
  // created, so this also defends against accidentally duplicating it.
  let price = null
  for await (const p of stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  })) {
    if (
      p.unit_amount === UNIT_AMOUNT_CENTS &&
      p.currency === CURRENCY &&
      p.recurring?.interval === INTERVAL
    ) {
      price = p
      break
    }
  }

  if (price) {
    console.log(`Found existing price ${price.id}`)
  } else {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: UNIT_AMOUNT_CENTS,
      currency: CURRENCY,
      recurring: { interval: INTERVAL },
    })
    console.log(`Created price ${price.id}`)
  }

  console.log('')
  console.log('───────────────────────────────────────────────')
  console.log('  Paste this into .env.local AND Vercel:')
  console.log('')
  console.log(`  STRIPE_PRICE_ID=${price.id}`)
  console.log('───────────────────────────────────────────────')
}

main().catch((err) => {
  console.error('stripe-bootstrap failed:', err.message)
  if (err.raw) console.error(err.raw)
  process.exit(1)
})
