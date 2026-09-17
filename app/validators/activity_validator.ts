import vine from '@vinejs/vine'

export const activityRegistrationValidator = vine.compile(
  vine.object({
    session_token: vine
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    questionnaire_answer: vine.object({}).allowUnknownProperties(),
  })
)

export const guestActivityRegistrationValidator = vine.compile(
  vine.object({
    session_token: vine
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    guest_data: vine
      .object({
        name: vine.string().trim().minLength(1),
        email: vine.string().email(),
      })
      .allowUnknownProperties(),
    questionnaire_answer: vine.object({}).allowUnknownProperties(),
  })
)
