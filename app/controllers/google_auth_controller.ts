import type { HttpContext } from '@adonisjs/core/http'
import { errors } from '@vinejs/vine'
import env from '#start/env'
import Profile from '#models/profile'
import { googleLoginValidator } from '#validators/auth_validator'
import { GoogleLoginError, verifyGoogleCode } from '#services/google_identity_service'
import { resolveGoogleAccount } from '#services/google_account_service'

export default class GoogleAuthController {
  async login({ request, response, auth }: HttpContext): Promise<void> {
    response.header('Cache-Control', 'no-store')
    const clientId = env.get('GOOGLE_CLIENT_ID')
    const clientSecret = env.get('GOOGLE_CLIENT_SECRET')
    const redirectUri = env.get('GOOGLE_REDIRECT_URI')
    if (!clientId || !clientSecret || !redirectUri) {
      response.serviceUnavailable({ message: 'GOOGLE_LOGIN_UNAVAILABLE' })
      return
    }
    try {
      const input = await googleLoginValidator.validate(request.all())
      const identity = await verifyGoogleCode({ clientId, clientSecret, redirectUri }, input)
      const user = await resolveGoogleAccount(identity)
      const data = await Profile.findBy('user_id', user.id)
      const token = await auth.use('jwt').generate(user)
      response.ok({ message: 'LOGIN_SUCCESS', data: { user, data, token } })
    } catch (error: unknown) {
      if (error instanceof errors.E_VALIDATION_ERROR) {
        response.badRequest({ message: 'GOOGLE_LOGIN_FAILED' })
        return
      }
      response.unauthorized({
        message: error instanceof GoogleLoginError ? error.message : 'GOOGLE_LOGIN_FAILED',
      })
    }
  }
}
