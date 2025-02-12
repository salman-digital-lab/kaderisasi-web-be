import vine from '@vinejs/vine'

export const achievementValidator = vine.compile(
  vine.object({
    name: vine.string(),
    description: vine.string(),
    achievement_date: vine.string(),
    type: vine.number().withoutDecimals(),
    proof: vine.file({
      size: '5mb',
      extnames: ['jpg', 'png', 'jpeg', 'pdf', 'doc', 'docx', 'PNG', 'JPG', 'JPEG', 'PDF', 'DOC', 'DOCX'],
    }),
  })
)

export const updateAchievementValidator = vine.compile(
  vine.object({
    name: vine.string().optional(),
    description: vine.string().optional(),
    achievement_date: vine.string().optional(),
    type: vine.number().withoutDecimals().optional(),
    proof: vine.file({
      size: '5mb',
      extnames: ['jpg', 'png', 'jpeg', 'pdf', 'doc', 'docx', 'PNG', 'JPG', 'JPEG', 'PDF', 'DOC', 'DOCX'],
    }).optional(),
  })
) 