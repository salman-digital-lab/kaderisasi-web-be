import vine from '@vinejs/vine'

export const storeRuangCurhatValidator = vine.compile(
  vine.object({
    problem_ownership: vine.number(),
    owner_name: vine.string().optional(),
    problem_category: vine.string(),
    problem_description: vine.string(),
    handling_technic: vine.string(),
    counselor_gender: vine.string(),
  })
)
