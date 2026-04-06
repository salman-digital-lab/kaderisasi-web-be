import { HttpContext } from '@adonisjs/core/http'
import database from '@adonisjs/lucid/services/db'
import { errors } from '@vinejs/vine'
import PublicUser from '#models/public_user'
import { selfSubmitValidator } from '#validators/member_validator'
import { generateMemberId } from '../helpers/member_id_generator.js'
import { getKaderisasiBadges } from '../helpers/kaderisasi_profile.js'

export default class MembersController {
  async submit({ request, response }: HttpContext) {
    try {
      const payload = await selfSubmitValidator.validate(request.all())
      const kaderisasiPath = payload.extra_data?.kaderisasi_path

      await database.transaction(async (trx) => {
        const user = new PublicUser()
        user.email = null
        user.password = null
        user.accountStatus = 'no_account'
        user.useTransaction(trx)
        await user.save()

        user.memberId = generateMemberId(user.id)
        await user.save()

        // @ts-ignore cannot find a solution, it is error when using this monorepo
        await user.related('profile').create({
          name: payload.name,
          badges: getKaderisasiBadges(kaderisasiPath),
          gender: payload.gender ?? undefined,
          personal_id: payload.personal_id ?? undefined,
          whatsapp: payload.whatsapp ?? undefined,
          line: payload.line ?? undefined,
          instagram: payload.instagram ?? undefined,
          tiktok: payload.tiktok ?? undefined,
          linkedin: payload.linkedin ?? undefined,
          provinceId: payload.province_id ?? undefined,
          cityId: payload.city_id ?? undefined,
          country: payload.country ?? undefined,
          birthDate: payload.birth_date ? new Date(payload.birth_date) : undefined,
          originProvinceId: payload.origin_province_id ?? undefined,
          originCityId: payload.origin_city_id ?? undefined,
          educationHistory: payload.education_history ?? [],
          workHistory: payload.work_history ?? [],
          extraData: payload.extra_data ?? {},
        })
      })

      return response.created({
        message: 'SUBMIT_SUCCESS',
      })
    } catch (error) {
      if (error instanceof errors.E_VALIDATION_ERROR) {
        return response.internalServerError({
          message: error.messages[0]?.message || 'VALIDATION_ERROR',
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
