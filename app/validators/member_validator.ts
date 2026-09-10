import vine from '@vinejs/vine'
import { educationHistorySchema, workHistorySchema } from '#validators/profile_history'

export const selfSubmitValidator = vine.compile(
  vine.object({
    name: vine.string(),
    gender: vine.enum(['M', 'F']).optional(),
    personal_id: vine.string().optional(),
    whatsapp: vine.string().optional(),
    line: vine.string().optional(),
    instagram: vine.string().optional(),
    tiktok: vine.string().optional(),
    linkedin: vine.string().optional(),
    province_id: vine.number().optional(),
    city_id: vine.number().optional(),
    country: vine.string().optional(),
    birth_date: vine.string().optional(),
    origin_province_id: vine.number().optional(),
    origin_city_id: vine.number().optional(),
    education_history: educationHistorySchema.clone(),
    work_history: workHistorySchema.clone(),
    extra_data: vine
      .object({
        preferred_name: vine.string().optional(),
        salman_activity_history: vine.array(vine.string()).optional(),
        current_activity_focus: vine
          .array(
            vine.enum(['professional', 'academic', 'social', 'entrepreneur', 'politics', 'other'])
          )
          .optional(),
        kaderisasi_path: vine
          .object({
            ssc: vine.number().nullable().optional(),
            lmd: vine.number().nullable().optional(),
            spectra: vine.number().nullable().optional(),
          })
          .optional(),
      })
      .optional(),
  })
)
