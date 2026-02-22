import { HttpContext } from '@adonisjs/core/http'
import Activity from '#models/activity'
import ActivityRegistration from '#models/activity_registration'
import CertificateTemplate from '#models/certificate_template'

async function buildCertificateResponse(registrationId: number) {
  const registration = await ActivityRegistration.query()
    .where('id', registrationId)
    .where('status', 'LULUS KEGIATAN')
    .preload('publicUser', (query) => {
      query.preload('profile', (profileQuery) => {
        profileQuery.preload('university')
      })
    })
    .first()

  if (!registration) return { error: 'REGISTRATION_NOT_FOUND' as const }

  const activity = await Activity.find(registration.activityId)
  if (!activity) return { error: 'ACTIVITY_NOT_FOUND' as const }

  const templateId = activity.additionalConfig?.certificate_template_id
  if (!templateId) return { error: 'NO_CERTIFICATE_TEMPLATE' as const }

  const template = await CertificateTemplate.find(templateId)
  if (!template) return { error: 'CERTIFICATE_TEMPLATE_NOT_FOUND' as const }

  const profile = registration.publicUser?.profile

  return {
    data: {
      activity: {
        id: activity.id,
        name: activity.name,
        activity_start: activity.activityStart?.toISO(),
      },
      template: {
        id: template.id,
        name: template.name,
        background_image: template.backgroundImage,
        template_data: template.templateData,
      },
      participant: {
        registration_id: registration.id,
        user_id: registration.userId,
        name: profile?.name || registration.publicUser?.email || 'Unknown',
        email: registration.publicUser?.email || '',
        university: profile?.university?.name || '',
        activity_name: activity.name,
        activity_date: activity.activityStart
          ? activity.activityStart.toFormat('dd MMMM yyyy')
          : '',
      },
    },
  }
}

export default class CertificatesController {
  // Public — no auth required, anyone with the registration ID can view
  async show({ params, response }: HttpContext) {
    try {
      const registrationId = parseInt(params.id, 10)
      if (isNaN(registrationId) || registrationId <= 0) {
        return response.badRequest({ message: 'INVALID_REGISTRATION_ID' })
      }

      const result = await buildCertificateResponse(registrationId)

      if ('error' in result) {
        const status =
          result.error === 'NO_CERTIFICATE_TEMPLATE' ? 'badRequest' : 'notFound'
        return response[status]({ message: result.error })
      }

      return response.ok({ message: 'CERTIFICATE_DATA_GENERATED', data: result.data })
    } catch (error) {
      return response.internalServerError({ message: 'GENERAL_ERROR', error: error.message })
    }
  }

  // Authenticated — user must own the registration (used for "download" action)
  async generateSingle({ params, response, auth }: HttpContext) {
    try {
      const userId = auth.user?.id
      const registrationId = parseInt(params.id, 10)
      if (isNaN(registrationId) || registrationId <= 0) {
        return response.badRequest({ message: 'INVALID_REGISTRATION_ID' })
      }

      // Verify ownership before returning data
      const owns = await ActivityRegistration.query()
        .where('id', registrationId)
        .where('user_id', userId!)
        .first()

      if (!owns) {
        return response.forbidden({ message: 'FORBIDDEN' })
      }

      const result = await buildCertificateResponse(registrationId)

      if ('error' in result) {
        const status =
          result.error === 'NO_CERTIFICATE_TEMPLATE' ? 'badRequest' : 'notFound'
        return response[status]({ message: result.error })
      }

      return response.ok({ message: 'CERTIFICATE_DATA_GENERATED', data: result.data })
    } catch (error) {
      return response.internalServerError({ message: 'GENERAL_ERROR', error: error.message })
    }
  }
}
