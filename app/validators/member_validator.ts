import vine from '@vinejs/vine'

export const selfSubmitValidator = vine.compile(
  vine.object({
    name: vine.string(),
    gender: vine.enum(['M', 'F']).optional(),
    whatsapp: vine.string().optional(),
    instagram: vine.string().optional(),
    province_id: vine.number().optional(),
    city_id: vine.number().optional(),
    country: vine.string().optional(),
    birth_date: vine.string().optional(),
    origin_province_id: vine.number().optional(),
    origin_city_id: vine.number().optional(),
    education_history: vine
      .array(
        vine.object({
          degree: vine.enum(['bachelor', 'master', 'doctoral']),
          institution: vine.string(),
          major: vine.string(),
          intake_year: vine.number(),
        })
      )
      .optional(),
    work_history: vine
      .array(
        vine.object({
          job: vine.string(),
          organization: vine.string(),
          role: vine.string(),
          description: vine.string().optional(),
        })
      )
      .optional(),
    extra_data: vine
      .object({
        preferred_name: vine.string().optional(),
        salman_activity_history: vine.array(vine.string()).optional(),
        current_activity_focus: vine
          .array(
            vine.enum(['professional', 'academic', 'social', 'entrepreneur', 'politics', 'other'])
          )
          .optional(),
      })
      .optional(),
  })
)
