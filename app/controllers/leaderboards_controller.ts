import { HttpContext } from '@adonisjs/core/http'
import Achievement from '#models/achievement'
import { errors } from '@vinejs/vine'
import { achievementValidator } from '#validators/achievement_validator'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { minioClient } from '#config/drive'
import fs from 'node:fs'
import env from '#start/env'
import MonthlyLeaderboard from '#models/monthly_leaderboard'
import LifetimeLeaderboard from '#models/lifetime_leaderboard'
import { DateTime } from 'luxon'

export default class LeaderboardsController {
  async store({ request, response, auth }: HttpContext) {
    const user = auth.getUserOrFail()
    try {
      const data = await request.validateUsing(achievementValidator)

      const proof = data.proof
      if (!proof.isValid) {
        return response.badRequest({
          message: 'INVALID_FILE',
          error: proof.errors,
        })
      }

      // Generate unique filename
      const fileName = `achievements/${user.id}_${Date.now()}.${proof.extname}`

      // Upload to MinIO
      const fileBuffer = fs.readFileSync(proof.tmpPath!)
      await minioClient.send(
        new PutObjectCommand({
          Bucket: env.get('DRIVE_BUCKET'),
          Key: fileName,
          Body: fileBuffer,
          ContentType: proof.type || 'application/octet-stream',
          ACL: 'public-read',
        })
      )

      console.log(data.achievement_date)
      const achievement = await Achievement.create({
        userId: user.id,
        name: data.name,
        description: data.description,
        achievementDate: DateTime.fromISO(data.achievement_date),
        type: data.type,
        score: 0, // Will be set by admin during approval
        proof: fileName,
        status: 0, // Pending approval
      })

      return response.created({
        message: 'CREATE_DATA_SUCCESS',
        data: achievement,
      })
    } catch (error) {
      if (error instanceof errors.E_VALIDATION_ERROR) {
        return response.badRequest({
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

  async monthly({ request, response }: HttpContext) {
    try {
      const page = request.qs().page ?? 1
      const perPage = request.qs().per_page ?? 10
      const monthParam = request.qs().month
      const monthDate = monthParam ? DateTime.fromISO(monthParam) : DateTime.now()

      const leaderboard = await MonthlyLeaderboard.query()
        .where('month', monthDate.toSQLDate()!)
        .preload('user', (query) => {
          query.preload('profile')
        })
        .orderBy('score', 'desc')
        .paginate(page, perPage)

      return response.ok({
        message: 'GET_DATA_SUCCESS',
        data: leaderboard,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async lifetime({ request, response }: HttpContext) {
    try {
      const page = request.qs().page ?? 1
      const perPage = request.qs().per_page ?? 10

      const leaderboard = await LifetimeLeaderboard.query()
        .preload('user', (query) => {
          query.preload('profile')
        })
        .orderBy('score', 'desc')
        .paginate(page, perPage)

      return response.ok({
        message: 'GET_DATA_SUCCESS',
        data: leaderboard,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }

  async myAchievements({ request, response, auth }: HttpContext) {
    try {
      const user = auth.getUserOrFail()
      const page = request.qs().page ?? 1
      const perPage = request.qs().per_page ?? 10

      const achievements = await Achievement.query()
        .where('userId', user.id)
        .orderBy('achievementDate', 'desc')
        .paginate(page, perPage)

      return response.ok({
        message: 'GET_DATA_SUCCESS',
        data: achievements,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'GENERAL_ERROR',
        error: error.message,
      })
    }
  }
}
