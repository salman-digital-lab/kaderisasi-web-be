import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import PublicUser from '#models/public_user'
import AdminUser from '#models/admin_user'

export default class RuangCurhat extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @belongsTo(() => PublicUser, {
    foreignKey: 'userId',
  })
  declare publicUser: BelongsTo<typeof PublicUser>

  @column()
  declare problemOwnership: number

  @column()
  declare ownerName: string

  @column()
  declare problemCategory: string

  @column()
  declare problemDescription: string

  @column()
  declare handlingTechnic: string

  @column()
  declare counselorGender: string

  @column()
  declare counselorId: number

  @belongsTo(() => AdminUser, {
    foreignKey: 'counselorId',
  })
  declare adminUser: BelongsTo<typeof AdminUser>

  @column()
  declare status: number

  @column()
  declare additionalNotes: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
