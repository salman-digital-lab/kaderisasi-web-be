import { test } from '@japa/runner'
import { courseIdentifier, coursePagination } from '#services/course_service'
import { courseCompletionValidator } from '#validators/course_validator'

test.group('Course request boundaries', () => {
  test('identifiers reject aliases, overflow, and SQL-shaped input', ({ assert }) => {
    for (const value of ['0', '-1', '1.5', '1e2', '2147483648', '1 OR 1=1', '01'])
      assert.throws(() => courseIdentifier(value), /COURSE_NOT_FOUND/)
    assert.equal(courseIdentifier('42'), 42)
  })
  test('pagination is bounded and search is normalized', ({ assert }) => {
    assert.deepEqual(coursePagination({ page: '-1', per_page: '999', search: '  lesson  ' }), {
      page: 1,
      perPage: 100,
      search: 'lesson',
    })
    assert.equal(coursePagination({ search: 'x'.repeat(500) }).search.length, 200)
  })
  test('completion requires an explicit boolean', async ({ assert }) => {
    assert.deepEqual(await courseCompletionValidator.validate({ completed: false }), {
      completed: false,
    })
    for (const completed of [undefined, null, 'false', 0, 1])
      await assert.rejects(() => courseCompletionValidator.validate({ completed }))
  })
})
