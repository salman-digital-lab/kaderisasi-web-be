import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class LegacyMember extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare gender: string

  @column()
  declare email: string

  @column()
  declare phone: string

  @column()
  declare line_id: string

  @column()
  declare intake_year: string

  @column()
  declare password: string

  @column()
  declare ssc: number

  @column()
  declare lmd: number

  @column()
  declare spectra: number
}