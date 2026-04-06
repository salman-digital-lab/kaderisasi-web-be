import vine from '@vinejs/vine'

export const updateProfileValidator = vine.compile(
  vine.object({
    name: vine.string().optional(),
    gender: vine.enum(['M', 'F']).optional(),
    whatsapp: vine.string().optional(),
    line: vine.string().optional(),
    instagram: vine.string().optional(),
    province_id: vine.number().optional(),
    city_id: vine.number().optional(),
    linkedin: vine.string().optional(),
    personal_id: vine.string().optional(),
    tiktok: vine.string().optional(),
    birth_date: vine.string().optional(),

    origin_province_id: vine.number().optional(),
    origin_city_id: vine.number().optional(),
    country: vine.string().optional(),
    education_history: vine
      .array(
        vine.object({
          degree: vine.enum(['bachelor', 'master', 'doctoral']),
          institution: vine.string(),
          faculty: vine.string(),
          major: vine.string(),
          intake_year: vine.number(),
        })
      )
      .optional(),
    work_history: vine
      .array(
        vine.object({
          job_title: vine.string(),
          company: vine.string(),
          start_year: vine.number().optional(),
          end_year: vine.number().optional(),
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
        kaderisasi_path: vine
          .object({
            ssc: vine.number().nullable().optional(),
            lmd: vine.number().nullable().optional(),
            spectra: vine.number().nullable().optional(),
          })
          .optional(),
        // alumni_regional_assignment is NOT accepted here — admin/hub only
      })
      .optional(),
  })
)

export const imageValidator = vine.compile(
  vine.object({
    file: vine.file({
      size: '2mb',
      extnames: ['jpg', 'png', 'jpeg', 'PNG', 'JPG', 'JPEG'],
    }),
  })
)
