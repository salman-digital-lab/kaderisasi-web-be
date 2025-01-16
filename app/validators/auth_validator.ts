import vine from '@vinejs/vine'

export const registerValidator = vine.compile(
  vine.object({
    fullname: vine.string(),
    email: vine.string().email(),
    password: vine.string(),
  })
)

export const loginValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
    password: vine.string(),
  })
)

export const resetPasswordValidator = vine.compile(
  vine.object({
    password: vine.string(),
  })
)
