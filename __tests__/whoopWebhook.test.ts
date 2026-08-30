import { createHmac } from 'crypto'
import {
  parseWhoopWebhookEvent,
  verifyWhoopSignature,
  WHOOP_SYNC_EVENT_TYPES,
} from '../lib/whoop/webhook'

const body = JSON.stringify({
  user_id: 10129,
  id: '550e8400-e29b-41d4-a716-446655440000',
  type: 'recovery.updated',
  trace_id: 'd3709ee7-104e-4f70-a928-2932964b017b',
})

describe('WHOOP webhook trust boundary', () => {
  it('validates the documented timestamp + raw-body HMAC', () => {
    const timestamp = '1785672000000'
    const secret = 'test-client-secret'
    const signature = createHmac('sha256', secret)
      .update(timestamp + body)
      .digest('base64')

    expect(verifyWhoopSignature(body, timestamp, signature, secret)).toBe(true)
    expect(verifyWhoopSignature(`${body} `, timestamp, signature, secret)).toBe(false)
    expect(verifyWhoopSignature(body, timestamp, signature, 'wrong-secret')).toBe(false)
  })

  it('rejects malformed events before any account lookup', () => {
    expect(parseWhoopWebhookEvent(body)?.user_id).toBe(10129)
    expect(parseWhoopWebhookEvent('{not-json')).toBeNull()
    expect(parseWhoopWebhookEvent(JSON.stringify({ user_id: '10129' }))).toBeNull()
  })

  it('syncs only events that can change Vitality metrics', () => {
    expect(WHOOP_SYNC_EVENT_TYPES.has('recovery.updated')).toBe(true)
    expect(WHOOP_SYNC_EVENT_TYPES.has('sleep.updated')).toBe(true)
    expect(WHOOP_SYNC_EVENT_TYPES.has('workout.updated')).toBe(false)
    expect(WHOOP_SYNC_EVENT_TYPES.has('sleep.deleted')).toBe(false)
  })
})
