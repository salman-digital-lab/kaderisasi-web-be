import { test } from '@japa/runner'
import ActivityRegistration from '#models/activity_registration'
import { publishedActivityScore, type StoredScoringData } from '#services/activity_scoring'

function fixture(): StoredScoringData {
  return {
    schema_version: 1,
    published: {
      schema_version: 1,
      activity_id: 7,
      registration_id: 9,
      revision: 2,
      rubric: {
        groups: [
          {
            id: 'g',
            name: 'Karakter',
            criteria: [{ id: 'a', name: 'Amanah', maximum: 50, weight: 1 }],
          },
        ],
        grades: [{ label: 'A', minimum: 0 }],
        note: 'Catatan kegiatan',
      },
      draft: { note: 'Catatan terbit' },
      result: {
        complete: true,
        criteria: [{ criterion_id: 'a', score: 40, normalized: 80, grade: 'A' }],
        total: 80,
        grade: 'A',
      },
      published_at: '2026-09-13T00:00:00Z',
    },
  }
}
test.group('Activity scoring privacy', () => {
  test('returns only published owner fields', ({ assert }) => {
    const data = { ...fixture(), draft: { note: 'Private draft' }, updated_by: 123 }
    const result = publishedActivityScore(data, 9, 7)
    assert.equal(result?.note, 'Catatan terbit')
    assert.equal(result?.result.total, 80)
    assert.notInclude(JSON.stringify(result), 'Private draft')
    assert.notInclude(JSON.stringify(result), 'updated_by')
    assert.notInclude(JSON.stringify(result), 'registration_id')
  })
  test('hides unscored, withdrawn, mismatched, and unsupported results', ({ assert }) => {
    assert.isNull(publishedActivityScore(null, 9, 7))
    assert.isNull(publishedActivityScore({ schema_version: 1, published: null }, 9, 7))
    assert.isNull(publishedActivityScore(fixture(), 8, 7))
    assert.isNull(publishedActivityScore(fixture(), 9, 8))
    assert.isNull(publishedActivityScore({ ...fixture(), schema_version: 2 }, 9, 7))
  })
  test('general Lucid serialization never exposes scoring JSON', ({ assert }) => {
    const registration = new ActivityRegistration()
    registration.id = 9
    registration.scoringData = fixture()
    assert.notInclude(JSON.stringify(registration.serialize()), 'scoring')
    assert.notInclude(JSON.stringify(registration.serialize()), 'Catatan terbit')
  })
})
