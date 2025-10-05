import { HttpContext } from '@adonisjs/core/http'
import CustomForm from '#models/custom_form'

export default class CustomFormsController {
  async getByFeature({ request, response }: HttpContext) {
    try {
      const featureType = request.qs().feature_type
      const featureId = request.qs().feature_id

      if (!featureType) {
        return response.badRequest({
          message: 'FEATURE_TYPE_REQUIRED',
        })
      }

      let customForm: CustomForm | null = null

      if (featureType === 'independent_form') {
        // For independent forms, we need to get by ID instead of feature_id
        // Feature_id in this case will be the custom form's ID
        if (!featureId) {
          return response.badRequest({
            message: 'FORM_ID_REQUIRED',
          })
        }
        
        customForm = await CustomForm.query()
          .where('id', featureId)
          .where('feature_type', 'independent_form')
          .first()
      } else {
        // For activity_registration and club_registration
        if (!featureId) {
          return response.badRequest({
            message: 'FEATURE_ID_REQUIRED',
          })
        }
        
        customForm = await CustomForm.query()
          .where('feature_type', featureType)
          .where('feature_id', featureId)
          .first()
      }

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
      const { feature_type, feature_id, custom_form_data } = request.body()

      if (!feature_type) {
        return response.badRequest({
          message: 'FEATURE_TYPE_REQUIRED',
        })
      }

      // For activity_registration and club_registration, feature_id is required
      if (
        (feature_type === 'activity_registration' || feature_type === 'club_registration') &&
        !feature_id
      ) {
        return response.badRequest({
          message: 'FEATURE_ID_REQUIRED',
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
        // Profile data is already saved separately, only save custom form data
        const registration = await ActivityRegistration.create({
          userId: user.id,
          activityId: feature_id,
          status: 'TERDAFTAR',
          questionnaireAnswer: custom_form_data,
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
        // Profile data is already saved separately, only save custom form data
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
      } else if (feature_type === 'independent_form') {
        // For independent_form, just return success without saving to database
        return response.ok({
          message: 'INDEPENDENT_FORM_SUBMIT_SUCCESS',
          data: {
            submitted_at: new Date().toISOString(),
            user_id: user.id,
          },
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
