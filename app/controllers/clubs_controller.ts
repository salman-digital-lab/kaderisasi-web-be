import { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import Activity from '#models/activity'
import Club from '#models/club'
import ClubMemberRole from '#models/club_member_role'
import {
  isClubRegistrationOpen,
  normalizeClubListQuery,
  serializePublicClubMedia,
  serializePublicClubLeadershipRole,
} from '#services/club_service'
import { sanitizeRichText } from '#services/rich_text_service'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'UNKNOWN_ERROR'

function sanitizePublicClubContent(club: Club): void {
  club.description = sanitizeRichText(club.description || '')
  club.media = serializePublicClubMedia(club.media)

  if (club.registrationInfo) {
    club.registrationInfo = {
      ...club.registrationInfo,
      registration_info: sanitizeRichText(club.registrationInfo.registration_info || ''),
    }
  }
}

export default class ClubsController {
  async index({ request, response }: HttpContext) {
    try {
      const { page, perPage, search, clubType } = normalizeClubListQuery(request.qs())

      const query = Club.query()
        .select('*')
        .where('name', 'ILIKE', search ? `%${search}%` : '%%')
        .where('isShow', true)

      if (clubType) {
        query.where('club_type', clubType)
      }

      const clubs = await query.orderBy('id', 'desc').paginate(page, perPage)
      const now = DateTime.local()

      for (const club of clubs.all()) {
        club.isRegistrationOpen = isClubRegistrationOpen(club, now)
        sanitizePublicClubContent(club)
      }

      return response.ok({
        message: 'GET_DATA_SUCCESS',
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
      const club = await Club.find(params.id)

      if (!club || !club.isShow) {
        return response.notFound({
          message: 'CLUB_NOT_FOUND',
        })
      }

      club.isRegistrationOpen = isClubRegistrationOpen(club)
      sanitizePublicClubContent(club)

      const activities = await Activity.query()
        .where('club_id', club.id)
        .where('is_published', 1)
        .orderBy('activity_start', 'asc')

      const leadership = await ClubMemberRole.query()
        .whereHas('registration', (registrationQuery) => {
          registrationQuery.where('club_id', club.id).where('status', 'APPROVED')
        })
        .preload('registration', (registrationQuery) => {
          registrationQuery.select(['id', 'member_id'])
          registrationQuery.preload('member', (memberQuery) => {
            memberQuery.select(['id'])
            memberQuery.preload('profile', (profileQuery) => {
              profileQuery.select(['user_id', 'name', 'picture'])
            })
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
          leadership: leadership.map(serializePublicClubLeadershipRole),
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
