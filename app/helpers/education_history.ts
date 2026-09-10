export type EducationEntry = {
  degree?: 'bachelor' | 'master' | 'doctoral'
  institution: string
  faculty: string
  major: string
  intake_year?: number
}

export type WorkEntry = {
  job_title: string
  company: string
  start_year?: number
  end_year?: number
}

export function historyEntries(value: unknown): Record<string, unknown>[] {
  // Some imported JSONB values contain a serialized array instead of an array.
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return []
    }
  }
  if (!Array.isArray(value)) return []
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      entry !== null && typeof entry === 'object' && !Array.isArray(entry)
  )
}

export function normalizeYearValue(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  const year = Number(value)
  return Number.isFinite(year) ? year : undefined
}

const textValue = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export function normalizeEducationHistory(value: unknown): EducationEntry[] {
  return historyEntries(value).map((entry) => ({
    degree:
      entry.degree === 'bachelor' || entry.degree === 'master' || entry.degree === 'doctoral'
        ? entry.degree
        : undefined,
    institution: textValue(entry.institution),
    faculty: textValue(entry.faculty),
    major: textValue(entry.major),
    intake_year: normalizeYearValue(entry.intake_year),
  }))
}

export function normalizeWorkHistory(value: unknown): WorkEntry[] {
  return historyEntries(value).map((entry) => ({
    job_title: textValue(entry.job_title),
    company: textValue(entry.company),
    start_year: normalizeYearValue(entry.start_year),
    end_year: normalizeYearValue(entry.end_year),
  }))
}
