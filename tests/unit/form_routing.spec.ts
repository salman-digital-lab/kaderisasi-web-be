import { readFileSync } from 'node:fs'
import { test } from '@japa/runner'
import { formRoute, validateFormRouting } from '#services/form_routing'
import type { RoutingSchema } from '#services/form_routing'
import { validateCustomFormSubmission } from '#services/custom_form_submission_service'

const fixtures = JSON.parse(
  readFileSync(new URL('./form-routing.fixtures.json', import.meta.url), 'utf8')
) as {
  schema: RoutingSchema
  cases: {
    name: string
    answers: Record<string, unknown>
    route: string[]
    kept: Record<string, unknown>
    valid: boolean
  }[]
}

test.group('Branching form submissions', () => {
  for (const fixture of fixtures.cases)
    test(fixture.name, ({ assert }) => {
      assert.deepEqual(validateFormRouting(fixtures.schema), [])
      assert.deepEqual(formRoute(fixtures.schema, fixture.answers), fixture.route)
      const result = validateCustomFormSubmission(fixtures.schema, fixture.answers)
      assert.equal(result.valid, fixture.valid)
      if (result.valid) assert.deepEqual(result.data, fixture.kept)
    })
  test('keeps generated legacy IDs distinct from stored IDs', ({ assert }) => {
    const legacy = {
      fields: [
        { section_name: 'First', fields: [] },
        { id: 'legacy_section_0', section_name: 'Second', fields: [] },
      ],
    }
    assert.deepEqual(validateFormRouting(legacy), [])
    assert.deepEqual(formRoute(legacy, {}), ['legacy_section_0_', 'legacy_section_0'])
    assert.deepEqual(validateCustomFormSubmission(legacy, {}), { valid: true, data: {} })
  })
  test('rejects malformed navigation without throwing', ({ assert }) => {
    for (const navigation of [
      null,
      {},
      { defaultTarget: null },
      { defaultTarget: { type: 'section', sectionId: 'choice' } },
      { defaultTarget: { type: 'next' }, routes: [null] },
    ]) {
      const schema = structuredClone(fixtures.schema)
      Object.assign(schema.fields[1], { navigation })
      assert.isFalse(validateCustomFormSubmission(schema, { track: 'finish' }).valid)
    }
  })
  test('does not validate or persist a forged answer for an unreachable section', ({ assert }) => {
    const result = validateCustomFormSubmission(fixtures.schema, {
      track: 'finish',
      reason: { arbitrary: 'payload' },
    })
    assert.isTrue(result.valid)
    if (result.valid) assert.deepEqual(result.data, { track: 'finish' })
  })
  test('evaluates multiple branching sections and prunes both skipped destinations', ({
    assert,
  }) => {
    const schema = {
      version: 2,
      fields: [
        {
          id: 'first',
          section_name: 'Pertama',
          fields: [
            {
              key: 'first',
              label: 'Jalur pertama',
              type: 'radio',
              required: true,
              options: [
                { label: 'Lanjut', value: 'next' },
                { label: 'Selesai', value: 'done' },
              ],
            },
          ],
          navigation: {
            questionKey: 'first',
            defaultTarget: { type: 'submit' },
            routes: [{ optionValue: 'next', target: { type: 'section', sectionId: 'second' } }],
          },
        },
        {
          id: 'skipped',
          section_name: 'Dilewati',
          fields: [
            { key: 'skipped', label: 'Wajib jika dikunjungi', type: 'text', required: true },
          ],
        },
        {
          id: 'second',
          section_name: 'Kedua',
          fields: [
            {
              key: 'second',
              label: 'Jalur kedua',
              type: 'select',
              required: true,
              options: [
                { label: 'Lanjut', value: 'next' },
                { label: 'Selesai', value: 'done' },
              ],
            },
          ],
          navigation: {
            questionKey: 'second',
            defaultTarget: { type: 'next' },
            routes: [{ optionValue: 'done', target: { type: 'submit' } }],
          },
        },
        {
          id: 'last',
          section_name: 'Terakhir',
          fields: [{ key: 'last', label: 'Catatan', type: 'text', required: true }],
        },
      ],
    }
    assert.deepEqual(validateFormRouting(schema as RoutingSchema), [])
    assert.deepEqual(formRoute(schema as RoutingSchema, { first: 'next', second: 'next' }), [
      'first',
      'second',
      'last',
    ])
    const result = validateCustomFormSubmission(schema, {
      first: 'next',
      second: 'done',
      skipped: 'stale',
      last: 'stale',
    })
    assert.deepEqual(result, { valid: true, data: { first: 'next', second: 'done' } })
    assert.isFalse(validateCustomFormSubmission(schema, { first: 'next', second: 'next' }).valid)
  })
})
