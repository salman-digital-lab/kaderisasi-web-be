import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Province from '#models/province'
import PublicUser from '#models/public_user'
import City from '#models/city'
import University from '#models/university'

type EducationEntry = {
  degree: 'bachelor' | 'master' | 'doctoral'
  institution: string
  major: string
  intake_year: number
}

type WorkEntry = {
  job_title: string
  company: string
  start_year?: number
  end_year?: number
}

type ExtraData = {
  preferred_name?: string
  salman_activity_history?: string[]
  current_activity_focus?: string[]
  kaderisasi_path?: {
    ssc?: number | null
    lmd?: number | null
    spectra?: number | null
  }
  alumni_regional_assignment?: string[]
}

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
  declare picture: string

  @column({
    prepare: (value) => (value != null ? JSON.stringify(value) : null),
  })
  declare badges: string[]

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

  @column()
  declare birthDate: Date | null

  @column()
  declare originProvinceId: number | null

  @belongsTo(() => Province, { foreignKey: 'originProvinceId' })
  declare originProvince: BelongsTo<typeof Province>

  @column()
  declare originCityId: number | null

  @belongsTo(() => City, { foreignKey: 'originCityId' })
  declare originCity: BelongsTo<typeof City>

  @column()
  declare country: string | null

  @column({
    prepare: (value) => (value != null ? JSON.stringify(value) : null),
  })
  declare educationHistory: EducationEntry[]

  @column({
    prepare: (value) => (value != null ? JSON.stringify(value) : null),
  })
  declare workHistory: WorkEntry[]

  @column({
    prepare: (value) => (value != null ? JSON.stringify(value) : null),
  })
  declare extraData: ExtraData

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
