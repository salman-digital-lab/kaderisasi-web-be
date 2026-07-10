import { HttpContext } from '@adonisjs/core/http'
import Activity from '#models/activity'
import Club from '#models/club'
import ClubMemberRole from '#models/club_member_role'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'UNKNOWN_ERROR'

export default class ClubsController {
  async index({ request, response }: HttpContext) {
    try {
      const page = request.qs().page ?? 1
      const perPage = request.qs().per_page ?? 10
      const search = request.qs().search
      const clubType = request.qs().club_type

      const query = Club.query()
        .select('*')
        .where('name', 'ILIKE', search ? '%' + search + '%' : '%%')
        .where('isShow', true)

      if (clubType) {
        query.where('club_type', clubType)
      }

      const clubs = await query.orderBy('id', 'desc').paginate(page, perPage)

      return response.ok({
        messages: 'GET_DATA_SUCCESS',
        data: clubs,
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
      const club = await Club.findOrFail(params.id)

      if (!club.isShow) {
        return response.notFound({
          message: 'CLUB_NOT_FOUND',
        })
      }

      const activities = await Activity.query()
        .where('club_id', club.id)
        .where('is_published', 1)
        .orderBy('activity_start', 'asc')

      const leadership = await ClubMemberRole.query()
        .whereHas('registration', (registrationQuery) => {
          registrationQuery.where('club_id', club.id).where('status', 'APPROVED')
        })
        .preload('registration', (registrationQuery) => {
          registrationQuery.preload('member', (memberQuery) => {
            memberQuery.preload('profile')
          })
        })
        .orderBy('sort_order', 'asc')
        .orderBy('is_primary', 'desc')
        .orderBy('created_at', 'asc')

      return response.ok({
        message: 'GET_DATA_SUCCESS',
        data: {
          ...club.toJSON(),
          activities,
          leadership,
        },
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: getErrorMessage(error),
      })
    }
  }
}
