import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class CustomForm extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare formName: string

  @column()
  declare formDescription: string | null

  @column()
  declare featureType: 'activity_registration' | 'club_registration'

  @column()
  declare featureId: number

  @column()
  declare formSchema: object

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
