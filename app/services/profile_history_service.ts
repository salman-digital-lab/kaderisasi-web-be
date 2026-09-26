import db from '@adonisjs/lucid/services/db'
import type { CertificateOwnerState } from '#services/certificate_service'

export type HistoryQuery = {
  page: number
  perPage: number
  search: string
  status: string
  searchScope?: 'name'
}
export type HistoryPage<T, S> = {
  items: T[]
  meta: { total: number; current_page: number; per_page: number; last_page: number }
  summary: S
}
export type ActivityHistoryItem = {
  id: number
  activity_id: number
  created_at: string | null
  activity_name: string
  activity_slug: string
  image_url: string | null
  has_certificate: boolean
  status: string
  visible_at: string | null
  certificate_state?: CertificateOwnerState
  certificate_code?: string | null
}
export type ActivityHistorySummary = {
  total: number
  accepted: number
  rejected: number
  pending: number
}
export type ConsultationHistoryItem = {
  id: number
  problem_ownership: number
  owner_name: string | null
  problem_category: string
  problem_description: string
  handling_technic: string
  status: number
  created_at: string
  adminUser: { display_name: string | null; email: string } | null
}
export type AchievementHistoryItem = {
  id: number
  name: string
  description: string
  achievement_date: string
  type: number
  score: number
  proof: string
  status: number
  remark: string | null
}

export function historyQuery(input: Record<string, unknown>): HistoryQuery {
  const positive = (value: unknown, fallback: number, max: number): number => {
    const n = Number(value)
    return Number.isSafeInteger(n) && n > 0 ? Math.min(n, max) : fallback
  }
  return {
    ...(input.search_scope === 'name' ? { searchScope: 'name' as const } : {}),
    page: positive(input.page, 1, 1_000_000),
    perPage: positive(input.per_page, 6, 100),
    search:
      typeof input.search === 'string'
        ? input.search.trim().slice(0, 200).toLocaleLowerCase('id')
        : '',
    status:
      typeof input.status === 'string' && input.status !== 'all' ? input.status.slice(0, 100) : '',
  }
}

const inputSql = 'input AS (SELECT ?::integer AS user_id, ?::text AS search, ?::text AS status)'

async function historyPage<T, S>(
  userId: number,
  query: HistoryQuery,
  owned: string,
  item: string,
  summary: string,
  joins = ''
): Promise<HistoryPage<T, S>> {
  const result = await db.rawQuery(
    `WITH ${inputSql}, owned AS (${owned}),
      filtered AS (SELECT owned.* FROM owned, input WHERE search_match AND (input.status='' OR owned.status::text=input.status)),
      page AS (SELECT * FROM filtered ORDER BY sort_date DESC NULLS LAST,id DESC LIMIT ? OFFSET ?)
     SELECT COALESCE((SELECT jsonb_agg(${item} ORDER BY p.sort_date DESC NULLS LAST,p.id DESC) FROM page p ${joins}), '[]'::jsonb) AS items,
       (SELECT count(*) FROM filtered) AS total,
       (SELECT ${summary} FROM owned) AS summary`,
    [userId, query.search, query.status, query.perPage, (query.page - 1) * query.perPage]
  )
  const row = result.rows[0] as { items: T[]; total: string; summary: S }
  const total = Number(row.total)
  return {
    items: row.items,
    meta: {
      total,
      current_page: query.page,
      per_page: query.perPage,
      last_page: Math.max(1, Math.ceil(total / query.perPage)),
    },
    summary: row.summary,
  }
}

export async function activityHistory(
  userId: number,
  query: HistoryQuery
): Promise<HistoryPage<ActivityHistoryItem, ActivityHistorySummary>> {
  const broaderSearch =
    query.searchScope === 'name'
      ? ''
      : " OR strpos(lower(coalesce(r.description,'')),input.search)>0 OR strpos(lower(coalesce(r.status,'')),input.search)>0"
  return historyPage(
    userId,
    query,
    `SELECT r.*, (input.search='' OR strpos(lower(coalesce(r.activity_name,'')),input.search)>0
      ${broaderSearch}) AS search_match
     FROM (SELECT ar.id, ar.activity_id, ar.created_at AS sort_date, a.name AS activity_name, a.slug AS activity_slug,
       a.description, a.additional_config->'images'->>0 AS image_url,
       coalesce((a.additional_config->>'certificate_template_id') NOT IN ('','0'),false) AS has_certificate,
       a.additional_config#>>'{status_visibility,visible_at}' AS visible_at,
       CASE WHEN a.additional_config#>'{status_visibility,is_visible}'='false'::jsonb AND
         CASE WHEN nullif(a.additional_config#>>'{status_visibility,visible_at}','') IS NULL THEN true
           WHEN pg_input_is_valid(a.additional_config#>>'{status_visibility,visible_at}','timestamp with time zone')
           THEN (a.additional_config#>>'{status_visibility,visible_at}')::timestamptz > statement_timestamp() ELSE false END
         THEN 'BELUM DIUMUMKAN' ELSE ar.status END AS status,
       CASE WHEN a.additional_config#>'{status_visibility,is_visible}'='false'::jsonb AND
         CASE WHEN nullif(a.additional_config#>>'{status_visibility,visible_at}','') IS NULL THEN true
           WHEN pg_input_is_valid(a.additional_config#>>'{status_visibility,visible_at}','timestamp with time zone')
           THEN (a.additional_config#>>'{status_visibility,visible_at}')::timestamptz > statement_timestamp() ELSE false END
         THEN true ELSE false END AS hidden
       FROM activity_registrations ar JOIN activities a ON a.id=ar.activity_id, input WHERE ar.user_id=input.user_id) r, input`,
    `jsonb_build_object('id',p.id,'activity_id',p.activity_id,'created_at',p.sort_date,'activity_name',p.activity_name,'activity_slug',p.activity_slug,
      'image_url',p.image_url,'has_certificate',p.has_certificate,'status',p.status,'visible_at',CASE WHEN p.hidden THEN p.visible_at ELSE NULL END)
     || CASE WHEN p.hidden THEN '{}'::jsonb ELSE jsonb_build_object(
       'certificate_state',CASE WHEN cert.id IS NULL OR NOT cert.approved THEN CASE WHEN p.status='LULUS KEGIATAN' THEN 'eligible_not_issued' ELSE 'not_eligible' END
         WHEN cert.revoked_at IS NULL THEN 'issued_active' ELSE 'issued_revoked' END,
       'certificate_code',CASE WHEN cert.approved THEN cert.certificate_code ELSE NULL END) END`,
    `jsonb_build_object('total',count(*),'accepted',count(*) FILTER (WHERE status IN ('DITERIMA','LULUS KEGIATAN')),
      'rejected',count(*) FILTER (WHERE status IN ('TIDAK DITERIMA','TIDAK LULUS')),
      'pending',count(*) FILTER (WHERE status IN ('TERDAFTAR','BELUM DIUMUMKAN')))`,
    `LEFT JOIN LATERAL (SELECT c.id,c.certificate_code,c.revoked_at,
       (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(c.template_snapshot#>'{template_data,elements}','[]'::jsonb)) element
          WHERE element->>'type'='variable-text' AND trim(translate(element->>'variable','{}',''))='approval')
        OR (coalesce(c.approval_snapshot->>'signer_name','')<>'' AND coalesce(c.approval_snapshot->>'signer_title','')<>'' AND coalesce(c.approval_snapshot->>'approved_at','')<>'')) AS approved
       FROM issued_certificates c WHERE c.registration_id=p.id AND NOT p.hidden ORDER BY c.id DESC LIMIT 1) cert ON true`
  )
}

export async function consultationHistory(
  userId: number,
  query: HistoryQuery
): Promise<HistoryPage<ConsultationHistoryItem, { total: number }>> {
  return historyPage(
    userId,
    query,
    `SELECT r.id,r.problem_ownership,r.owner_name,r.problem_category,r.problem_description,r.handling_technic,r.status,
       r.created_at,r.created_at AS sort_date,r.counselor_id,
       (input.search='' OR strpos(lower(coalesce(r.problem_category,'')),input.search)>0
        OR strpos(lower(coalesce(r.problem_description,'')),input.search)>0
        OR strpos(lower(coalesce(r.handling_technic,'')),input.search)>0
        OR strpos(lower(coalesce(r.owner_name,'')),input.search)>0) AS search_match
       FROM ruang_curhats r,input WHERE r.user_id=input.user_id`,
    `(to_jsonb(p)-'sort_date'-'search_match'-'counselor_id') || jsonb_build_object('adminUser',CASE WHEN counselor.id IS NULL THEN NULL ELSE jsonb_build_object('display_name',counselor.display_name,'email',counselor.email) END)`,
    `jsonb_build_object('total',count(*))`,
    'LEFT JOIN admin_users counselor ON counselor.id=p.counselor_id'
  )
}

export async function achievementHistory(
  userId: number,
  query: HistoryQuery
): Promise<HistoryPage<AchievementHistoryItem, { total: number; points: number }>> {
  return historyPage(
    userId,
    query,
    `SELECT a.id,a.name,a.description,to_char(a.achievement_date,'YYYY-MM-DD') AS achievement_date,a.type,a.score,a.proof,a.status,a.remark,
       a.achievement_date AS sort_date,(input.search='' OR strpos(lower(coalesce(a.name,'')),input.search)>0) AS search_match
       FROM achievements a,input WHERE a.user_id=input.user_id`,
    `to_jsonb(p)-'sort_date'-'search_match'`,
    `jsonb_build_object('total',count(*),'points',coalesce(sum(score),0))`
  )
}
