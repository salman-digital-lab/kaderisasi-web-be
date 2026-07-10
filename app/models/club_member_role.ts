import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import ClubRegistration from '#models/club_registration'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class ClubMemberRole extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare clubRegistrationId: number

  @belongsTo(() => ClubRegistration, {
    foreignKey: 'clubRegistrationId',
  })
  declare registration: BelongsTo<typeof ClubRegistration>

  @column()
  declare roleName: string

  @column.date()
  declare startDate: DateTime | null

  @column.date()
  declare endDate: DateTime | null

  @column()
  declare isPrimary: boolean

  @column()
  declare sortOrder: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
