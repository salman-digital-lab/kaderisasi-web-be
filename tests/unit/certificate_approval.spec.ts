import { test } from '@japa/runner'
import IssuedCertificate from '#models/issued_certificate'
import { hasCertificateApproval } from '#services/certificate_approval'

test.group('Certificate approval availability', () => {
  test('requires approval evidence for e-sign certificates while retaining legacy certificates', ({
    assert,
  }) => {
    const issued = new IssuedCertificate()
    issued.templateSnapshot = {
      id: 1,
      name: 'Fixture',
      background_image: null,
      template_data: { backgroundUrl: null, canvasWidth: 800, canvasHeight: 566, elements: [] },
    }
    assert.isTrue(hasCertificateApproval(issued))
    issued.templateSnapshot.template_data.elements.push({
      id: 'approval',
      type: 'variable-text',
      variable: '{{approval}}',
      x: 0,
      y: 0,
      width: 320,
      height: 120,
    })
    assert.isFalse(hasCertificateApproval(issued))
    issued.approvalSnapshot = {
      request_id: 1,
      signer_id: 2,
      signer_name: 'Fixture signer',
      signer_title: 'Ketua',
      approved_at: '2026-09-10T10:00:00.000+07:00',
      content_hash: 'a'.repeat(64),
    }
    assert.isTrue(hasCertificateApproval(issued))
  })
})
