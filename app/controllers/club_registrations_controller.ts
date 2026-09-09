import { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import ClubRegistration from '#models/club_registration'
import Club from '#models/club'
import { isClubRegistrationOpen } from '#services/club_service'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'UNKNOWN_ERROR'

export default class ClubRegistrationsController {
  /**
   * Register current user to a club
   */
  async register({ params, response, auth }: HttpContext) {
    try {
      auth.getUserOrFail()
      const clubId = params.id

      const club = await Club.find(clubId)

      if (!club || !club.isShow) {
        return response.notFound({ message: 'CLUB_NOT_FOUND' })
      }

      if (!isClubRegistrationOpen(club)) {
        return response.badRequest({ message: 'REGISTRATION_CLOSED' })
      }

      return response.badRequest({ message: 'CUSTOM_FORM_REQUIRED' })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: getErrorMessage(error),
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

      const club = await Club.find(clubId)

      if (!club) {
        return response.notFound({ message: 'CLUB_NOT_FOUND' })
      }

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
        error: getErrorMessage(error),
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
  async updateRegistration({ params, response, auth }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const clubId = params.id

      const registration = await ClubRegistration.query()
        .where('club_id', clubId)
        .where('member_id', user.id)
        .first()

      if (!registration) {
        return response.notFound({ message: 'REGISTRATION_NOT_FOUND' })
      }

      // The submission confirmation promises immutable answers. Pending applicants
      // can cancel and submit again; reviewed answers must remain available to admins.
      return response.badRequest({ message: 'CANNOT_UPDATE_REGISTRATION' })
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

      const result = await db.transaction(async (trx) => {
        const registration = await ClubRegistration.query({ client: trx })
          .where('club_id', clubId)
          .where('member_id', user.id)
          .forUpdate()
          .first()

        if (!registration) return 'REGISTRATION_NOT_FOUND' as const
        if (registration.status !== 'PENDING') return 'CANNOT_CANCEL_REGISTRATION' as const

        registration.useTransaction(trx)
        await registration.delete()
        return 'DELETED' as const
      })

      if (result === 'REGISTRATION_NOT_FOUND') {
        return response.notFound({ message: result })
      }

      if (result === 'CANNOT_CANCEL_REGISTRATION') {
        return response.badRequest({ message: result })
      }

      return response.ok({
        message: 'CLUB_REGISTRATION_DELETED',
        data: null,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: getErrorMessage(error),
      })
    }
  }
}
