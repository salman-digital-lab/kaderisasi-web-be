import vine from '@vinejs/vine'

export const activityRegistrationValidator = vine.compile(
  vine.object({
    questionnaire_answer: vine.object({}).allowUnknownProperties(),
  })
)
