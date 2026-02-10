import { HttpContext } from '@adonisjs/core/http'
import Activity from '#models/activity'
import { activityRegistrationValidator } from '#validators/activity_validator'
import ActivityRegistration from '#models/activity_registration'
import Profile from '#models/profile'
import { errors } from '@vinejs/vine'

export default class ActivitiesController {
  async index({ request, response }: HttpContext) {
    try {
      const page = request.qs().page ?? 1
      const perPage = request.qs().per_page ?? 10
      const search = request.qs().search

      const clause: { activity_category?: number } = {}

      if (request.qs().category) {
        clause.activity_category = request.qs().category
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
      var activityData = await Activity.query().where({ slug: slug }).firstOrFail()

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
      const registration: { status: string; visible_at?: string } = { status: 'BELUM TERDAFTAR' }
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
          }
        } else {
          // Default behavior: show status (backward compatible)
          registration.status = isRegistered.status
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

      return response.ok({
        message: 'GET_DATA_SUCCESS',
        data: registrationData,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async register({ params, request, response, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    try {
      const data = await activityRegistrationValidator.validate(request.all())

      const activitySlug: number = params.slug
      const userData = await Profile.findByOrFail('user_id', user.id)

      const activity = await Activity.findByOrFail('slug', activitySlug)

      const registered = await ActivityRegistration.query().where({
        user_id: user.id,
        activity_id: activity.id,
      })

      if (registered && registered.length) {
        return response.conflict({
          message: 'ALREADY_REGISTERED',
        })
      }

      if (userData.level < activity.minimumLevel) {
        return response.forbidden({
          message: 'UNMATCHED_LEVEL',
        })
      }
      const registration = await ActivityRegistration.create({
        userId: user.id,
        activityId: activity.id,
        status: 'TERDAFTAR',
        questionnaireAnswer: data.questionnaire_answer,
      })

      return response.ok({
        message: 'ACTIVITY_REGISTER_SUCCESS',
        data: registration,
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
