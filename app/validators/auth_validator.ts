import vine from '@vinejs/vine'

export const googleLoginValidator = vine.compile(
  vine.object({
    code: vine.string().minLength(1).maxLength(4096),
    codeVerifier: vine.string().minLength(43).maxLength(128),
    nonce: vine.string().minLength(32).maxLength(128),
  })
)

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

export const checkEmailValidator = vine.compile(
  vine.object({
    email: vine.string().email(),
  })
)

export const resetPasswordValidator = vine.compile(
  vine.object({
    password: vine.string(),
  })
)
