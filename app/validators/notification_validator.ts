import vine from '@vinejs/vine'

export const notificationListValidator = vine.compile(
  vine.object({
    cursor: vine.string().maxLength(500).optional(),
    unread: vine.enum(['true', 'false']).optional(),
  })
)
export const notificationReadAllValidator = vine.compile(
  vine.object({ cutoff: vine.string().maxLength(50) })
)
