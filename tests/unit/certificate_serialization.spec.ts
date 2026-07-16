import { test } from '@japa/runner'
import {
  normalizeCertificateCode,
  serializeCertificateVerification,
  serializePublicCertificate,
  type CertificateResponseData,
} from '#services/certificate_service'

function certificateData(): CertificateResponseData {
  return {
    activity: { id: 7, name: 'Leadership Camp', activity_start: '2026-07-01' },
    template: {
      id: 5,
      name: 'Leadership',
      background_image: null,
      template_data: {
        backgroundUrl: null,
        canvasWidth: 800,
        canvasHeight: 566,
        elements: [],
      },
    },
    participant: {
      registration_id: 99,
      user_id: 12,
      name: 'Participant',
      email: 'private@example.com',
      university: 'ITB',
      gender: 'F',
      activity_name: 'Leadership Camp',
      activity_date: '1 Juli 2026',
    },
    certificate: {
      id: 4,
      certificate_code: 'CERT-2026-7-ABCDEF',
      registration_id: 99,
      activity_id: 7,
      template_id: 5,
      issued_at: '2026-07-16T00:00:00.000Z',
      revoked_at: null,
      revoked_reason: null,
    },
  }
}

test.group('Public certificate serialization', () => {
  test('strips email and all internal identifiers', ({ assert }) => {
    const serialized = serializePublicCertificate(certificateData())
    const payload = JSON.stringify(serialized)

    assert.notInclude(payload, 'private@example.com')
    assert.notInclude(payload, 'registration_id')
    assert.notInclude(payload, 'user_id')
    assert.notInclude(payload, 'template_id')
    assert.notInclude(payload, 'activity_id')
    assert.equal(serialized.participant.name, 'Participant')
  })

  test('returns the minimal verification contract', ({ assert }) => {
    const verification = serializeCertificateVerification(certificateData())

    assert.deepEqual(verification, {
      valid: true,
      state: 'issued_active',
      certificate_code: 'CERT-2026-7-ABCDEF',
      participant_name: 'Participant',
      activity_name: 'Leadership Camp',
      activity_date: '1 Juli 2026',
      issued_at: '2026-07-16T00:00:00.000Z',
      revoked_at: null,
      revoked_reason: null,
    })
  })

  test('normalizes safe codes and rejects malformed input', ({ assert }) => {
    assert.equal(normalizeCertificateCode(' cert-2026-7-abcdef '), 'CERT-2026-7-ABCDEF')
    assert.isNull(normalizeCertificateCode('CERT/../../secret'))
    assert.isNull(normalizeCertificateCode('A'.repeat(97)))
  })
})
