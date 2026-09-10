import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { isActivityRegistrationOpen } from '#services/activity_registration_service'

test('activity registration requires publication, explicit opening, and a current date window', ({
  assert,
}) => {
  const now = DateTime.fromISO('2026-09-10T23:59:00', { zone: 'Asia/Jakarta' })
  const activity = {
    isPublished: true,
    isRegistrationOpen: true,
    registrationStart: DateTime.fromISO('2026-09-10'),
    registrationEnd: DateTime.fromISO('2026-09-10'),
  }
  assert.isTrue(isActivityRegistrationOpen(activity, now))
  assert.isFalse(isActivityRegistrationOpen({ ...activity, isPublished: false }, now))
  assert.isFalse(isActivityRegistrationOpen({ ...activity, isRegistrationOpen: false }, now))
  assert.isFalse(isActivityRegistrationOpen({ ...activity, registrationStart: null }, now))
  assert.isFalse(isActivityRegistrationOpen(activity, now.plus({ days: 1 })))
  assert.isFalse(isActivityRegistrationOpen(activity, now.minus({ days: 1 })))
})
