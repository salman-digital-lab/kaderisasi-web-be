import { DateTime } from 'luxon'

type RegistrationState = {
  isPublished: boolean
  isRegistrationOpen: boolean
  registrationStart: DateTime | null
  registrationEnd: DateTime | null
}

export function isActivityRegistrationOpen(
  activity: RegistrationState,
  now: DateTime = DateTime.now()
): boolean {
  const today = now.setZone('Asia/Jakarta').toISODate()
  const start = activity.registrationStart?.toISODate()
  const end = activity.registrationEnd?.toISODate()
  return Boolean(
    activity.isPublished &&
      activity.isRegistrationOpen &&
      today &&
      start &&
      end &&
      start <= today &&
      today <= end
  )
}
