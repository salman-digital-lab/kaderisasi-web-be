import vine from '@vinejs/vine'

export const courseCompletionValidator = vine.compile(
  vine.object({ completed: vine.boolean({ strict: true }) })
)
