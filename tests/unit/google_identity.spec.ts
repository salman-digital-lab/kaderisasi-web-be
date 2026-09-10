import { test } from '@japa/runner'
import type { TokenPayload } from 'google-auth-library'
import { readGoogleIdentity } from '#services/google_identity_service'

const payload: TokenPayload = {
  iss: 'https://accounts.google.com',
  aud: 'test-client',
  sub: 'google-subject',
  iat: 1,
  exp: 2,
  email: 'Member@gmail.com',
  email_verified: true,
  name: 'Google name',
  nonce: 'expected-nonce',
}

test.group('Verified Google identity policy', () => {
  test('accepts Gmail and Workspace and normalizes email', ({ assert }) => {
    assert.deepEqual(readGoogleIdentity(payload, 'expected-nonce'), {
      email: 'member@gmail.com',
      name: 'Google name',
    })
    assert.equal(
      readGoogleIdentity(
        { ...payload, email: 'user@company.test', hd: 'company.test' },
        'expected-nonce'
      ).email,
      'user@company.test'
    )
  })
  test('rejects unverified, missing, third-party emails and nonce mismatch', ({ assert }) => {
    for (const value of [
      undefined,
      { ...payload, email_verified: false },
      { ...payload, email: undefined },
      { ...payload, sub: '' },
      { ...payload, email: 'user@example.test' },
      { ...payload, nonce: 'other-flow' },
    ]) {
      assert.throws(() => readGoogleIdentity(value, 'expected-nonce'))
    }
  })
})
