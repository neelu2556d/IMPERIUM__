#!/usr/bin/env node
/**
 * Wipe-and-recreate the Stripe test user.
 *
 * Anytime testing leaves the system in a confusing state — Stripe customer
 * lingering, subscription stuck, profiles row mismatched, etc. — run this
 * script and you're back to a clean known baseline:
 *
 *   stripe-test@vitality.test  /  test1234
 *   tier=free, onboarded=true, no Stripe customer, no subscriptions
 *
 * Steps:
 *   1. Look up existing test user by email in Supabase.
 *   2. If found, read profiles.stripe_customer_id. If present, delete the
 *      Stripe customer (which cancels all of its subscriptions).
 *   3. Delete user_profile + profiles rows for the user (belt-and-suspenders
 *      in case the auth.users FK isn't cascaded).
 *   4. Delete the Supabase auth user.
 *   5. Recreate fresh with onboarded=true + tier=free.
 *
 * Safe to run any time. In sandbox mode the Stripe deletion is fully
 * destructive but consequence-free. NEVER add a `--live` flag to this
 * script without a 10-second "are you sure" confirmation — deleting a
 * real customer in live mode wipes their payment history.
 *
 * Run from repo root:
 *   node scripts/reset-test-user.mjs
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const TEST_EMAIL = 'stripe-test@vitality.test'
const TEST_PASSWORD = 'test1234'

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

async function main() {
  const env = await loadEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const stripeKey = env.STRIPE_SECRET_KEY
  if (!url || !serviceKey || !stripeKey) {
    console.error('Missing env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY)')
    process.exit(1)
  }
  // Guard against ever doing this on a live Stripe account by accident.
  if (stripeKey.startsWith('sk_live_')) {
    console.error('REFUSING to run against a LIVE Stripe key. This script deletes customers.')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const stripe = new Stripe(stripeKey, { apiVersion: '2026-04-22.dahlia' })

  // 1. Find existing test user
  console.log(`Looking up ${TEST_EMAIL}…`)
  const { data: listed } = await supabase.auth.admin.listUsers({ perPage: 200 })
  const existing = listed?.users?.find((u) => u.email === TEST_EMAIL)

  if (existing) {
    const userId = existing.id
    console.log(`Found ${userId}, wiping…`)

    // 2. Read stripe_customer_id from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .maybeSingle()

    // 2b. Delete Stripe customer (cancels all its subs automatically)
    if (profile?.stripe_customer_id) {
      console.log(`  Deleting Stripe customer ${profile.stripe_customer_id}…`)
      try {
        await stripe.customers.del(profile.stripe_customer_id)
      } catch (err) {
        // 404 means the customer was already deleted in a prior run — fine
        if (err.statusCode === 404) {
          console.log('  (customer already gone in Stripe — continuing)')
        } else {
          throw err
        }
      }
    }

    // 3. Delete user_profile + profiles rows
    console.log('  Deleting user_profile row…')
    await supabase.from('user_profile').delete().eq('user_id', userId)
    console.log('  Deleting profiles row…')
    await supabase.from('profiles').delete().eq('id', userId)

    // 4. Delete auth user
    console.log('  Deleting auth user…')
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('  auth.deleteUser failed:', deleteError.message)
      process.exit(1)
    }
  } else {
    console.log('No existing user — fresh create.')
  }

  // 5. Recreate fresh
  console.log('')
  console.log('Creating fresh test user…')
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (createError) {
    console.error('createUser failed:', createError.message)
    process.exit(1)
  }
  const newUserId = created.user.id

  // Supabase has an on-insert trigger that auto-creates a profiles row.
  // Upsert overwrites the auto-created default values (e.g. tier='free' is
  // probably already there, but onboarded=false would be the default).
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: newUserId, onboarded: true, tier: 'free' }, { onConflict: 'id' })
  if (profileError) {
    console.error('profiles upsert failed:', profileError.message)
    process.exit(1)
  }

  const { error: upError } = await supabase
    .from('user_profile')
    .upsert(
      {
        user_id: newUserId,
        first_name: 'Tester',
        birthday: '1995-01-01',
        sex: 'M',
        height_cm: 180,
        starting_weight_kg: 75,
        units: 'metric',
        goal: 'maintain',
        onboarding_step: 5,
      },
      { onConflict: 'user_id' }
    )
  if (upError) {
    console.error('user_profile upsert failed:', upError.message)
    process.exit(1)
  }

  console.log('')
  console.log('───────────────────────────────────────────────')
  console.log('  Reset complete. Clean test user:')
  console.log('')
  console.log(`    Email:    ${TEST_EMAIL}`)
  console.log(`    Password: ${TEST_PASSWORD}`)
  console.log(`    Tier:     free`)
  console.log(`    User id:  ${newUserId}`)
  console.log('───────────────────────────────────────────────')
}

main().catch((err) => {
  console.error('reset-test-user failed:', err.message)
  if (err.raw) console.error(err.raw)
  process.exit(1)
})
