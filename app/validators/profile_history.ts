import vine from '@vinejs/vine'

const yearRule = vine.createRule((value, _options, field) => {
  if (typeof value !== 'number' || !field.isValid) return
  if (!Number.isInteger(value) || value < 1900 || value > new Date().getFullYear() + 10) {
    field.report('Tahun tidak valid', 'historyYear', field)
  }
})

const endYearRule = vine.createRule((value, _options, field) => {
  const startYear = field.parent.start_year
  if (
    typeof value === 'number' &&
    startYear !== null &&
    startYear !== undefined &&
    startYear !== '' &&
    value < Number(startYear)
  ) {
    field.report('Tahun selesai tidak boleh lebih kecil dari tahun mulai', 'workYearRange', field)
  }
})

const historyYear = () =>
  vine
    .number()
    .parse((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
    .use(yearRule())

export const educationHistorySchema = vine
  .array(
    vine.object({
      degree: vine.enum(['high_school', 'diploma', 'bachelor', 'master', 'doctoral']).optional(),
      institution: vine.string().trim().optional(),
      faculty: vine.string().trim().optional(),
      major: vine.string().trim().optional(),
      intake_year: historyYear().optional(),
    })
  )
  .optional()

export const workHistorySchema = vine
  .array(
    vine.object({
      job_title: vine.string().trim().minLength(1),
      company: vine.string().trim().minLength(1),
      start_year: historyYear().optional(),
      end_year: historyYear().use(endYearRule()).optional(),
    })
  )
  .optional()
