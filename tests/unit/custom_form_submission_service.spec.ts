import { test } from '@japa/runner'
import { validateCustomFormSubmission } from '#services/custom_form_submission_service'

const schema = {
  fields: [
    {
      section_name: 'profile_data',
      fields: [{ key: 'name', label: 'Nama', required: true, type: 'text' }],
    },
    {
      section_name: 'Motivasi',
      fields: [
        {
          key: 'motivation',
          label: 'Motivasi',
          required: true,
          type: 'textarea',
          validation: { minLength: 5, maxLength: 100 },
        },
        {
          key: 'division',
          label: 'Divisi',
          required: true,
          type: 'select',
          options: [
            { label: 'Acara', value: 'event' },
            { label: 'Rahasia', value: 'secret', disabled: true },
          ],
        },
        {
          key: 'experience',
          label: 'Pengalaman',
          required: false,
          type: 'number',
          validation: { min: 0, max: 10 },
        },
      ],
    },
  ],
}

test.group('Custom form submission validation', () => {
  test('accepts answers that match the active form schema', ({ assert }) => {
    const result = validateCustomFormSubmission(schema, {
      motivation: 'Ingin berkontribusi',
      division: 'event',
      experience: 2,
    })

    assert.isTrue(result.valid)
  })

  test('does not require profile fields that are saved separately', ({ assert }) => {
    const result = validateCustomFormSubmission(schema, {
      motivation: 'Cukup panjang',
      division: 'event',
    })

    assert.isTrue(result.valid)
  })

  test('accepts but does not persist profile fields saved by the profile service', ({ assert }) => {
    const result = validateCustomFormSubmission(schema, {
      name: 'Naufal',
      motivation: 'Cukup panjang',
      division: 'event',
    })

    assert.isTrue(result.valid)
    if (result.valid) {
      assert.notProperty(result.data, 'name')
      assert.equal(result.data.motivation, 'Cukup panjang')
    }
  })

  test('rejects missing, invalid, disabled, and unknown answers', ({ assert }) => {
    const missing = validateCustomFormSubmission(schema, { division: 'event' })
    const disabled = validateCustomFormSubmission(schema, {
      motivation: 'Cukup panjang',
      division: 'secret',
    })
    const unknown = validateCustomFormSubmission(schema, {
      motivation: 'Cukup panjang',
      division: 'event',
      injected: '<script>bad()</script>',
    })

    assert.isFalse(missing.valid)
    assert.isFalse(disabled.valid)
    assert.isFalse(unknown.valid)
  })

  test('rejects invalid number and text constraints', ({ assert }) => {
    const shortText = validateCustomFormSubmission(schema, {
      motivation: 'no',
      division: 'event',
    })
    const excessiveNumber = validateCustomFormSubmission(schema, {
      motivation: 'Cukup panjang',
      division: 'event',
      experience: 11,
    })

    assert.isFalse(shortText.valid)
    assert.isFalse(excessiveNumber.valid)
  })

  test('rejects malformed schemas and oversized payloads', ({ assert }) => {
    assert.isFalse(validateCustomFormSubmission({}, {}).valid)
    assert.isFalse(
      validateCustomFormSubmission(
        {
          fields: [
            {
              section_name: 'Data',
              fields: [{ key: 'notes', label: 'Catatan', required: false, type: 'textarea' }],
            },
          ],
        },
        { notes: 'a'.repeat(100_001) }
      ).valid
    )
  })
})
