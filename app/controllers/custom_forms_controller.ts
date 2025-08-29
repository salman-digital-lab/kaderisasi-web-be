import { HttpContext } from '@adonisjs/core/http'
import CustomForm from '#models/custom_form'

export default class CustomFormsController {
  async getByFeature({ request, response }: HttpContext) {
    try {
      const featureType = request.qs().feature_type
      const featureId = request.qs().feature_id

      if (!featureType || !featureId) {
        return response.badRequest({
          message: 'FEATURE_TYPE_AND_ID_REQUIRED',
        })
      }

      // Query database directly
      const customForm = await CustomForm.query()
        .where('feature_type', featureType)
        .where('feature_id', featureId)
        .first()

      if (!customForm) {
        return response.notFound({
          message: 'CUSTOM_FORM_NOT_FOUND',
        })
      }

      return response.ok({
        message: 'GET_DATA_SUCCESS',
        data: customForm,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async register({ request, response, auth }: HttpContext) {
    try {
      const { feature_type, feature_id, profile_data, custom_form_data } = request.body()

      if (!feature_type || !feature_id) {
        return response.badRequest({
          message: 'FEATURE_TYPE_AND_ID_REQUIRED',
        })
      }

      const user = auth.getUserOrFail()

      if (feature_type === 'activity_registration') {
        const ActivityRegistration = (await import('#models/activity_registration')).default

        // Check if already registered
        const existingRegistration = await ActivityRegistration.query()
          .where('user_id', user.id)
          .where('activity_id', feature_id)
          .first()

        if (existingRegistration) {
          return response.conflict({
            message: 'ALREADY_REGISTERED',
          })
        }

        // Create new registration
        const registration = await ActivityRegistration.create({
          userId: user.id,
          activityId: feature_id,
          status: 'TERDAFTAR',
          questionnaireAnswer: {
            profile_data,
            custom_form_data,
          },
        })

        return response.created({
          message: 'ACTIVITY_REGISTER_SUCCESS',
          data: registration,
        })
      } else if (feature_type === 'club_registration') {
        const ClubRegistration = (await import('#models/club_registration')).default

        // Check if already registered
        const existingRegistration = await ClubRegistration.query()
          .where('member_id', user.id)
          .where('club_id', feature_id)
          .first()

        if (existingRegistration) {
          return response.conflict({
            message: 'ALREADY_REGISTERED',
          })
        }

        // Create new registration
        // For club registration, only save custom_form_data, not profile_data
        const registration = await ClubRegistration.create({
          memberId: user.id,
          clubId: feature_id,
          status: 'PENDING',
          additionalData: custom_form_data,
        })

        return response.created({
          message: 'CLUB_REGISTER_SUCCESS',
          data: registration,
        })
      } else {
        return response.badRequest({
          message: 'INVALID_FEATURE_TYPE',
        })
      }
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }
}
