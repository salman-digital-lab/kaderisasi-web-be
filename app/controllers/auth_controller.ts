import { HttpContext } from '@adonisjs/core/http'
import database from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import mail from '@adonisjs/mail/services/main'
import encryption from '@adonisjs/core/services/encryption'

import {
  registerValidator,
  loginValidator,
  resetPasswordValidator,
} from '#validators/auth_validator'
import PublicUser from '#models/public_user'
import Profile from '#models/profile'
import env from '#start/env'
import { errors } from '@vinejs/vine'
import LegacyMember from '#models/legacy_member'

import { createHash } from 'crypto'

enum USER_LEVEL_ENUM {
  JAMAAH,
  AKTIVIS = 3,
  KADER = 6,
  KADER_LANJUT = 10,
}

const getLevel = (ssc?: number, lmd?: number, spectra?: number) => {
  if (ssc !== null && lmd !== null && spectra !== null) {
    return USER_LEVEL_ENUM.KADER_LANJUT
  }
  if (ssc !== null && lmd !== null) {
    return USER_LEVEL_ENUM.KADER
  }

  if (ssc !== null) {
    return USER_LEVEL_ENUM.AKTIVIS
  }
  return USER_LEVEL_ENUM.JAMAAH
}

const generateBadges = (ssc?: number, lmd?: number, spectra?: number) => {
  const badges = []
  if (ssc !== null) {
    badges.push('SSC-' + ssc)
  }
  if (lmd !== null) {
    badges.push('LMD-' + lmd)
  }
  if (spectra !== null) {
    badges.push('SPECTRA-' + spectra)
  }
  return badges
}

export default class AuthController {
  async register({ request, response }: HttpContext) {
    try {
      const payload = await registerValidator.validate(request.all())
      const exist = await PublicUser.findBy('email', payload.email)
      const legacyMember = await LegacyMember.findBy('email', payload.email)

      if (exist || legacyMember) {
        return response.conflict({
          message: 'EMAIL_ALREADY_REGISTERED',
        })
      }

      await database.transaction(async (trx) => {
        const user = new PublicUser()
        user.email = payload.email
        user.password = payload.password

        user.useTransaction(trx)
        await user.save()

        // @ts-ignore cannot find a solution, it is error when using this monorepo
        await user.related('profile').create({
          name: payload.fullname,
        })

        return response.ok({
          message: 'REGISTER_SUCCESS',
          data: user,
        })
      })
    } catch (error) {
      if (error instanceof errors.E_VALIDATION_ERROR) {
        return response.internalServerError({
          message: error.messages[0]?.message || 'GENERAL_ERROR',
          error: error.messages,
        })
      }
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async login({ request, response, auth }: HttpContext) {
    try {
      const payload = await loginValidator.validate(request.all())
      const email: string = payload.email
      const password: string = payload.password
      const user = await PublicUser.query().where('email', email).first()
      const legacyMember = await LegacyMember.findBy('email', email)

      if (!user && !legacyMember) {
        return response.notFound({
          message: 'USER_NOT_FOUND',
        })
      }

      if (user) {
        if (!(await hash.verify(user.password, password))) {
          return response.unauthorized({
            message: 'WRONG_PASSWORD',
          })
        }

        const data = await Profile.findBy('user_id', user.id)
        const token = await auth.use('jwt').generate(user)

        return response.ok({
          message: 'LOGIN_SUCCESS',
          data: { user, data, token },
        })
      }

      if (legacyMember) {
        const hashedPassword = createHash('md5').update(password).digest('hex')
        if (hashedPassword !== legacyMember.password) {
          return response.unauthorized({
            message: 'WRONG_PASSWORD',
          })
        }

        await database.transaction(async (trx) => {
          const user = new PublicUser()
          user.email = payload.email
          user.password = payload.password

          user.useTransaction(trx)
          await user.save()

          // @ts-ignore cannot find a solution, it is error when using this monorepo
          await user.related('profile').create({
            name: legacyMember.name,
            gender: legacyMember.gender,
            whatsapp: legacyMember.phone,
            line: legacyMember.line_id,
            intakeYear: legacyMember.intake_year,
            level: getLevel(legacyMember.ssc, legacyMember.lmd, legacyMember.spectra),
            // @ts-ignore
            badges: JSON.stringify(
              generateBadges(legacyMember.ssc, legacyMember.lmd, legacyMember.spectra)
            ),
          })
        })

        const newUserAfterLegacyMember = await PublicUser.query().where('email', email).first()
        if (!newUserAfterLegacyMember) {
          return response.notFound({
            message: 'USER_NOT_FOUND',
          })
        }

        const data = await Profile.findBy('user_id', newUserAfterLegacyMember.id)
        const token = await auth.use('jwt').generate(newUserAfterLegacyMember)

        return response.ok({
          message: 'LOGIN_SUCCESS',
          data: { user: newUserAfterLegacyMember, data, token },
        })
      }
    } catch (error) {
      if (error instanceof errors.E_VALIDATION_ERROR) {
        return response.internalServerError({
          message: error.messages[0]?.message || 'GENERAL_ERROR',
          error: error.messages,
        })
      }
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async sendPasswordRecovery({ request, response }: HttpContext) {
    try {
      const email: string = request.all().email
      const user = await PublicUser.findBy('email', email)

      if (!user) {
        return response.notFound({
          message: 'EMAIL_NOT_FOUND',
        })
      }

      const encrypted = encryption.encrypt(email, '30 minutes')
      const resetUrl: string = env.get('RESET_PASSWORD_URL') + '?token=' + encrypted
      const fromAddress: string = env.get('MAIL_FROM')

      await mail.send((message) => {
        message
          .to(user.email)
          .from(fromAddress, 'Kaderisasi Masjid Salman ITB')
          .subject('Reset kata sandi akun Kaderisasi Masjid Salman ITB')
          .htmlView('emails/reset_password', { resetUrl })
      })

      return response.ok({
        message: 'SEND_EMAIL_SUCCESS',
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async resetPassword({ request, response }: HttpContext) {
    const token: string = request.qs().token
    try {
      const { password } = await resetPasswordValidator.validate(request.all())
      const decrypted = encryption.decrypt(token)
      const user = await PublicUser.findBy('email', decrypted)

      if (!user) {
        return response.unauthorized({
          message: 'INVALID_TOKEN',
        })
      }

      await user.merge({ password: password }).save()

      return response.ok({
        message: 'RESET_PASSWORD_SUCCESS',
      })
    } catch (error) {
      if (error instanceof errors.E_VALIDATION_ERROR) {
        return response.internalServerError({
          message: error.messages[0]?.message || 'GENERAL_ERROR',
          error: error.messages,
        })
      }
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async logout({ response }: HttpContext) {
    try {
      return response.ok({
        message: 'LOGOUT_SUCCESS',
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }
}
