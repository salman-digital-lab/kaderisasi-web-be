import { test } from '@japa/runner'
import { randomUUID, createHash } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import testUtils from '@adonisjs/core/services/test_utils'
import PublicUser from '#models/public_user'
import Profile from '#models/profile'
import LegacyMember from '#models/legacy_member'
import AuthController from '#controllers/auth_controller'
import { resolveGoogleAccount } from '#services/google_account_service'

test.group('Google account preservation', (group) => {
  group.setup(async () => {
    if (!process.env.GOOGLE_AUTH_TEST_SCHEMA) return
    const result = await db.rawQuery('SELECT current_schema() AS name')
    if (
      !process.env.GOOGLE_AUTH_TEST_SCHEMA.startsWith('google_auth_test_') ||
      result.rows[0].name !== process.env.GOOGLE_AUTH_TEST_SCHEMA
    )
      throw new Error('Owned test schema required')
  })
  const email = (): string => `${randomUUID()}@gmail.com`

  test('preserves pre-migration accounts carrying the no_account default', async ({ assert }) => {
    const user = await PublicUser.create({ email: email(), password: 'original-password' })
    const before = user.password
    const result = await resolveGoogleAccount({ email: user.email!, name: 'Google name' })
    assert.equal(result.id, user.id)
    assert.equal(result.password, before)
    assert.equal(result.accountStatus, 'no_account')
  }).skip(!process.env.GOOGLE_AUTH_TEST_SCHEMA)

  test('keeps the same user, password, member ID, and profile on repeat sign-in', async ({
    assert,
  }) => {
    const user = await PublicUser.create({
      email: email(),
      password: 'original-password',
      accountStatus: 'active',
      memberId: 'original-member',
    })
    const profile = await Profile.create({
      userId: user.id,
      name: 'Original profile',
      badges: ['SSC-4'],
      whatsapp: '0812345',
    })
    const before = user.password
    const result = await resolveGoogleAccount({ email: user.email!, name: 'Changed Google name' })
    assert.equal(result.id, user.id)
    assert.equal(result.password, before)
    assert.equal(result.memberId, 'original-member')
    await profile.refresh()
    assert.equal(profile.name, 'Original profile')
    assert.deepEqual(profile.badges, ['SSC-4'])
    assert.equal(profile.whatsapp, '0812345')
    assert.isTrue(await hash.verify(result.password!, 'original-password'))
  }).skip(!process.env.GOOGLE_AUTH_TEST_SCHEMA)

  test('concurrent first sign-ins create exactly one complete account', async ({ assert }) => {
    const identity = { email: email(), name: 'New member' }
    const results = await Promise.all([
      resolveGoogleAccount(identity),
      resolveGoogleAccount(identity),
      resolveGoogleAccount(identity),
    ])
    assert.equal(new Set(results.map((user) => user.id)).size, 1)
    assert.isNull(results[0].password)
    assert.isNotNull(results[0].memberId)
    assert.lengthOf(await Profile.query().where('user_id', results[0].id), 1)
  }).skip(!process.env.GOOGLE_AUTH_TEST_SCHEMA)

  test('matches mixed-case email and refuses ambiguous or inactive accounts', async ({
    assert,
  }) => {
    const address = email()
    const user = await PublicUser.create({
      email: address.toUpperCase(),
      password: 'unchanged',
      accountStatus: 'active',
    })
    const matched = await resolveGoogleAccount({ email: address, name: 'Google' })
    assert.equal(matched.id, user.id)
    user.accountStatus = 'inactive'
    await user.save()
    await assert.rejects(
      () => resolveGoogleAccount({ email: address, name: 'Google' }),
      'GOOGLE_ACCOUNT_INACTIVE'
    )
    await PublicUser.create({ email: address, password: 'other', accountStatus: 'active' })
    await assert.rejects(
      () => resolveGoogleAccount({ email: address, name: 'Google' }),
      'GOOGLE_EMAIL_PASSWORD_REQUIRED'
    )
  }).skip(!process.env.GOOGLE_AUTH_TEST_SCHEMA)

  test('imports legacy data and preserves the original password login until a password reset', async ({
    assert,
  }) => {
    const address = email()
    await LegacyMember.create({
      email: address.toUpperCase(),
      name: 'Legacy member',
      password: createHash('md5').update('old-password').digest('hex'),
      gender: 'L',
      phone: '08123',
      line_id: 'legacy-line',
      ssc: 5,
      lmd: 10,
      spectra: 2,
    })
    const user = await resolveGoogleAccount({ email: address, name: 'Google name' })
    const profile = await Profile.findByOrFail('user_id', user.id)
    assert.equal(profile.name, 'Legacy member')
    assert.equal(profile.whatsapp, '08123')
    assert.equal(profile.level, 10)
    assert.deepEqual(profile.badges, ['SSC-5', 'LMD-10', 'SPECTRA-2'])
    async function login(password: string): Promise<number> {
      const ctx = await testUtils.createHttpContext()
      ctx.request.updateBody({ email: address, password })
      const authManager = await ctx.containerResolver.make('auth.manager')
      ctx.auth = authManager.createAuthenticator(ctx)
      await new AuthController().login(ctx)
      return ctx.response.getStatus()
    }
    assert.equal(await login('wrong-password'), 401)
    assert.equal(await login('old-password'), 200)
    await user.merge({ password: 'new-password' }).save()
    assert.equal(await login('old-password'), 401)
    assert.equal(await login('new-password'), 200)
    const repeated = await resolveGoogleAccount({ email: address, name: 'Google' })
    assert.equal(repeated.id, user.id)
  })
    .skip(!process.env.GOOGLE_AUTH_TEST_SCHEMA)
    .timeout(10_000)
})
