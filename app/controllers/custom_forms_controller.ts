import { HttpContext } from '@adonisjs/core/http'
import CustomForm from '#models/custom_form'
import Club from '#models/club'
import { isClubRegistrationOpen, isClubRegistrationUniqueViolation } from '#services/club_service'
import { validateCustomFormSubmission } from '#services/custom_form_submission_service'
import { sanitizeRichText } from '#services/rich_text_service'

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
          .where('is_active', true)
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
          .where('is_active', true)
          .orderBy('updated_at', 'desc')
          .orderBy('id', 'desc')
          .first()
      }

      if (!customForm) {
        return response.notFound({
          message: 'CUSTOM_FORM_NOT_FOUND',
        })
      }

      return response.ok({
        message: 'GET_DATA_SUCCESS',
        data: {
          ...customForm.toJSON(),
          post_submission_info: customForm.postSubmissionInfo
            ? sanitizeRichText(customForm.postSubmissionInfo)
            : customForm.postSubmissionInfo,
        },
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
        const { default: ActivityRegistration } = await import('#models/activity_registration')

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
        const { default: ClubRegistration } = await import('#models/club_registration')

        const club = await Club.find(feature_id)
        if (!club || !isClubRegistrationOpen(club)) {
          return response.badRequest({ message: 'REGISTRATION_CLOSED' })
        }

        const activeCustomForm = await CustomForm.query()
          .where('feature_type', 'club_registration')
          .where('feature_id', club.id)
          .where('is_active', true)
          .orderBy('updated_at', 'desc')
          .orderBy('id', 'desc')
          .first()

        if (!activeCustomForm) {
          return response.badRequest({ message: 'ACTIVE_CUSTOM_FORM_REQUIRED' })
        }

        const submission = validateCustomFormSubmission(
          activeCustomForm.formSchema,
          custom_form_data
        )

        if (!submission.valid) {
          return response.unprocessableEntity({
            message: 'INVALID_FORM_SUBMISSION',
            errors: submission.errors,
          })
        }

        // Check if already registered
        const existingRegistration = await ClubRegistration.query()
          .where('member_id', user.id)
          .where('club_id', club.id)
          .first()

        if (existingRegistration) {
          return response.conflict({
            message: 'ALREADY_REGISTERED',
          })
        }

        // Create new registration
        // Profile data is already saved separately, only save custom form data
        try {
          const registration = await ClubRegistration.create({
            memberId: user.id,
            clubId: club.id,
            status: 'PENDING',
            additionalData: submission.data,
          })

          return response.created({
            message: 'CLUB_REGISTER_SUCCESS',
            data: registration,
          })
        } catch (error) {
          if (isClubRegistrationUniqueViolation(error)) {
            return response.conflict({ message: 'ALREADY_REGISTERED' })
          }

          throw error
        }
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
