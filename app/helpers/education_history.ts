type EducationHistoryEntryInput = {
  degree?: 'bachelor' | 'master' | 'doctoral'
  institution?: string
  faculty?: string
  major?: string
  intake_year?: number
}

export function normalizeEducationHistory(
  educationHistory: EducationHistoryEntryInput[] | undefined
) {
  return (educationHistory ?? []).map((entry) => ({
    ...entry,
    institution: entry.institution ?? '',
    faculty: entry.faculty ?? '',
    major: entry.major ?? '',
  }))
}
