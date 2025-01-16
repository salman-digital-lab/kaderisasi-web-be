import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import Activity from '#models/activity'
import PublicUser from '#models/public_user'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class ActivityRegistration extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @belongsTo(() => PublicUser, {
    foreignKey: 'userId',
  })
  declare publicUser: BelongsTo<typeof PublicUser>

  @column()
  declare activityId: number

  @belongsTo(() => Activity, {
    foreignKey: 'activityId',
  })
  declare activity: BelongsTo<typeof Activity>

  @column()
  declare status: string

  @column()
  declare questionnaireAnswer: Record<string, any>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
