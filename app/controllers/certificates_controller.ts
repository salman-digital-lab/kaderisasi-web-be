import type { HttpContext } from '@adonisjs/core/http'
import {
  getOwnerCertificateByCode,
  getOwnerCertificateByRegistration,
  getOwnerRegistrationCertificateState,
  getPublicCertificateByCode,
  verifyCertificateByCode,
  type CertificateErrorType,
} from '#services/certificate_service'

function respondWithCertificateError(
  response: HttpContext['response'],
  error: CertificateErrorType
) {
  if (error === 'FORBIDDEN') {
    return response.forbidden({ message: 'FORBIDDEN' })
  }

  if (error === 'CERTIFICATE_NOT_ISSUED') {
    return response.conflict({ message: 'CERTIFICATE_NOT_ISSUED' })
  }

  if (error === 'CERTIFICATE_REVOKED') {
    return response.status(410).json({ message: 'CERTIFICATE_REVOKED' })
  }

  if (error === 'REGISTRATION_NOT_FOUND') {
    return response.notFound({ message: 'REGISTRATION_NOT_FOUND' })
  }

  return response.notFound({ message: 'CERTIFICATE_NOT_FOUND' })
}

function parsePositiveId(rawId: string): number | null {
  if (!/^[1-9][0-9]*$/.test(rawId)) {
    return null
  }

  const id = Number(rawId)
  return Number.isSafeInteger(id) ? id : null
}

export default class CertificatesController {
  async showByCode({ params, response }: HttpContext) {
    response.header('Cache-Control', 'no-store, private')

    try {
      const result = await getPublicCertificateByCode(params.code)

      if (!result.success) {
        return respondWithCertificateError(response, result.error)
      }

      return response.ok({ message: 'GET_DATA_SUCCESS', data: result.data })
    } catch {
      return response.internalServerError({ message: 'GENERAL_ERROR' })
    }
  }

  async verify({ params, response }: HttpContext) {
    response.header('Cache-Control', 'no-store, private')

    try {
      const result = await verifyCertificateByCode(params.code)

      if (!result.success) {
        return response.notFound({
          message: 'CERTIFICATE_NOT_FOUND',
          data: { valid: false, state: 'not_found' },
        })
      }

      return response.ok({
        message: 'CERTIFICATE_VERIFIED',
        data: result.data,
      })
    } catch {
      return response.internalServerError({ message: 'GENERAL_ERROR' })
    }
  }

  async registrationState({ params, response, auth }: HttpContext) {
    response.header('Cache-Control', 'no-store, private')

    try {
      const registrationId = parsePositiveId(params.registrationId)

      if (!registrationId) {
        return response.badRequest({ message: 'INVALID_REGISTRATION_ID' })
      }

      const user = auth.getUserOrFail()
      const result = await getOwnerRegistrationCertificateState(registrationId, user.id)

      if (!result.success) {
        return respondWithCertificateError(response, result.error)
      }

      return response.ok({ message: 'GET_DATA_SUCCESS', data: result.data })
    } catch {
      return response.internalServerError({ message: 'GENERAL_ERROR' })
    }
  }

  async downloadByCode({ params, response, auth }: HttpContext) {
    response.header('Cache-Control', 'no-store, private')

    try {
      const user = auth.getUserOrFail()
      const result = await getOwnerCertificateByCode(params.code, user.id)

      if (!result.success) {
        return respondWithCertificateError(response, result.error)
      }

      return response.ok({ message: 'CERTIFICATE_DOWNLOAD_READY', data: result.data })
    } catch {
      return response.internalServerError({ message: 'GENERAL_ERROR' })
    }
  }

  /**
   * Compatibility endpoint for the existing registration-based download action.
   * It never rebuilds certificate data and only returns a persisted, active issuance.
   */
  async generateSingle({ params, response, auth }: HttpContext) {
    response.header('Cache-Control', 'no-store, private')

    try {
      const registrationId = parsePositiveId(params.id)

      if (!registrationId) {
        return response.badRequest({ message: 'INVALID_REGISTRATION_ID' })
      }

      const user = auth.getUserOrFail()
      const result = await getOwnerCertificateByRegistration(registrationId, user.id)

      if (!result.success) {
        return respondWithCertificateError(response, result.error)
      }

      return response.ok({ message: 'CERTIFICATE_DOWNLOAD_READY', data: result.data })
    } catch {
      return response.internalServerError({ message: 'GENERAL_ERROR' })
    }
  }
}
