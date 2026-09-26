import { test } from '@japa/runner'
import Activity from '#models/activity'
import ActivityRegistration from '#models/activity_registration'
import CertificateTemplate from '#models/certificate_template'
import IssuedCertificate from '#models/issued_certificate'
import {
  getCertificateDownloadAccess,
  getOwnerCertificateByCode,
  getPublicCertificateByCode,
  getOwnerCertificateByRegistration,
  getOwnerRegistrationCertificateState,
} from '#services/certificate_service'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import { randomUUID } from 'node:crypto'

test.group('Certificate access integration', (group) => {
  group.each.setup(async () => {
    if (process.env.CERTIFICATE_INTEGRATION !== '1') return async () => {}
    const schema = process.env.CERTIFICATE_TEST_SCHEMA ?? ''
    if (!/^go_rewrite_[a-f0-9]{16}_candidate$/.test(schema))
      throw new Error('Owned certificate schema required')
    const ownership = await db.rawQuery(
      'SELECT current_schema() AS schema, current_schemas(false)=ARRAY[?]::name[] AS isolated, obj_description(oid) AS marker FROM pg_namespace WHERE nspname=?',
      [schema, schema]
    )
    if (
      ownership.rows[0]?.schema !== schema ||
      !ownership.rows[0]?.isolated ||
      ownership.rows[0]?.marker !== `certificate approval test ${schema.split('_')[2]}`
    )
      throw new Error('Certificate schema ownership mismatch')
    await db.beginGlobalTransaction()
    return async () => {
      await db.rollbackGlobalTransaction()
    }
  })
  test('returns lightweight ownership and independently guards the authorized snapshot', async ({
    assert,
  }) => {
    const [user] = await db
      .table('public_users')
      .insert({
        email: `${randomUUID()}@example.test`,
        password: 'fixture-only',
        created_at: new Date(),
      })
      .returning('id')
    const activity = await Activity.create({ name: 'Fixture', slug: randomUUID() })
    const registration = await ActivityRegistration.create({
      activityId: activity.id,
      userId: user.id,
      status: 'LULUS KEGIATAN',
    })
    const template = await CertificateTemplate.create({
      name: 'Fixture',
      templateData: { backgroundUrl: null, canvasWidth: 800, canvasHeight: 566, elements: [] },
      lifecycleStatus: 'published',
      version: 1,
      backgroundAssetVersion: 0,
      isActive: true,
    })
    const issued = await IssuedCertificate.create({
      certificateCode: `CERT-${randomUUID().toUpperCase()}`,
      registrationId: registration.id,
      userId: user.id,
      activityId: activity.id,
      templateId: template.id,
      templateVersion: 1,
      snapshotVersion: 1,
      issuedAt: DateTime.now(),
      templateSnapshot: {
        id: template.id,
        name: template.name,
        background_image: null,
        template_data: template.templateData,
      },
      participantSnapshot: {
        registration_id: registration.id,
        user_id: user.id,
        name: 'Fixture participant',
        email: 'private@example.test',
        university: '',
        gender: '',
        activity_name: activity.name,
        activity_date: '9 September 2026',
      },
      activitySnapshot: { id: activity.id, name: activity.name, activity_start: null },
    })
    const access = await getCertificateDownloadAccess(issued.certificateCode.toLowerCase(), user.id)
    assert.deepEqual(access, { success: true, data: { can_download: true, reason: 'owner' } })
    const other = await getCertificateDownloadAccess(issued.certificateCode, user.id + 1)
    assert.deepEqual(other, { success: true, data: { can_download: false, reason: 'not_owner' } })
    assert.deepEqual(await getOwnerCertificateByCode(issued.certificateCode, user.id + 1), {
      success: false,
      error: 'FORBIDDEN',
    })
    const owned = await getOwnerCertificateByCode(issued.certificateCode, user.id)
    assert.isTrue(owned.success)
    const publicData = await getPublicCertificateByCode(issued.certificateCode)
    assert.isTrue(publicData.success)
    assert.notInclude(JSON.stringify(publicData), 'private@example.test')
    await issued.merge({ revokedAt: DateTime.now(), revokedReason: 'Fixture revocation' }).save()
    assert.deepEqual(await getCertificateDownloadAccess(issued.certificateCode, user.id), {
      success: true,
      data: { can_download: false, reason: 'revoked' },
    })
    assert.deepEqual(await getOwnerCertificateByCode(issued.certificateCode, user.id), {
      success: false,
      error: 'CERTIFICATE_REVOKED',
    })
    const replacement = await IssuedCertificate.create({
      certificateCode: `CERT-${randomUUID().toUpperCase()}`,
      registrationId: registration.id,
      userId: user.id,
      activityId: activity.id,
      templateId: template.id,
      templateVersion: 1,
      snapshotVersion: 1,
      issuedAt: DateTime.now(),
      templateSnapshot: issued.templateSnapshot,
      participantSnapshot: { ...issued.participantSnapshot, name: 'Corrected participant' },
      activitySnapshot: issued.activitySnapshot,
    })
    const latest = await getOwnerCertificateByRegistration(registration.id, user.id)
    assert.isTrue(latest.success)
    if (latest.success)
      assert.equal(latest.data.certificate.certificate_code, replacement.certificateCode)
    const state = await getOwnerRegistrationCertificateState(registration.id, user.id)
    assert.isTrue(state.success)
    if (state.success) assert.equal(state.data.certificate_code, replacement.certificateCode)
    assert.deepEqual(await getOwnerCertificateByCode(issued.certificateCode, user.id), {
      success: false,
      error: 'CERTIFICATE_REVOKED',
    })
    const revokedPublic = await getPublicCertificateByCode(issued.certificateCode)
    assert.isTrue(revokedPublic.success)
    assert.deepEqual(await getCertificateDownloadAccess('MISSING', user.id), {
      success: false,
      error: 'CERTIFICATE_NOT_FOUND',
    })
  }).skip(process.env.CERTIFICATE_INTEGRATION !== '1')
})
