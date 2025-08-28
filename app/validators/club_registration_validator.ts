import vine from '@vinejs/vine'

export const clubRegistrationValidator = vine.compile(
  vine.object({
    additional_data: vine.record(vine.any()).optional(),
  })
)

export const updateClubRegistrationValidator = vine.compile(
  vine.object({
    additional_data: vine.record(vine.any()).optional(),
  })
)
