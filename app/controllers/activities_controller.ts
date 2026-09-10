import { HttpContext } from '@adonisjs/core/http'
import Activity from '#models/activity'
import {
  activityRegistrationValidator,
  guestActivityRegistrationValidator,
} from '#validators/activity_validator'
import ActivityRegistration from '#models/activity_registration'
import IssuedCertificate from '#models/issued_certificate'
import {
  serializeOwnerCertificateState,
  type CertificateOwnerState,
} from '#services/certificate_service'
import { errors } from '@vinejs/vine'
import CustomForm from '#models/custom_form'
import db from '@adonisjs/lucid/services/db'
import { isActivityRegistrationOpen } from '#services/activity_registration_service'
import { validateCustomFormSubmission } from '#services/custom_form_submission_service'

// Matches ACTIVITY_TYPE_ENUM.REGISTRATION_ONLY from the shared type constants
const ACTIVITY_TYPE_REGISTRATION_ONLY = 1

export default class ActivitiesController {
  async index({ request, response }: HttpContext) {
    try {
      const page = request.qs().page ?? 1
      const perPage = request.qs().per_page ?? 10
      const search = request.qs().search

      const clause: { activity_category?: number; club_id?: number } = {}

      if (request.qs().category) {
        clause.activity_category = request.qs().category
      }

      if (request.qs().club_id) {
        clause.club_id = request.qs().club_id
      }

      const activities = await Activity.query()
        .select('*')
        .where(clause)
        .where('name', 'ILIKE', search ? '%' + search + '%' : '%%')
        .where('is_published', 1)
        .orderBy('id', 'desc')
        .paginate(page, perPage)

      return response.ok({
        messages: 'GET_DATA_SUCCESS',
        data: activities,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async categories({ response }: HttpContext) {
    try {
      const categories = await Activity.query()
        .select('activity_category')
        .where('is_published', true)
        .distinct('activity_category')

      const categoryIds = categories.map((c) => c.activityCategory)

      return response.ok({
        message: 'GET_DATA_SUCCESS',
        data: categoryIds,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async show({ params, response }: HttpContext) {
    try {
      const slug: number = params.slug
      const activityData = await Activity.query()
        .where({ slug: slug, is_published: true })
        .preload('club')
        .first()
      if (!activityData) return response.notFound({ message: 'ACTIVITY_NOT_FOUND' })

      return response.ok({
        message: 'GET_DATA_SUCCESS',
        data: activityData,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async registrationCheck({ auth, params, response }: HttpContext) {
    const id = auth.user?.id
    const slug: string = params.slug
    try {
      const activity = await Activity.findByOrFail('slug', slug)
      const registration: {
        status: string
        visible_at?: string
        registration_id?: number
        certificate_state?: CertificateOwnerState
        certificate_code?: string | null
        certificate_issued_at?: string | null
        certificate_revoked_at?: string | null
      } = {
        status: 'BELUM TERDAFTAR',
      }
      const isRegistered = await ActivityRegistration.query()
        .where({
          user_id: id,
          activity_id: activity.id,
        })
        .first()

      if (isRegistered) {
        // Check status visibility settings
        const statusVisibility = activity.additionalConfig?.status_visibility
        const now = new Date()

        // If visibility is explicitly set to false and visible_at is in the future
        if (statusVisibility && statusVisibility.is_visible === false) {
          const visibleAt = statusVisibility.visible_at
            ? new Date(statusVisibility.visible_at)
            : null
          if (!visibleAt || now < visibleAt) {
            registration.status = 'BELUM DIUMUMKAN'
            if (visibleAt) {
              registration.visible_at = statusVisibility.visible_at
            }
          } else {
            // Time has passed, show actual status
            registration.status = isRegistered.status
            registration.registration_id = isRegistered.id
          }
        } else {
          // Default behavior: show status (backward compatible)
          registration.status = isRegistered.status
          registration.registration_id = isRegistered.id
        }

        if (registration.registration_id) {
          const issued = await IssuedCertificate.findBy('registrationId', isRegistered.id)
          const certificate = serializeOwnerCertificateState(isRegistered, issued)
          registration.certificate_state = certificate.state
          registration.certificate_code = certificate.certificate_code
          registration.certificate_issued_at = certificate.issued_at
          registration.certificate_revoked_at = certificate.revoked_at
        }
      }

      return response.ok({
        message: 'GET_DATA_SUCCESS',
        data: registration,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async getRegistrationData({ auth, params, response }: HttpContext) {
    const id = auth.user?.id
    const slug: string = params.slug
    try {
      const activity = await Activity.findByOrFail('slug', slug)
      const registrationData = await ActivityRegistration.query()
        .where({
          user_id: id,
          activity_id: activity.id,
        })
        .first()

      if (!registrationData) {
        return response.notFound({
          message: 'REGISTRATION_NOT_FOUND',
        })
      }

      const issued = await IssuedCertificate.findBy('registrationId', registrationData.id)
      const certificate = serializeOwnerCertificateState(registrationData, issued)

      return response.ok({
        message: 'GET_DATA_SUCCESS',
        data: {
          ...registrationData.serialize(),
          certificate_state: certificate.state,
          certificate_code: certificate.certificate_code,
          certificate_issued_at: certificate.issued_at,
          certificate_revoked_at: certificate.revoked_at,
        },
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async guestRegister({ params, request, response }: HttpContext) {
    try {
      const data = await guestActivityRegistrationValidator.validate(request.all())
      return await db.transaction(async (trx) => {
        const activity = await Activity.query({ client: trx })
          .where('slug', params.slug)
          .forUpdate()
          .first()
        if (!activity?.isPublished) return response.notFound({ message: 'ACTIVITY_NOT_FOUND' })

        const guestRegistrationAllowed =
          activity.activityType === ACTIVITY_TYPE_REGISTRATION_ONLY &&
          activity.additionalConfig?.allow_guest_registration

        if (!guestRegistrationAllowed) {
          return response.forbidden({ message: 'GUEST_REGISTRATION_NOT_ALLOWED' })
        }

        if (!isActivityRegistrationOpen(activity)) {
          return response.forbidden({ message: 'REGISTRATION_CLOSED' })
        }

        const activeForm = await CustomForm.query({ client: trx })
          .where('feature_type', 'activity_registration')
          .where('feature_id', activity.id)
          .where('is_active', true)
          .orderBy('updated_at', 'desc')
          .orderBy('id', 'desc')
          .first()
        if (!activeForm) return response.badRequest({ message: 'ACTIVE_CUSTOM_FORM_REQUIRED' })
        const submission = validateCustomFormSubmission(
          activeForm.formSchema,
          data.questionnaire_answer ?? {}
        )
        if (!submission.valid)
          return response.unprocessableEntity({
            message: 'INVALID_FORM_SUBMISSION',
            errors: submission.errors,
          })

        const registration = await ActivityRegistration.create(
          {
            userId: null,
            activityId: activity.id,
            status: 'TERDAFTAR',
            guestData: data.guest_data,
            questionnaireAnswer: submission.data,
          },
          { client: trx }
        )

        return response.ok({
          message: 'ACTIVITY_REGISTER_SUCCESS',
          data: registration,
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

  async questionnaireEdit({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    try {
      const data = await activityRegistrationValidator.validate(request.all())
      const activitySlug: number = params.slug
      const activity = await Activity.findBy('slug', activitySlug)
      if (!activity) {
        return response.notFound({
          message: 'ACTIVITY_NOT_FOUND',
        })
      }
      const registered = await ActivityRegistration.query()
        .where({
          user_id: user.id,
          activity_id: activity.id,
        })
        .first()

      if (!registered) {
        return response.notFound({
          message: 'REGISTRATION_NOT_FOUND',
        })
      }

      const updated = await registered
        .merge({ questionnaireAnswer: data.questionnaire_answer })
        .save()

      return response.ok({
        message: 'UPDATE_DATA_SUCCESS',
        data: updated,
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
}
