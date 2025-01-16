import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

type PersonalQuestionnaire = {
  name: string
  required: boolean
}

type AdditionalConfig = {
  custom_selection_status: string[]
  mandatory_profile_data: PersonalQuestionnaire[]
  additional_questionnaire: Questionnaire[]
  images: string[]
}

type Questionnaire =
  | {
      id?: number
      type: 'text' | 'number' | 'textarea'
      label: string
      name: string
      required: boolean
    }
  | {
      id?: number
      type: 'dropdown'
      label: string
      name: string
      required: boolean
      data: { label: string; value: string; id: number }[]
    }

export default class Activity extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare slug: string

  @column()
  declare description: string

  @column.date()
  declare activityStart: DateTime

  @column.date()
  declare activityEnd: DateTime

  @column.date()
  declare registrationStart: DateTime

  @column.date()
  declare registrationEnd: DateTime

  @column.date()
  declare selectionStart: DateTime

  @column.date()
  declare selectionEnd: DateTime

  @column()
  declare minimumLevel: number

  @column()
  declare activityType: number

  @column()
  declare activityCategory: number

  @column()
  declare additionalConfig: AdditionalConfig

  @column()
  declare isPublished: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
