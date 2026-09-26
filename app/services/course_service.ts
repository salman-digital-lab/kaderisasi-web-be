import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import Course from '#models/course'
import CourseLesson from '#models/course_lesson'
import CourseDocument from '#models/course_document'
import Profile from '#models/profile'
import { sanitizeRichText } from '#services/rich_text_service'

export class CourseAccessError extends Error {
  status = 404
  constructor() {
    super('COURSE_NOT_FOUND')
  }
}

export type CourseSummary = {
  id: number
  title: string
  summary: string
  minimum_level: number
  total_lessons: number
  completed_lessons: number
  resume_lesson_id: number | null
}
export type LessonSummary = { id: number; title: string; position: number; completed: boolean }
export type CourseDetail = CourseSummary & { description: string; lessons: LessonSummary[] }
export type LessonDetail = {
  course: CourseSummary
  lesson: LessonSummary & { description: string; youtube_video_id: string }
  lessons: LessonSummary[]
  documents: { id: number; filename: string; size_bytes: number }[]
}
export type CoursePage = {
  data: CourseSummary[]
  meta: { total: number; per_page: number; current_page: number; last_page: number }
}
export type ProgressResult = {
  completed: boolean
  completed_at: string | null
  last_visited_at: string
}

export function courseIdentifier(value: unknown): number {
  const id = Number(value)
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(id) || id > 2147483647)
    throw new CourseAccessError()
  return id
}
export function coursePagination(query: Record<string, unknown>): {
  page: number
  perPage: number
  search: string
} {
  const positive = (value: unknown, fallback: number, max: number): number => {
    const n = Number(value)
    return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback
  }
  return {
    page: positive(query.page, 1, 1000000),
    perPage: positive(query.per_page, 12, 100),
    search: typeof query.search === 'string' ? query.search.trim().slice(0, 200) : '',
  }
}

async function levelFor(userId: number, trx?: TransactionClientContract): Promise<number | null> {
  const query = Profile.query({ client: trx })
    .where('user_id', userId)
    .orderBy('id')
    .select(['id', 'level'])
  if (trx) query.forShare()
  const profile = await query.first()
  return profile ? (profile.level ?? 0) : null
}
function withProgress(userId: number): ModelQueryBuilderContract<typeof Course> {
  return Course.query()
    .select(['courses.id', 'courses.title', 'courses.summary', 'courses.minimum_level'])
    .select(
      db.raw(
        '(SELECT count(*) FROM course_lessons l WHERE l.course_id=courses.id AND l.deleted_at IS NULL) AS total_lessons'
      )
    )
    .select(
      db.raw(
        '(SELECT count(*) FROM course_lessons l JOIN course_lesson_progress p ON p.lesson_id=l.id WHERE l.course_id=courses.id AND l.deleted_at IS NULL AND p.user_id=? AND p.completed_at IS NOT NULL) AS completed_lessons',
        [userId]
      )
    )
    .select(
      db.raw(
        '(SELECT l.id FROM course_lessons l JOIN course_lesson_progress p ON p.lesson_id=l.id WHERE l.course_id=courses.id AND l.deleted_at IS NULL AND p.user_id=? ORDER BY p.last_visited_at DESC,p.id DESC LIMIT 1) AS resume_lesson_id',
        [userId]
      )
    )
}
function summary(row: Course): CourseSummary {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    minimum_level: row.minimumLevel,
    total_lessons: Number(row.$extras.total_lessons),
    completed_lessons: Number(row.$extras.completed_lessons),
    resume_lesson_id:
      row.$extras.resume_lesson_id == null ? null : Number(row.$extras.resume_lesson_id),
  }
}
function lessonSummary(row: CourseLesson): LessonSummary {
  return {
    id: row.id,
    title: row.title,
    position: row.position,
    completed: Boolean(row.$extras.completed),
  }
}

export async function listCourses(
  userId: number,
  query: Record<string, unknown>
): Promise<CoursePage> {
  const { page, perPage, search } = coursePagination(query)
  const level = await levelFor(userId)
  if (level === null)
    return { data: [], meta: { total: 0, per_page: perPage, current_page: page, last_page: 1 } }
  const rows = await withProgress(userId)
    .where('status', 'published')
    .where('minimum_level', '<=', level)
    .where('title', 'ilike', `%${search}%`)
    .orderBy('id', 'desc')
    .paginate(page, perPage)
  return {
    data: rows.all().map(summary),
    meta: {
      total: rows.total,
      per_page: perPage,
      current_page: page,
      last_page: Math.max(1, rows.lastPage),
    },
  }
}
async function readableCourse(userId: number, id: number, description = false): Promise<Course> {
  const level = await levelFor(userId)
  if (level === null) throw new CourseAccessError()
  const query = withProgress(userId)
    .where('id', id)
    .where('status', 'published')
    .where('minimum_level', '<=', level)
  if (description) query.select('courses.description')
  const row = await query.first()
  if (!row) throw new CourseAccessError()
  return row
}
async function lessonsFor(userId: number, id: number): Promise<CourseLesson[]> {
  return CourseLesson.query()
    .select(['id', 'title', 'position'])
    .select(
      db.raw(
        'EXISTS (SELECT 1 FROM course_lesson_progress p WHERE p.lesson_id=course_lessons.id AND p.user_id=? AND p.completed_at IS NOT NULL) AS completed',
        [userId]
      )
    )
    .where('course_id', id)
    .whereNull('deleted_at')
    .orderBy('position')
    .orderBy('id')
}
export async function showCourse(userId: number, id: number): Promise<CourseDetail> {
  const row = await readableCourse(userId, id, true)
  const lessons = await lessonsFor(userId, id)
  return {
    ...summary(row),
    description: sanitizeRichText(row.description),
    lessons: lessons.map(lessonSummary),
  }
}
export async function showLesson(
  userId: number,
  id: number,
  lessonId: number
): Promise<LessonDetail> {
  const course = await readableCourse(userId, id)
  const lesson = await CourseLesson.query()
    .select(['id', 'description', 'youtube_video_id'])
    .where('course_id', id)
    .where('id', lessonId)
    .whereNull('deleted_at')
    .first()
  if (!lesson) throw new CourseAccessError()
  const [lessons, documents] = await Promise.all([
    lessonsFor(userId, id),
    CourseDocument.query()
      .select(['id', 'filename', 'size_bytes'])
      .where('lesson_id', lessonId)
      .whereNull('deleted_at')
      .orderBy('id'),
  ])
  const selected = lessons.find((row) => row.id === lessonId)
  if (!selected) throw new CourseAccessError()
  return {
    course: summary(course),
    lesson: {
      ...lessonSummary(selected),
      description: sanitizeRichText(lesson.description),
      youtube_video_id: lesson.youtubeVideoId,
    },
    lessons: lessons.map(lessonSummary),
    documents: documents.map((d) => ({ id: d.id, filename: d.filename, size_bytes: d.sizeBytes })),
  }
}
export async function recordCourseProgress(
  userId: number,
  id: number,
  lessonId: number,
  completed: boolean | null
): Promise<ProgressResult> {
  return db.transaction(async (trx) => {
    const level = await levelFor(userId, trx)
    if (level === null) throw new CourseAccessError()
    const course = await Course.query({ client: trx })
      .where('id', id)
      .where('status', 'published')
      .where('minimum_level', '<=', level)
      .forShare()
      .first()
    if (!course) throw new CourseAccessError()
    const lesson = await CourseLesson.query({ client: trx })
      .where('course_id', id)
      .where('id', lessonId)
      .whereNull('deleted_at')
      .forShare()
      .first()
    if (!lesson) throw new CourseAccessError()
    const result = (await trx.rawQuery(
      `INSERT INTO course_lesson_progress (user_id,lesson_id,completed_at)
      VALUES (?, ?, CASE WHEN NULLIF(?, '')::boolean THEN now() ELSE NULL END)
      ON CONFLICT (user_id,lesson_id) DO UPDATE SET last_visited_at=now(),
      completed_at=CASE WHEN NULLIF(?, '')::boolean IS NULL THEN course_lesson_progress.completed_at
        WHEN NULLIF(?, '')::boolean THEN COALESCE(course_lesson_progress.completed_at,now()) ELSE NULL END
      RETURNING completed_at,last_visited_at`,
      [
        userId,
        lessonId,
        completed === null ? '' : String(completed),
        completed === null ? '' : String(completed),
        completed === null ? '' : String(completed),
      ]
    )) as { rows: { completed_at: Date | null; last_visited_at: Date }[] }
    const row = result.rows[0]
    return {
      completed: Boolean(row.completed_at),
      completed_at: row.completed_at?.toISOString() ?? null,
      last_visited_at: row.last_visited_at.toISOString(),
    }
  })
}
export async function readableDocument(
  userId: number,
  id: number,
  lessonId: number,
  documentId: number
): Promise<{ filename: string; storageKey: string }> {
  const level = await levelFor(userId)
  if (level === null) throw new CourseAccessError()
  const course = await Course.query()
    .select('id')
    .where('id', id)
    .where('status', 'published')
    .where('minimum_level', '<=', level)
    .first()
  if (!course) throw new CourseAccessError()
  const document = await CourseDocument.query()
    .select(['course_documents.filename', 'course_documents.storage_key'])
    .join('course_lessons as lesson', 'lesson.id', 'course_documents.lesson_id')
    .where('course_documents.id', documentId)
    .where('course_documents.lesson_id', lessonId)
    .where('lesson.course_id', id)
    .whereNull('lesson.deleted_at')
    .whereNull('course_documents.deleted_at')
    .first()
  if (!document) throw new CourseAccessError()
  return { filename: document.filename, storageKey: document.storageKey }
}
