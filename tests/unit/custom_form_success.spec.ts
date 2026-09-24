import { test } from '@japa/runner'
import { mock } from 'node:test'
import testUtils from '@adonisjs/core/services/test_utils'
import Activity from '#models/activity'
import CustomForm from '#models/custom_form'
import CustomFormsController from '#controllers/custom_forms_controller'

test.group('Custom form success projection', (group) => {
  group.each.teardown(() => mock.restoreAll())

  test('selects only instructions, sanitizes HTML, and never reads the schema', async ({
    assert,
  }) => {
    const selected: string[][] = []
    const form = { id: 7, postSubmissionInfo: '<p>Welcome</p><script>alert(1)</script>' }
    Object.defineProperty(form, 'formSchema', {
      get: () => {
        throw new Error('Schema must not be read')
      },
    })
    const query = {
      select(columns: string[]) {
        selected.push(columns)
        return this
      },
      where() {
        return this
      },
      orderBy() {
        return this
      },
      async first() {
        return form
      },
    }
    mock.method(CustomForm, 'query', () => query)
    mock.method(Activity, 'find', async () => ({ isPublished: true }))
    const ctx = await testUtils.createHttpContext()
    ctx.request.updateQs({
      feature_type: 'activity_registration',
      feature_id: '176',
      view: 'success',
    })
    await new CustomFormsController().getByFeature(ctx)
    assert.equal(ctx.response.getStatus(), 200)
    assert.deepEqual(selected, [['id', 'post_submission_info']])
    assert.deepEqual(ctx.response.getBody(), {
      message: 'GET_DATA_SUCCESS',
      data: { id: 7, post_submission_info: '<p>Welcome</p>' },
    })
  })

  test('does not expose instructions for an unpublished activity', async ({ assert }) => {
    mock.method(Activity, 'find', async () => ({ isPublished: false }))
    const query = mock.method(CustomForm, 'query', () => {
      throw new Error('Must not query forms')
    })
    const ctx = await testUtils.createHttpContext()
    ctx.request.updateQs({
      feature_type: 'activity_registration',
      feature_id: '176',
      view: 'success',
    })
    await new CustomFormsController().getByFeature(ctx)
    assert.equal(ctx.response.getStatus(), 404)
    assert.equal(query.mock.callCount(), 0)
  })

  test('preserves missing-form errors', async ({ assert }) => {
    const query = {
      select() {
        return this
      },
      where() {
        return this
      },
      orderBy() {
        return this
      },
      async first() {
        return null
      },
    }
    mock.method(CustomForm, 'query', () => query)
    const ctx = await testUtils.createHttpContext()
    ctx.request.updateQs({ feature_type: 'club_registration', feature_id: '40', view: 'success' })
    await new CustomFormsController().getByFeature(ctx)
    assert.equal(ctx.response.getStatus(), 404)
    assert.deepEqual(ctx.response.getBody(), { message: 'CUSTOM_FORM_NOT_FOUND' })
  })
})
