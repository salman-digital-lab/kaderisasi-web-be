import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import Club from '#models/club'
import PublicUser from '#models/public_user'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class ClubRegistration extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare clubId: number

  @belongsTo(() => Club, {
    foreignKey: 'clubId',
  })
  declare club: BelongsTo<typeof Club>

  @column()
  declare memberId: number

  @belongsTo(() => PublicUser, {
    foreignKey: 'memberId',
  })
  declare member: BelongsTo<typeof PublicUser>

  @column()
  declare status: string

  @column()
  declare additionalData: Record<string, any>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}