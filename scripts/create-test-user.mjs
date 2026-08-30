#!/usr/bin/env node
/**
 * One-off: create a fully-onboarded test user against the live Supabase
 * project so we can drive end-to-end checkout flows without going
 * through signup + onboarding + email confirmation.
 *
 * Reads SUPABASE_SERVICE_ROLE_KEY from .env.local. Service role bypasses
 * RLS — required to flip onboarded=true on profiles + insert
 * user_profile.
 *
 * Idempotent: re-runs are no-ops (delete the user first if you want a
 * clean slate).
 *
 * Run from repo root:
 *   node scripts/create-test-user.mjs
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

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

const TEST_EMAIL = 'stripe-test@vitality.test'
const TEST_PASSWORD = 'test1234'

async function main() {
  const env = await loadEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Look up first — admin.listUsers + filter by email. (createUser
  // would 422 if the email already exists, which we want to handle
  // as "already done, just print the creds".)
  console.log(`Checking for existing user ${TEST_EMAIL}…`)
  const { data: listed } = await supabase.auth.admin.listUsers({ perPage: 200 })
  const existing = listed?.users?.find((u) => u.email === TEST_EMAIL)

  let userId
  if (existing) {
    userId = existing.id
    console.log(`Found existing user ${userId} — resetting password just in case.`)
    await supabase.auth.admin.updateUserById(userId, {
      password: TEST_PASSWORD,
      email_confirm: true,
    })
  } else {
    console.log('Creating fresh auth user…')
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true, // skip the email verification step
    })
    if (error) {
      console.error('createUser failed:', error.message)
      process.exit(1)
    }
    userId = created.user.id
    console.log(`Created auth user ${userId}`)
  }

  // Profile — flip onboarded=true so middleware lets us through to /app.
  // tier='free' (default) so we start in the upgrade-to-pro state.
  console.log('Upserting profiles row…')
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        onboarded: true,
        tier: 'free',
      },
      { onConflict: 'id' }
    )
  if (profileError) {
    console.error('profiles upsert failed:', profileError.message)
    process.exit(1)
  }

  // user_profile — has NOT NULL columns from BUILD02. Plausible defaults
  // so any downstream module that reads from this row doesn't crash.
  console.log('Upserting user_profile row…')
  const { error: upError } = await supabase
    .from('user_profile')
    .upsert(
      {
        user_id: userId,
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
  console.log('  Test user ready. Sign in at /login with:')
  console.log('')
  console.log(`    Email:    ${TEST_EMAIL}`)
  console.log(`    Password: ${TEST_PASSWORD}`)
  console.log('')
  console.log(`  User id: ${userId}`)
  console.log('───────────────────────────────────────────────')
}

main().catch((err) => {
  console.error('create-test-user failed:', err.message)
  process.exit(1)
})
