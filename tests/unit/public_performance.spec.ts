import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { mock } from 'node:test'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import testUtils from '@adonisjs/core/services/test_utils'
import ProfileHistoriesController from '#controllers/profile_histories_controller'
import PublicUser from '#models/public_user'
import IssuedCertificate from '#models/issued_certificate'
import ActivityRegistration from '#models/activity_registration'
import { serializeOwnerCertificateState } from '#services/certificate_service'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import CustomForm from '#models/custom_form'
import {
  activityHistory,
  consultationHistory,
  achievementHistory,
  historyQuery,
} from '#services/profile_history_service'
import {
  createFormSession,
  submitStandalone,
  lockFormSession,
} from '#services/form_session_service'
import { uploadFormAttachment } from '#services/form_upload_service'
import type { UploadDependencies, UploadInput } from '#services/form_upload_service'
import { listCourses, showCourse, showLesson, readableDocument } from '#services/course_service'

const enabled = Boolean(process.env.PUBLIC_PERFORMANCE_TEST_SCHEMA)
test.group('Owned public performance fixtures', (group) => {
  let userId: number
  group.setup(async () => {
    if (!enabled) return
    const result = await db.rawQuery('SELECT current_schema() AS name')
    if (
      !process.env.PUBLIC_PERFORMANCE_TEST_SCHEMA?.startsWith('public_perf_') ||
      result.rows[0].name !== process.env.PUBLIC_PERFORMANCE_TEST_SCHEMA
    )
      throw new Error('Owned schema required')
    const [user] = await db
      .table('public_users')
      .insert({ email: 'owner@example.test', created_at: new Date(), updated_at: new Date() })
      .returning('id')
    userId = user.id
    await db.table('profiles').insert({
      user_id: userId,
      name: 'Owner',
      level: 3,
      created_at: new Date(),
      updated_at: new Date(),
    })
  })
  test('activity name-only search excludes description and status matches while preserving the default', async ({
    assert,
  }) => {
    const owner = await PublicUser.create({ email: 'search-scope@example.test' })
    const cases = [
      { name: 'Leadership workshop', description: 'Family support', status: 'DITERIMA' },
      { name: 'Family workshop', description: 'Other details', status: 'TERDAFTAR' },
      { name: 'Weekend workshop', description: 'Other details', status: 'FAMILY' },
    ]
    for (const [index, item] of cases.entries()) {
      const [activity] = await db
        .table('activities')
        .insert({ name: item.name, slug: `search-scope-${index}`, description: item.description })
        .returning('id')
      await db.table('activity_registrations').insert({
        user_id: owner.id,
        activity_id: activity.id,
        status: item.status,
        created_at: new Date(),
      })
    }
    const broad = await activityHistory(owner.id, historyQuery({ search: ' FAMILY ' }))
    assert.equal(broad.meta.total, 3)
    const names = await activityHistory(
      owner.id,
      historyQuery({ search: ' FAMILY ', search_scope: 'name' })
    )
    assert.equal(names.meta.total, 1)
    assert.equal(names.items[0].activity_name, 'Family workshop')
    assert.deepEqual(names.summary, broad.summary)
    const filtered = await activityHistory(
      owner.id,
      historyQuery({ search: 'family', search_scope: 'name', status: 'DITERIMA' })
    )
    assert.equal(filtered.meta.total, 0)
    assert.equal(filtered.summary.total, 3)
    const unsupported = await activityHistory(
      owner.id,
      historyQuery({ search: 'family', search_scope: 'unsupported' })
    )
    assert.equal(unsupported.meta.total, 3)
  })
    .skip(!enabled)
    .timeout(10000)

  test('empty, small and 1,000-row histories retain global counters and hide unreleased results', async ({
    assert,
  }) => {
    for (const service of [activityHistory, consultationHistory, achievementHistory]) {
      const empty = await service(userId, historyQuery({}))
      assert.lengthOf(empty.items, 0)
      assert.equal(empty.summary.total, 0)
    }
    await db.rawQuery(`INSERT INTO activities(name,slug,description,additional_config)
      SELECT 'Activity '||n,'performance-'||n,repeat('large description ',1000),
      CASE WHEN n%2=0 THEN '{"status_visibility":{"is_visible":false},"certificate_template_id":1}'::jsonb ELSE '{}'::jsonb END FROM generate_series(1,1000) n`)
    await db.rawQuery(
      `INSERT INTO activity_registrations(user_id,activity_id,status,created_at,questionnaire_answer)
      SELECT ?,id,'DITERIMA',now(),jsonb_build_object('large',repeat('answer',1000)) FROM activities`,
      [userId]
    )
    await db.rawQuery(
      `INSERT INTO achievements(user_id,name,description,achievement_date,type,score,proof,status)
      SELECT ?,'Achievement '||n,'Details',CURRENT_DATE,0,10,'proof',0 FROM generate_series(1,1000) n`,
      [userId]
    )
    await db.rawQuery(
      `INSERT INTO ruang_curhats(user_id,problem_category,problem_description,handling_technic,status,created_at)
      SELECT ?,'Family','Details','Online',0,now() FROM generate_series(1,1000) n`,
      [userId]
    )
    const start = performance.now()
    const baseline = await db
      .from('activity_registrations as ar')
      .join('activities as a', 'a.id', 'ar.activity_id')
      .where('ar.user_id', userId)
      .select('ar.*', 'a.description', 'a.additional_config', 'a.name')
    const baselineMs = performance.now() - start
    const afterStart = performance.now()
    const page = await activityHistory(userId, historyQuery({}))
    console.log(
      JSON.stringify({
        benchmark: 'activity-history-1000',
        baseline_ms: baselineMs,
        after_ms: performance.now() - afterStart,
        baseline_bytes: Buffer.byteLength(JSON.stringify(baseline)),
        after_bytes: Buffer.byteLength(JSON.stringify(page)),
        after_queries: 1,
      })
    )
    assert.lengthOf(page.items, 6)
    assert.equal(page.meta.total, 1000)
    assert.deepEqual(page.summary, { total: 1000, accepted: 500, rejected: 0, pending: 500 })
    assert.equal(page.items[0].status, 'BELUM DIUMUMKAN')
    assert.notProperty(page.items[0], 'certificate_state')
    const filtered = await activityHistory(
      userId,
      historyQuery({ status: 'DITERIMA', search: 'Activity 1000' })
    )
    assert.equal(filtered.meta.total, 0)
    assert.equal(filtered.summary.total, 1000)
    const second = await activityHistory(userId, historyQuery({ page: 2 }))
    assert.isBelow(second.items[0].id, page.items[5].id)
    const achievement = await achievementHistory(
      userId,
      historyQuery({ search: 'Achievement 1000' })
    )
    assert.equal(achievement.meta.total, 1)
    assert.equal(achievement.summary.points, 10000)
    const consultation = await consultationHistory(
      userId,
      historyQuery({ per_page: 1000, search: 'Family' })
    )
    assert.lengthOf(consultation.items, 100)
    assert.equal(consultation.summary.total, 1000)
    assert.isNull(consultation.items[0].adminUser)
    assert.deepEqual(historyQuery({ page: -1, per_page: 1000, search: 'x'.repeat(300) }), {
      page: 1,
      perPage: 100,
      search: 'x'.repeat(200),
      status: '',
    })
  })
    .skip(!enabled)
    .timeout(120000)

  test('100 lesson bodies never enter the sidebar and download checks preserve access', async ({
    assert,
  }) => {
    const [course] = await db
      .table('courses')
      .insert({
        title: 'Performance course',
        description: '<p>Overview</p>',
        status: 'published',
        minimum_level: 3,
      })
      .returning('id')
    await db.rawQuery(
      `INSERT INTO course_lessons(course_id,title,position,description,youtube_video_id)
      SELECT ?,'Lesson '||n,n,'<p>'||repeat('Body content ',8000)||'</p>','video' FROM generate_series(1,100) n`,
      [course.id]
    )
    const lessons = await db
      .from('course_lessons')
      .where('course_id', course.id)
      .orderBy('position')
      .select('id')
    await db.table('course_lesson_progress').insert({
      user_id: userId,
      lesson_id: lessons[0].id,
      completed_at: new Date(),
      last_visited_at: new Date(),
    })
    const [document] = await db
      .table('course_documents')
      .insert({
        lesson_id: lessons[0].id,
        storage_key: 'owned/fake.pdf',
        filename: 'file.pdf',
        size_bytes: 100,
      })
      .returning('id')
    const before = await db.from('course_lessons').where('course_id', course.id)
    const queries: string[] = []
    const client = db.connection().getReadClient()
    const capture = (query: { sql: string }): void => {
      queries.push(query.sql)
    }
    client.on('query', capture)
    const overview = await showCourse(userId, course.id)
    assert.lengthOf(overview.lessons, 100)
    assert.isTrue(overview.lessons[0].completed)
    assert.equal(overview.completed_lessons, 1)
    assert.notProperty(overview.lessons[0], 'description')
    const detail = await showLesson(userId, course.id, lessons[0].id)
    assert.include(detail.lesson.description, 'Body content')
    assert.notProperty(detail.lessons[0], 'description')
    assert.deepEqual(detail.documents, [{ id: document.id, filename: 'file.pdf', size_bytes: 100 }])
    assert.deepEqual(await readableDocument(userId, course.id, lessons[0].id, document.id), {
      filename: 'file.pdf',
      storageKey: 'owned/fake.pdf',
    })
    await assert.rejects(
      () => readableDocument(userId, course.id, lessons[1].id, document.id),
      'COURSE_NOT_FOUND'
    )
    const catalog = await listCourses(userId, {})
    client.removeListener('query', capture)
    const bodyQueries = queries.filter(
      (sql) => sql.includes('"description"') && sql.includes('from "course_lessons"')
    )
    assert.lengthOf(bodyQueries, 1)
    assert.include(bodyQueries[0], '"id" =')
    assert.isFalse(queries.some((sql) => sql.includes('select "course_lessons".*')))
    assert.notProperty(catalog.data[0], 'description')
    console.log(
      JSON.stringify({
        benchmark: 'course-sidebar-100',
        baseline_bytes: Buffer.byteLength(JSON.stringify(before)),
        after_bytes: Buffer.byteLength(JSON.stringify(overview.lessons)),
      })
    )
  })
    .skip(!enabled)
    .timeout(120000)

  test('certificate states match the existing owner serializer and older achievements are owner scoped', async ({
    assert,
  }) => {
    const [template] = await db
      .table('certificate_templates')
      .insert({ name: 'Fixture template' })
      .returning('id')
    const registrations = await ActivityRegistration.query()
      .where('user_id', userId)
      .orderBy('id')
      .limit(8)
    for (const [i, registration] of registrations.entries()) {
      registration.status = 'LULUS KEGIATAN'
      await registration.save()
      await db
        .from('activities')
        .where('id', registration.activityId)
        .update({
          name: `Certificate fixture ${i}`,
          additional_config: JSON.stringify({ certificate_template_id: template.id }),
        })
      const required = i % 2 === 0
      const certificate = await IssuedCertificate.create({
        certificateCode: `PERF-${i}`,
        registrationId: registration.id,
        activityId: registration.activityId,
        userId,
        templateId: template.id,
        templateSnapshot: {
          template_data: {
            elements: required ? [{ type: 'variable-text', variable: '{{approval}}' }] : [],
          },
        },
        participantSnapshot: {},
        activitySnapshot: {},
        issuedAt: DateTime.now(),
        revokedAt: i > 3 ? DateTime.now() : null,
        approvalSnapshot:
          i === 2
            ? { signer_name: 'Signer', signer_title: 'Title', approved_at: '2026-01-01' }
            : null,
      } as unknown as Partial<IssuedCertificate>)
      const actual = await activityHistory(
        userId,
        historyQuery({ search: `Certificate fixture ${i}`, per_page: 100 })
      )
      const row = actual.items.find((item) => item.id === registration.id)!
      const expected = serializeOwnerCertificateState(registration, certificate)
      assert.equal(row.certificate_state, expected.state)
      assert.equal(row.certificate_code, expected.certificate_code)
    }
    const oldest = await db.from('achievements').where('user_id', userId).orderBy('id').first()
    const controller = new ProfileHistoriesController()
    const ctx = await testUtils.createHttpContext()
    const user = await PublicUser.findOrFail(userId)
    const manager = await ctx.containerResolver.make('auth.manager')
    ctx.auth = manager.createAuthenticator(ctx)
    mock.method(ctx.auth, 'getUserOrFail', () => user)
    ctx.params = { id: String(oldest.id) }
    try {
      await controller.achievement(ctx)
      assert.equal(ctx.response.getStatus(), 200)
      await db.from('achievements').where('id', oldest.id).update({ user_id: null })
      await controller.achievement(ctx)
      assert.equal(ctx.response.getStatus(), 404)
    } finally {
      mock.restoreAll()
    }
  })
    .skip(!enabled)
    .timeout(10000)

  test('an acknowledged database commit followed by connection failure never deletes its object', async ({
    assert,
  }) => {
    const input = await fixture()
    const { deps, objects } = storage()
    const transaction = db.transaction.bind(db)
    let uncertain = true
    mock.method(
      db,
      'transaction',
      async (callback: (trx: TransactionClientContract) => Promise<unknown>) => {
        const result = await transaction(callback)
        if (uncertain) {
          uncertain = false
          throw new Error('lost commit acknowledgement')
        }
        return result
      }
    )
    try {
      await assert.rejects(() => uploadFormAttachment(input, deps), 'lost commit acknowledgement')
      assert.equal(objects.size, 1)
      const winner = await db.from('custom_form_attachments').where('id', input.uploadId).first()
      assert.isTrue(objects.has(winner.storage_key))
      const retry = await uploadFormAttachment(input, deps)
      assert.equal(retry.id, input.uploadId)
    } finally {
      mock.restoreAll()
    }
  })
    .skip(!enabled)
    .timeout(10000)

  async function fixture(maxFiles = 1): Promise<UploadInput> {
    const form = await CustomForm.create({
      formName: 'Upload fixture',
      featureType: 'independent_form',
      isActive: true,
      formSchema: {
        settings: { accessMode: 'public' },
        fields: [
          {
            section_name: 'Files',
            fields: [
              {
                key: 'proof',
                label: 'Proof',
                type: 'file',
                required: false,
                file: { accept: 'pdf', maxFiles, maxSizeMB: 1 },
              },
            ],
          },
        ],
      },
    })
    const session = await createFormSession(form, null)
    return {
      formId: form.id,
      userId: null,
      token: session.token,
      fieldKey: 'proof',
      uploadId: randomUUID(),
      path: 'memory',
      originalName: 'proof.pdf',
    }
  }
  function storage(): { deps: UploadDependencies; objects: Map<string, Buffer> } {
    const objects = new Map<string, Buffer>()
    return {
      objects,
      deps: {
        read: async () => Buffer.from('%PDF-test'),
        process: async (source) => ({
          contents: source,
          extension: 'pdf',
          mimeType: 'application/pdf',
          width: null,
          height: null,
        }),
        put: async (key, file) => {
          objects.set(key, file.contents)
        },
        remove: async (key) => {
          objects.delete(key)
        },
        cleanupError: (error) => {
          throw error
        },
      },
    }
  }
  test('slow processing and PUT hold no transaction; same-form sessions finalize independently', async ({
    assert,
  }) => {
    const input = await fixture()
    const form = await CustomForm.findOrFail(input.formId)
    const session = await createFormSession(form, null)
    const other = {
      ...input,
      token: session.token,
      uploadId: randomUUID(),
    }
    const { deps, objects } = storage()
    let release!: () => void
    let reached!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const ready = new Promise<void>((resolve) => {
      reached = resolve
    })
    const first = uploadFormAttachment(input, {
      ...deps,
      process: async (source, settings) => {
        const pool = db.connection().getReadClient().client.pool
        assert.equal(pool.numUsed(), 0)
        assert.equal(pool.numPendingAcquires(), 0)
        return deps.process(source, settings)
      },
      put: async (key, file) => {
        await deps.put(key, file)
        reached()
        await blocked
      },
    })
    await ready
    try {
      const locks = await db.rawQuery(
        `SELECT count(*)::int AS total FROM pg_locks WHERE relation='custom_forms'::regclass AND mode IN ('RowShareLock','RowExclusiveLock')`
      )
      assert.equal(locks.rows[0].total, 0)
      const started = performance.now()
      await uploadFormAttachment(other, deps)
      console.log(
        JSON.stringify({
          benchmark: 'upload-delayed-put',
          other_session_finalize_ms: performance.now() - started,
          form_row_locks_during_put: 0,
        })
      )
    } finally {
      release()
    }
    await first
    assert.equal(objects.size, 2)
  })
    .skip(!enabled)
    .timeout(10000)
  test('concurrent duplicate retries retain one winner and last-slot races remove only losers', async ({
    assert,
  }) => {
    for (const duplicate of [true, false]) {
      const input = await fixture()
      const { deps, objects } = storage()
      let arrivals = 0
      let release!: () => void
      const both = new Promise<void>((resolve) => {
        release = resolve
      })
      const delayed = {
        ...deps,
        put: async (key: string, file: Parameters<UploadDependencies['put']>[1]) => {
          await deps.put(key, file)
          if (++arrivals === 2) release()
          await both
        },
      }
      const results = await Promise.allSettled([
        uploadFormAttachment(input, delayed),
        uploadFormAttachment(
          { ...input, uploadId: duplicate ? input.uploadId : randomUUID() },
          delayed
        ),
      ])
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, duplicate ? 2 : 1)
      assert.equal(objects.size, 1)
      const rows = await db
        .from('custom_form_attachments')
        .whereIn('storage_key', [...objects.keys()])
      assert.lengthOf(rows, 1)
      assert.notInclude(rows[0].storage_key, input.uploadId)
      const retry = await uploadFormAttachment({ ...input, uploadId: rows[0].id }, deps)
      assert.equal(retry.id, rows[0].id)
    }
  })
    .skip(!enabled)
    .timeout(10000)
  test('removal during a pending PUT cannot remove the new attempt or consume its file slot', async ({
    assert,
  }) => {
    const first = await fixture(2)
    const { deps, objects } = storage()
    await uploadFormAttachment(first, deps)
    const next = { ...first, uploadId: randomUUID() }
    await uploadFormAttachment(next, {
      ...deps,
      put: async (key, file) => {
        await deps.put(key, file)
        await db.transaction(async (trx) => {
          const form = await CustomForm.query({ client: trx })
            .where('id', first.formId)
            .forShare()
            .firstOrFail()
          const session = await lockFormSession(trx, form, first.token, null)
          const old = await trx
            .from('custom_form_attachments')
            .where('id', first.uploadId)
            .where('session_id', session.id)
            .whereNull('claimed_at')
            .forUpdate()
            .first()
          await deps.remove(old.storage_key)
          await trx.from('custom_form_attachments').where('id', old.id).delete()
        })
      },
    })
    assert.equal(objects.size, 1)
    const remaining = await db.from('custom_form_attachments').where('id', next.uploadId).first()
    assert.isTrue(objects.has(remaining.storage_key))
    assert.isNull(await db.from('custom_form_attachments').where('id', first.uploadId).first())
  })
    .skip(!enabled)
    .timeout(10000)

  test('member, guest, club and standalone uploads enforce ownership and recheck availability', async ({
    assert,
  }) => {
    for (const kind of ['member', 'guest', 'club', 'standalone']) {
      const input = await fixture(2)
      const form = await CustomForm.findOrFail(input.formId)
      if (kind === 'member' || kind === 'guest') {
        const inserted = await db.rawQuery(
          `INSERT INTO activities(name,slug,activity_type,is_published,is_registration_open,registration_start,registration_end,additional_config) VALUES('Upload activity',?,1,true,true,CURRENT_DATE-1,CURRENT_DATE+1,'{"allow_guest_registration":true}') RETURNING id`,
          [randomUUID()]
        )
        form.featureType = 'activity_registration'
        form.featureId = inserted.rows[0].id
      } else if (kind === 'club') {
        const [club] = await db
          .table('clubs')
          .insert({ name: 'Upload club', is_show: true, is_registration_open: true })
          .returning('id')
        form.featureType = 'club_registration'
        form.featureId = club.id
      }
      await form.save()
      input.userId = kind === 'guest' ? null : userId
      const session = await createFormSession(form, input.userId)
      input.token = session.token
      const { deps, objects } = storage()
      await uploadFormAttachment(input, deps)
      const otherSession = await createFormSession(form, input.userId)
      const foreign = { ...input, token: otherSession.token }
      await assert.rejects(() => uploadFormAttachment(foreign, deps), 'INVALID_FORM_ATTACHMENT')
      assert.equal(objects.size, 1)
      if (kind === 'member' || kind === 'club') {
        const changed = {
          ...deps,
          put: async (key: string, file: Parameters<UploadDependencies['put']>[1]) => {
            await deps.put(key, file)
            await db
              .from(kind === 'club' ? 'clubs' : 'activities')
              .where('id', form.featureId!)
              .update({ is_registration_open: false })
          },
        }
        await assert.rejects(
          () => uploadFormAttachment({ ...input, uploadId: randomUUID() }, changed),
          'REGISTRATION_CLOSED'
        )
        assert.equal(objects.size, 1)
      }
    }
  })
    .skip(!enabled)
    .timeout(30000)

  test('finalization rejects changed forms, completed or expired sessions, and storage failures', async ({
    assert,
  }) => {
    for (const change of ['closed', 'schema', 'completed', 'expired', 'storage']) {
      const input = await fixture()
      const { deps, objects } = storage()
      const changed = {
        ...deps,
        put: async (key: string, file: Parameters<UploadDependencies['put']>[1]) => {
          await deps.put(key, file)
          if (change === 'closed')
            await db.from('custom_forms').where('id', input.formId).update({ is_active: false })
          if (change === 'schema')
            await db
              .from('custom_forms')
              .where('id', input.formId)
              .update({ form_schema: JSON.stringify({ fields: [] }) })
          if (change === 'completed') await submitStandalone(input.formId, input.token, null, {})
          if (change === 'expired')
            await db
              .from('custom_form_sessions')
              .where('form_id', input.formId)
              .update({ expires_at: new Date(0) })
          if (change === 'storage') throw new Error('storage failed after PUT')
        },
      }
      await assert.rejects(() => uploadFormAttachment(input, changed))
      assert.equal(objects.size, 0)
    }
  })
    .skip(!enabled)
    .timeout(10000)
})
