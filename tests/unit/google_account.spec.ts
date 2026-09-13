import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import testUtils from '@adonisjs/core/services/test_utils'
import encryption from '@adonisjs/core/services/encryption'
import mail from '@adonisjs/mail/services/main'
import PublicUser from '#models/public_user'
import Profile from '#models/profile'
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

  test('migrated account uses recovery and scrypt with the legacy table absent', async ({
    assert,
  }) => {
    const address = email()
    const legacyTable = await db.rawQuery("SELECT to_regclass('legacy_members') AS name")
    assert.isNull(legacyTable.rows[0].name)
    const user = await PublicUser.create({
      email: address,
      password: null,
      accountStatus: 'active',
      memberId: randomUUID(),
    })
    const profile = await Profile.create({
      userId: user.id,
      name: 'Migrated member',
      badges: ['SSC-5'],
    })
    const google = await resolveGoogleAccount({ email: address, name: 'Google name' })
    assert.equal(google.id, user.id)
    await profile.refresh()
    assert.equal(profile.name, 'Migrated member')
    async function login(password: string): Promise<number> {
      const ctx = await testUtils.createHttpContext()
      ctx.request.updateBody({ email: address.toUpperCase(), password })
      const authManager = await ctx.containerResolver.make('auth.manager')
      ctx.auth = authManager.createAuthenticator(ctx)
      await new AuthController().login(ctx)
      return ctx.response.getStatus()
    }
    assert.equal(await login('wrong-password'), 401)
    assert.equal(await login('old-password'), 401)
    const recovery = await testUtils.createHttpContext()
    recovery.request.updateBody({ email: address.toUpperCase() })
    mail.fake()
    try {
      await new AuthController().sendPasswordRecovery(recovery)
      assert.equal(recovery.response.getStatus(), 200)
    } finally {
      mail.restore()
    }
    const reset = await testUtils.createHttpContext()
    reset.request.updateBody({ password: 'new-password', password_confirmation: 'new-password' })
    reset.request.updateQs({ token: encryption.encrypt(address, '30 minutes') })
    await new AuthController().resetPassword(reset)
    assert.equal(reset.response.getStatus(), 200)
    await user.refresh()
    assert.isTrue(user.password!.startsWith('$scrypt$'))
    assert.equal(await login('old-password'), 401)
    assert.equal(await login('new-password'), 200)
    const repeated = await resolveGoogleAccount({ email: address, name: 'Google' })
    assert.equal(repeated.id, user.id)
  })
    .skip(!process.env.GOOGLE_AUTH_TEST_SCHEMA)
    .timeout(10_000)

  test('register, email checks, and unknown login use only public accounts', async ({ assert }) => {
    const address = email()
    const controller = new AuthController()
    async function context(body: Record<string, string>) {
      const ctx = await testUtils.createHttpContext()
      ctx.request.updateBody(body)
      return ctx
    }
    const missing = await context({ email: address, password: 'password' })
    await controller.login(missing)
    assert.equal(missing.response.getStatus(), 404)
    assert.isNull(await PublicUser.findBy('email', address))
    const available = await context({ email: address })
    await controller.checkEmail(available)
    assert.deepEqual(available.response.getBody(), {
      message: 'EMAIL_AVAILABLE',
      data: { exists: false },
    })
    const register = await context({
      email: address.toUpperCase(),
      password: 'password',
      fullname: 'New registration',
    })
    await controller.register(register)
    assert.equal(register.response.getStatus(), 200)
    const user = await PublicUser.findByOrFail('email', address)
    assert.isTrue(await hash.verify(user.password!, 'password'))
    const profile = await Profile.findByOrFail('user_id', user.id)
    assert.equal(profile.name, 'New registration')
    const duplicate = await context({
      email: address,
      password: 'different',
      fullname: 'Duplicate',
    })
    await controller.register(duplicate)
    assert.equal(duplicate.response.getStatus(), 409)
    const taken = await context({ email: address })
    await controller.checkEmail(taken)
    assert.deepEqual(taken.response.getBody(), {
      message: 'EMAIL_ALREADY_REGISTERED',
      data: { exists: true },
    })
    const invalid = await context({ password: 'replacement' })
    invalid.request.updateQs({ token: 'invalid' })
    await controller.resetPassword(invalid)
    assert.equal(invalid.response.getStatus(), 401)
    await user.refresh()
    assert.isTrue(await hash.verify(user.password!, 'password'))
  }).skip(!process.env.GOOGLE_AUTH_TEST_SCHEMA)
})
