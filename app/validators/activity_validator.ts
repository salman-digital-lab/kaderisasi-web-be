import vine from '@vinejs/vine'

export const guestActivityRegistrationValidator = vine.compile(
  vine.object({
    guest_data: vine
      .object({
        name: vine.string().trim().minLength(1),
        email: vine.string().email(),
      })
      .allowUnknownProperties(),
    questionnaire_answer: vine.object({}).allowUnknownProperties(),
  })
)
