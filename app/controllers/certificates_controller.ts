import { HttpContext } from '@adonisjs/core/http'
import {
  buildCertificateData,
  getIssuedCertificateByCode,
  validateRegistrationOwnership,
} from '#services/certificate_service'

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'UNKNOWN_ERROR'
}

export default class CertificatesController {
  async showByCode({ params, response }: HttpContext) {
    try {
      const result = await getIssuedCertificateByCode(params.code)

      if (!result.success) {
        return response.notFound({ message: result.error })
      }

      return response.ok({ message: 'GET_DATA_SUCCESS', data: result.data })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: getErrorMessage(error),
      })
    }
  }

  async verify({ params, response }: HttpContext) {
    try {
      const result = await getIssuedCertificateByCode(params.code)

      if (!result.success) {
        return response.notFound({
          message: result.error,
          data: { valid: false },
        })
      }

      return response.ok({
        message: 'CERTIFICATE_VERIFIED',
        data: {
          valid: !result.data.certificate?.revoked_at,
          certificate: result.data.certificate,
          participant: result.data.participant,
          activity: result.data.activity,
        },
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: getErrorMessage(error),
      })
    }
  }

  async show({ params, response }: HttpContext) {
    try {
      const registrationId = Number.parseInt(params.id, 10)
      if (Number.isNaN(registrationId) || registrationId <= 0) {
        return response.badRequest({ message: 'INVALID_REGISTRATION_ID' })
      }

      const result = await buildCertificateData(registrationId)

      if (!result.success) {
        const status = result.error === 'NO_CERTIFICATE_TEMPLATE' ? 'badRequest' : 'notFound'
        return response[status]({ message: result.error })
      }

      return response.ok({ message: 'CERTIFICATE_DATA_GENERATED', data: result.data })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: getErrorMessage(error),
      })
    }
  }

  async generateSingle({ params, response, auth }: HttpContext) {
    try {
      const userId = auth.user?.id
      const registrationId = Number.parseInt(params.id, 10)

      if (Number.isNaN(registrationId) || registrationId <= 0) {
        return response.badRequest({ message: 'INVALID_REGISTRATION_ID' })
      }

      if (!userId) {
        return response.unauthorized({ message: 'UNAUTHORIZED' })
      }

      const isOwner = await validateRegistrationOwnership(registrationId, userId)

      if (!isOwner) {
        return response.forbidden({ message: 'FORBIDDEN' })
      }

      const result = await buildCertificateData(registrationId)

      if (!result.success) {
        const status = result.error === 'NO_CERTIFICATE_TEMPLATE' ? 'badRequest' : 'notFound'
        return response[status]({ message: result.error })
      }

      return response.ok({ message: 'CERTIFICATE_DATA_GENERATED', data: result.data })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: getErrorMessage(error),
      })
    }
  }
}
