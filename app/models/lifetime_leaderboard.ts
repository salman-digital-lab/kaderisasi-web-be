import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import PublicUser from '#models/public_user'

export default class MonthlyLeaderboard extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column.date()
  declare month: DateTime

  @column()
  declare score: number

  @column()
  declare scoreAcademic: number

  @column()
  declare scoreCompetency: number

  @column()
  declare scoreOrganizational: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => PublicUser, {
    foreignKey: 'userId',
  })
  declare user: BelongsTo<typeof PublicUser>
}
