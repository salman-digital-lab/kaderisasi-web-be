import { test } from '@japa/runner'
import Profile from '#models/profile'
import { updateProfileValidator } from '#validators/profile_validator'
import { selfSubmitValidator } from '#validators/member_validator'
import {
  normalizeEducationHistory,
  normalizeWorkHistory,
} from '../../app/helpers/education_history.js'

test.group('Profile history compatibility', () => {
  test('preserves school and diploma degrees in profile and guest submissions', async ({
    assert,
  }) => {
    for (const degree of ['high_school', 'diploma']) {
      for (const validator of [updateProfileValidator, selfSubmitValidator]) {
        const result = await validator.validate({
          name: 'Fixture',
          education_history: [{ degree, institution: 'School', faculty: '' }],
        })
        assert.equal(normalizeEducationHistory(result.education_history)[0].degree, degree)
      }
    }
  })
  test('reads legacy JSON strings, nullable years and invalid siblings', ({ assert }) => {
    const education = JSON.stringify([null, { institution: ' ITB ', intake_year: '2017' }])
    assert.deepEqual(normalizeEducationHistory(education), [
      {
        degree: undefined,
        institution: 'ITB',
        faculty: '',
        major: '',
        intake_year: 2017,
      },
    ])
    assert.deepEqual(
      normalizeWorkHistory([
        null,
        { job_title: 'Engineer', company: 'Company', start_year: '2021', end_year: null },
      ]),
      [
        {
          job_title: 'Engineer',
          company: 'Company',
          start_year: 2021,
          end_year: undefined,
        },
      ]
    )
    Profile.boot()
    assert.deepEqual(
      Profile.$getColumn('educationHistory')?.consume?.(
        education,
        'educationHistory',
        new Profile()
      ),
      normalizeEducationHistory(education)
    )
    for (const value of [null, {}, 'invalid', 5]) {
      assert.deepEqual(normalizeEducationHistory(value), [])
      assert.deepEqual(normalizeWorkHistory(value), [])
    }
  })
  test('profile updates and self submission share the same partial history contract', async ({
    assert,
  }) => {
    for (const validator of [updateProfileValidator, selfSubmitValidator]) {
      const result = await validator.validate({
        name: 'Fixture',
        education_history: [{ major: 'Physics', intake_year: null }],
        work_history: [
          { job_title: ' Engineer ', company: ' Company ', start_year: '2021', end_year: '' },
        ],
      })
      assert.deepEqual(result.education_history, [{ major: 'Physics' }])
      assert.deepEqual(result.work_history, [
        { job_title: 'Engineer', company: 'Company', start_year: 2021 },
      ])
      for (const history of [
        [{ job_title: 'Engineer', company: 'Company', start_year: 2025, end_year: 2021 }],
        [{ job_title: 'Engineer', company: 'Company', start_year: 2021.5 }],
        [{ job_title: ' ', company: 'Company' }],
      ]) {
        await assert.rejects(() => validator.validate({ name: 'Fixture', work_history: history }))
      }
    }
  })
  test('omission preserves histories while an empty array clears them', async ({ assert }) => {
    assert.deepEqual(await updateProfileValidator.validate({ name: 'Fixture' }), {
      name: 'Fixture',
    })
    assert.deepEqual(
      await updateProfileValidator.validate({ education_history: [], work_history: [] }),
      { education_history: [], work_history: [] }
    )
  })
})
