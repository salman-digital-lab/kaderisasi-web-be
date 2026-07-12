import { HttpContext } from '@adonisjs/core/http'
import ClubRegistration from '#models/club_registration'
import Club from '#models/club'
import { updateClubRegistrationValidator } from '#validators/club_registration_validator'

export default class ClubRegistrationsController {
  /**
   * Register current user to a club
   */
  async register({ params, response, auth }: HttpContext) {
    try {
      auth.getUserOrFail()
      const clubId = params.id

      const club = await Club.findOrFail(clubId)

      if (!club.isRegistrationOpen) {
        return response.badRequest({ message: 'REGISTRATION_CLOSED' })
      }

      return response.badRequest({ message: 'CUSTOM_FORM_REQUIRED' })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  /**
   * Get current user's registration status for a club
   */
  async checkRegistration({ params, response, auth }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const clubId = params.id

      const club = await Club.findOrFail(clubId)

      const registration = await ClubRegistration.query()
        .where('club_id', club.id)
        .where('member_id', user.id)
        .preload('club')
        .preload('roles', (roleQuery) => {
          roleQuery.orderBy('sort_order', 'asc').orderBy('is_primary', 'desc')
        })
        .first()

      return response.ok({
        message: 'REGISTRATION_STATUS_RETRIEVED',
        data: {
          isRegistered: !!registration,
          registration: registration || null,
        },
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  /**
   * Get current user's club registrations
   */
  async myRegistrations({ request, response, auth }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const page = request.input('page', 1)
      const limit = request.input('limit', 20)
      const status = request.input('status')

      const query = ClubRegistration.query()
        .where('member_id', user.id)
        .preload('club')
        .preload('roles', (roleQuery) => {
          roleQuery.orderBy('sort_order', 'asc').orderBy('is_primary', 'desc')
        })
        .orderBy('created_at', 'desc')

      if (status) {
        query.where('status', status)
      }

      const registrations = await query.paginate(page, limit)

      return response.ok({
        message: 'MY_CLUB_REGISTRATIONS_RETRIEVED',
        data: registrations,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  /**
   * Update current user's registration data
   */
  async updateRegistration({ params, request, response, auth }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const clubId = params.id
      const payload = await updateClubRegistrationValidator.validate(request.all())

      const registration = await ClubRegistration.query()
        .where('club_id', clubId)
        .where('member_id', user.id)
        .firstOrFail()

      if (payload.additional_data) {
        registration.additionalData = { ...registration.additionalData, ...payload.additional_data }
      }

      await registration.save()
      await registration.load('club')

      return response.ok({
        message: 'CLUB_REGISTRATION_UPDATED',
        data: registration,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  /**
   * Cancel current user's registration
   */
  async cancelRegistration({ params, response, auth }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const clubId = params.id

      const registration = await ClubRegistration.query()
        .where('club_id', clubId)
        .where('member_id', user.id)
        .firstOrFail()

      // Only allow cancellation if status is PENDING or APPROVED
      if (!['PENDING', 'APPROVED'].includes(registration.status)) {
        return response.badRequest({
          message: 'CANNOT_CANCEL_REGISTRATION',
        })
      }

      // Delete the registration instead of changing status
      await registration.delete()

      return response.ok({
        message: 'CLUB_REGISTRATION_DELETED',
        data: null,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }
}
