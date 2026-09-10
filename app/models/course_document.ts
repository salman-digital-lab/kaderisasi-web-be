import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import CourseLesson from '#models/course_lesson'

export default class CourseDocument extends BaseModel {
  @column({ isPrimary: true }) declare id: number
  @column() declare lessonId: number
  @column({ serializeAs: null }) declare storageKey: string
  @column() declare filename: string
  @column() declare sizeBytes: number
  @column.dateTime() declare deletedAt: DateTime | null
  @column.dateTime() declare createdAt: DateTime
  @belongsTo(() => CourseLesson, { foreignKey: 'lessonId' }) declare lesson: BelongsTo<
    typeof CourseLesson
  >
}
