import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import Club from '#models/club'
import PublicUser from '#models/public_user'
import CustomForm from '#models/custom_form'
import ClubRegistration from '#models/club_registration'
import CustomFormsController from '#controllers/custom_forms_controller'
import ClubRegistrationsController from '#controllers/club_registrations_controller'
import { randomUUID } from 'node:crypto'

// Explicit opt-in: fixtures live entirely inside a rolled-back transaction.
test.group('Club registration workflow', (group) => {
  group.each.setup(async () => {
    if (process.env.CLUB_REGISTRATION_INTEGRATION !== '1') return async () => {}
    await db.beginGlobalTransaction()
    return () => db.rollbackGlobalTransaction()
  })

  test('validates, deduplicates, isolates applicants, and protects reviewed submissions', async ({
    assert,
  }) => {
    const club = await Club.create({
      name: `QA ${randomUUID()}`,
      isShow: true,
      isRegistrationOpen: true,
    })
    const user = await PublicUser.create({
      email: `${randomUUID()}@example.test`,
      password: 'fixture-only',
      accountStatus: 'active',
    })
    const other = await PublicUser.create({
      email: `${randomUUID()}@example.test`,
      password: 'fixture-only',
      accountStatus: 'active',
    })
    const schema = {
      fields: [
        {
          section_name: 'Answers',
          fields: [
            { key: 'experience', label: 'Experience', type: 'number', required: true },
            { key: 'consent', label: 'Consent', type: 'checkbox', required: true },
          ],
        },
      ],
    }
    const form = await CustomForm.create({
      formName: 'QA registration',
      featureType: 'club_registration',
      featureId: club.id,
      formSchema: schema,
      isActive: true,
    })
    async function context(body: Record<string, unknown> = {}, applicant = user) {
      const ctx = await testUtils.createHttpContext()
      ctx.params = { id: String(club.id) }
      ctx.request.updateBody(body)
      const authManager = await ctx.containerResolver.make('auth.manager')
      ctx.auth = authManager.createAuthenticator(ctx)
      ctx.auth.getUserOrFail = () => Object.assign(applicant, { currentToken: 'fixture-only' })
      return ctx
    }
    async function register(answers: Record<string, unknown>, status: number) {
      const ctx = await context({
        feature_type: 'club_registration',
        feature_id: club.id,
        custom_form_data: answers,
      })
      await new CustomFormsController().register(ctx)
      assert.equal(ctx.response.getStatus(), status, JSON.stringify(ctx.response.getBody()))
    }
    await register({ experience: 0, consent: false }, 422)
    await register({ experience: 0, consent: true, injected: 'bad' }, 422)
    await register({ experience: 0, consent: true }, 201)
    await register({ experience: 0, consent: true }, 409)
    const registration = await ClubRegistration.findByOrFail('clubId', club.id)
    assert.deepEqual(registration.additionalData, { experience: 0, consent: true })
    const stranger = await context({}, other)
    await new ClubRegistrationsController().cancelRegistration(stranger)
    assert.equal(stranger.response.getStatus(), 404)
    const pending = await context()
    await new ClubRegistrationsController().cancelRegistration(pending)
    assert.equal(pending.response.getStatus(), 200)
    await register({ experience: 0, consent: true }, 201)
    const reviewed = await ClubRegistration.findByOrFail('clubId', club.id)
    reviewed.status = 'APPROVED'
    await reviewed.save()
    const cancellation = await context()
    await new ClubRegistrationsController().cancelRegistration(cancellation)
    assert.equal(cancellation.response.getStatus(), 400)
    const amendment = await context({ additional_data: { consent: false, injected: 'bad' } })
    await new ClubRegistrationsController().updateRegistration(amendment)
    assert.equal(amendment.response.getStatus(), 400)
    await reviewed.refresh()
    assert.deepEqual(reviewed.additionalData, { experience: 0, consent: true })
    club.isRegistrationOpen = false
    await club.save()
    await register({ experience: 0, consent: true }, 400)
    club.isRegistrationOpen = true
    await club.save()
    form.isActive = false
    await form.save()
    await register({ experience: 0, consent: true }, 400)
  })
    .skip(process.env.CLUB_REGISTRATION_INTEGRATION !== '1')
    .timeout(30000)
})
