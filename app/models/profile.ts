import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Province from '#models/province'
import PublicUser from '#models/public_user'
import City from '#models/city'
import University from '#models/university'

export default class Profile extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @belongsTo(() => PublicUser, {
    foreignKey: 'userId',
  })
  declare publicUser: BelongsTo<typeof PublicUser>

  @column()
  declare name: string

  @column()
  declare personal_id: string

  @column()
  declare gender: string

  @column()
  declare whatsapp: string

  @column()
  declare tiktok: string

  @column()
  declare linkedin: string

  @column()
  declare line: string

  @column()
  declare instagram: string

  @column()
  declare provinceId: number

  @belongsTo(() => Province, {
    foreignKey: 'provinceId',
  })
  declare province: BelongsTo<typeof Province>

  @column()
  declare cityId: number

  @belongsTo(() => City, {
    foreignKey: 'cityId',
  })
  declare city: BelongsTo<typeof City>

  @column()
  declare universityId: number

  @belongsTo(() => University, {
    foreignKey: 'universityId',
  })
  declare university: BelongsTo<typeof University>

  @column()
  declare university_temp: string

  @column()
  declare major: string

  @column()
  declare intakeYear: string

  @column()
  declare level: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
