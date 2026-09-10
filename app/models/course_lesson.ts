import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Course from '#models/course'
import CourseDocument from '#models/course_document'
import CourseLessonProgress from '#models/course_lesson_progress'

export default class CourseLesson extends BaseModel {
  @column({ isPrimary: true }) declare id: number
  @column() declare courseId: number
  @column() declare title: string
  @column() declare description: string
  @column() declare youtubeVideoId: string
  @column() declare position: number
  @column.dateTime() declare deletedAt: DateTime | null
  @column.dateTime() declare createdAt: DateTime
  @column.dateTime() declare updatedAt: DateTime
  @belongsTo(() => Course) declare course: BelongsTo<typeof Course>
  @hasMany(() => CourseDocument, { foreignKey: 'lessonId' }) declare documents: HasMany<
    typeof CourseDocument
  >
  @hasMany(() => CourseLessonProgress, { foreignKey: 'lessonId' }) declare progress: HasMany<
    typeof CourseLessonProgress
  >
}
