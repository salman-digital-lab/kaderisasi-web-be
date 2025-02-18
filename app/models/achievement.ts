import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import PublicUser from '#models/public_user'
import AdminUser from '#models/admin_user'

export default class Achievement extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare name: string

  @column()
  declare description: string

  @column.date()
  declare achievementDate: DateTime

  @column()
  declare type: number

  @column()
  declare score: number

  @column()
  declare proof: string

  @column()
  declare isProofDeleted: boolean
  @column()
  declare status: number

  @column()
  declare remark: string | null

  @column()
  declare approverId: number | null

  @column.date()
  declare approvedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => PublicUser, {
    foreignKey: 'userId',
  })
  declare user: BelongsTo<typeof PublicUser>

  @belongsTo(() => AdminUser, {
    foreignKey: 'approverId',
  })
  declare approver: BelongsTo<typeof AdminUser>
}
