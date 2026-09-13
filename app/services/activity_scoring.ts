export type ScoringDefinition = {
  groups: {
    id: string
    name: string
    criteria: { id: string; name: string; maximum: number; weight: number }[]
  }[]
  grades: { label: string; minimum: number }[]
  note: string
}
export type ScoringResult = {
  criteria: {
    criterion_id: string
    score: number | null
    normalized: number | null
    grade: string | null
  }[]
  total: number | null
  grade: string | null
  complete: boolean
}
export type StoredScoringData = {
  schema_version: number
  published: {
    schema_version: number
    activity_id: number
    registration_id: number
    revision: number
    rubric: ScoringDefinition
    draft: { note: string }
    result: ScoringResult
    published_at: string
  } | null
}
export type PublishedScoringResult = {
  revision: number
  rubric: ScoringDefinition
  note: string
  result: ScoringResult
  published_at: string
}

export function publishedActivityScore(
  data: StoredScoringData | null,
  registrationId: number,
  activityId: number
): PublishedScoringResult | null {
  const published = data?.published
  if (
    data?.schema_version !== 1 ||
    !published ||
    published.schema_version !== 1 ||
    published.registration_id !== registrationId ||
    published.activity_id !== activityId ||
    !published.result.complete
  )
    return null

  return {
    revision: published.revision,
    published_at: published.published_at,
    note: published.draft.note,
    rubric: {
      note: published.rubric.note,
      grades: (published.rubric.grades ?? []).map(({ label, minimum }) => ({ label, minimum })),
      groups: published.rubric.groups.map(({ id, name, criteria }) => ({
        id,
        name,
        criteria: criteria.map(({ id: criterionId, name: criterionName, maximum, weight }) => ({
          id: criterionId,
          name: criterionName,
          maximum,
          weight,
        })),
      })),
    },
    result: {
      total: published.result.total,
      grade: published.result.grade,
      complete: true,
      criteria: published.result.criteria.map(({ criterion_id, score, normalized, grade }) => ({
        criterion_id,
        score,
        normalized,
        grade,
      })),
    },
  }
}
