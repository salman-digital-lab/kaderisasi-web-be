import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import Activity from '#models/activity'
import CustomForm from '#models/custom_form'
import PublicUser from '#models/public_user'
import ActivitiesController from '#controllers/activities_controller'
import CustomFormsController from '#controllers/custom_forms_controller'
import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'

test.group('Activity publication and registration workflow', (group) => {
  group.each.setup(async () => {
    if (process.env.ACTIVITY_REGISTRATION_INTEGRATION !== '1') return async () => {}
    if (!process.env.DB_SCHEMA?.startsWith('go_rewrite_'))
      throw new Error('Owned test schema required')
    await db.beginGlobalTransaction()
    return () => db.rollbackGlobalTransaction()
  })
  test('hides drafts and enforces registration state for authenticated and guest submissions', async ({
    assert,
  }) => {
    const today = DateTime.now().setZone('Asia/Jakarta').startOf('day')
    const activity = await Activity.create({
      name: 'Activity workflow fixture',
      slug: randomUUID(),
      isPublished: false,
      isRegistrationOpen: false,
      activityType: 1,
      registrationStart: today,
      registrationEnd: today,
      additionalConfig: {
        allow_guest_registration: true,
        images: [],
        additional_questionnaire: [],
        mandatory_profile_data: [],
        custom_selection_status: [],
      },
    })
    const user = await PublicUser.create({
      email: `${randomUUID()}@example.test`,
      password: 'fixture-only',
      accountStatus: 'active',
    })
    const form = await CustomForm.create({
      formName: 'Activity workflow form',
      featureType: 'activity_registration',
      featureId: activity.id,
      isActive: true,
      formSchema: { fields: [] },
    })
    const context = async (): Promise<Awaited<ReturnType<typeof testUtils.createHttpContext>>> => {
      const ctx = await testUtils.createHttpContext()
      ctx.params = { slug: activity.slug }
      const manager = await ctx.containerResolver.make('auth.manager')
      ctx.auth = manager.createAuthenticator(ctx)
      ctx.auth.getUserOrFail = () => Object.assign(user, { currentToken: 'fixture-only' })
      return ctx
    }
    const register = async (expected: number): Promise<void> => {
      const ctx = await context()
      ctx.request.updateBody({
        feature_type: 'activity_registration',
        feature_id: activity.id,
        custom_form_data: {},
      })
      await new CustomFormsController().register(ctx)
      assert.equal(ctx.response.getStatus(), expected, JSON.stringify(ctx.response.getBody()))
    }
    const guest = async (expected: number): Promise<void> => {
      const ctx = await context()
      ctx.request.updateBody({
        guest_data: { name: 'Guest fixture', email: 'fixture@example.test' },
        questionnaire_answer: {},
      })
      await new ActivitiesController().guestRegister(ctx)
      assert.equal(ctx.response.getStatus(), expected, JSON.stringify(ctx.response.getBody()))
    }
    const detail = await context()
    await new ActivitiesController().show(detail)
    assert.equal(detail.response.getStatus(), 404)
    await register(400)
    await guest(404)
    activity.isPublished = true
    await activity.save()
    await register(400)
    await guest(403)
    activity.isRegistrationOpen = true
    activity.registrationStart = today.plus({ days: 1 })
    activity.registrationEnd = today.plus({ days: 2 })
    await activity.save()
    await register(400)
    await guest(403)
    activity.registrationStart = today
    activity.registrationEnd = today
    await activity.save()
    form.isActive = false
    await form.save()
    await register(400)
    await guest(400)
    form.isActive = true
    await form.save()
    await register(201)
    await register(409)
    await guest(200)
    activity.registrationEnd = today.minus({ days: 1 })
    await activity.save()
    await register(400)
    await guest(403)
  }).skip(process.env.ACTIVITY_REGISTRATION_INTEGRATION !== '1')
})
