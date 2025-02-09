import vine from '@vinejs/vine'

export const achievementValidator = vine.compile(
  vine.object({
    name: vine.string(),
    description: vine.string(),
    type: vine.number().withoutDecimals(),
    proof: vine.file({
      size: '5mb',
      extnames: ['jpg', 'png', 'jpeg', 'pdf', 'doc', 'docx', 'PNG', 'JPG', 'JPEG', 'PDF', 'DOC', 'DOCX'],
    }),
  })
) 