import { HttpContext } from '@adonisjs/core/http'
import { buildCertificateData, validateRegistrationOwnership } from '#services/certificate_service'

export default class CertificatesController {
  async show({ params, response }: HttpContext) {
    try {
      const registrationId = parseInt(params.id, 10)
      if (isNaN(registrationId) || registrationId <= 0) {
        return response.badRequest({ message: 'INVALID_REGISTRATION_ID' })
      }

      const result = await buildCertificateData(registrationId)

      if (!result.success) {
        const status = result.error === 'NO_CERTIFICATE_TEMPLATE' ? 'badRequest' : 'notFound'
        return response[status]({ message: result.error })
      }

      return response.ok({ message: 'CERTIFICATE_DATA_GENERATED', data: result.data })
    } catch (error: any) {
      return response.internalServerError({ message: 'GENERAL_ERROR', error: error.message })
    }
  }

  async generateSingle({ params, response, auth }: HttpContext) {
    try {
      const userId = auth.user?.id
      const registrationId = parseInt(params.id, 10)

      if (isNaN(registrationId) || registrationId <= 0) {
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
    } catch (error: any) {
      return response.internalServerError({ message: 'GENERAL_ERROR', error: error.message })
    }
  }
}
