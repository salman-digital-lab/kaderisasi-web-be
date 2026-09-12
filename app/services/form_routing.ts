// Contract mirrored in web-fe and web-be; routing fixtures must pass in all three apps.
export type FormDestination =
  | { type: 'next' }
  | { type: 'submit' }
  | { type: 'section'; sectionId: string }

export interface SectionNavigation {
  defaultTarget: FormDestination
  questionKey?: string
  routes?: { optionValue: string; target: FormDestination }[]
}

export interface RoutingField {
  key: string
  type: string
  hidden?: boolean
  disabled?: boolean
  options?: { label: string; value?: unknown; disabled?: boolean }[]
}

export interface RoutingSection {
  id?: string
  section_name: string
  fields: RoutingField[]
  navigation?: SectionNavigation
}

export interface RoutingSchema {
  version?: number
  fields: RoutingSection[]
}

export interface RoutingIssue {
  sectionId?: string
  message: string
}

export function optionValue(option: { label: string; value?: unknown }): string {
  return option.value == null ? option.label : String(option.value) || option.label
}

export function customSections<T extends RoutingSection>(schema: {
  fields: T[]
}): (T & { id: string })[] {
  const reserved = new Set(schema.fields.map((section) => section.id))
  return schema.fields
    .map((section, index) => {
      let id = section.id
      if (id === undefined) {
        id = `legacy_section_${index}`
        while (reserved.has(id)) id += '_'
        reserved.add(id)
      }
      return { ...section, id }
    })
    .filter((section) => section.section_name !== 'profile_data')
}

export function validateFormRouting(schema: RoutingSchema): RoutingIssue[] {
  const issues: RoutingIssue[] = []
  const ids = new Set<string>()
  const keys = new Set<string>()
  const sections = customSections(schema)
  const profiles = schema.fields.filter((section) => section.section_name === 'profile_data')
  if (
    profiles.length > 1 ||
    (profiles.length === 1 && schema.fields[0]?.section_name !== 'profile_data')
  )
    issues.push({ message: 'Data diri harus menjadi bagian pertama dan hanya boleh ada satu.' })
  if (schema.version !== undefined && schema.version !== 2) {
    issues.push({ message: 'Versi formulir tidak didukung.' })
  }
  for (const section of schema.fields) {
    const add = (message: string): void => {
      issues.push({ sectionId: section.id, message })
    }
    if (schema.version === 2 && (typeof section.id !== 'string' || !section.id.trim()))
      add('Bagian harus memiliki ID.')
    if (section.id !== undefined) {
      if (typeof section.id !== 'string' || !section.id.trim() || ids.has(section.id))
        add('ID bagian harus unik dan tidak kosong.')
      ids.add(section.id)
    }
    for (const field of section.fields) {
      if (!field.key.trim() || keys.has(field.key))
        add('Kunci pertanyaan harus unik dan tidak kosong.')
      keys.add(field.key)
    }
    const navigation = section.navigation
    if (navigation === undefined) continue
    if (!navigation || typeof navigation !== 'object') {
      add('Pengaturan alur tidak valid.')
      continue
    }
    if (section.section_name === 'profile_data') {
      add('Data diri tidak dapat mengatur percabangan.')
      continue
    }
    const index = sections.findIndex((item) => item.id === section.id)
    if (!section.id || index < 0) add('Bagian dengan alur harus memiliki ID.')
    const checkTarget = (target: FormDestination): void => {
      if (!target || typeof target !== 'object') {
        add('Tujuan bagian tidak valid.')
        return
      }
      if (target.type === 'next' || target.type === 'submit') return
      if (
        target.type !== 'section' ||
        !target.sectionId ||
        !sections.some((item, i) => i > index && item.id === target.sectionId)
      ) {
        add('Tujuan harus berupa bagian setelah bagian ini. Perbaiki alur yang terputus.')
      }
    }
    checkTarget(navigation.defaultTarget)
    if (navigation.routes !== undefined && !Array.isArray(navigation.routes)) {
      add('Daftar aturan alur tidak valid.')
      continue
    }
    const question = section.fields.find((field) => field.key === navigation.questionKey)
    if (
      navigation.questionKey !== undefined &&
      (!question ||
        !['radio', 'select'].includes(question.type) ||
        question.hidden ||
        question.disabled)
    ) {
      add('Pilih satu pertanyaan pilihan ganda atau dropdown yang aktif di bagian ini.')
    }
    const values = new Set<string>()
    const allowed = question?.options?.filter((option) => !option.disabled).map(optionValue) ?? []
    if (navigation.questionKey && new Set(allowed).size !== allowed.length)
      add('Nilai pilihan untuk percabangan harus unik.')
    for (const route of navigation.routes ?? []) {
      if (
        !route ||
        typeof route.optionValue !== 'string' ||
        !navigation.questionKey ||
        !allowed.includes(route.optionValue) ||
        values.has(route.optionValue)
      ) {
        add('Pilihan pada aturan alur tidak tersedia atau digunakan lebih dari sekali.')
      } else values.add(route.optionValue)
      checkTarget(route?.target)
    }
  }
  return issues
}

export function nextSectionId(
  schema: RoutingSchema,
  sectionId: string,
  answers: Record<string, unknown>
): string | null {
  const sections = customSections(schema)
  const index = sections.findIndex((section) => section.id === sectionId)
  const section = sections[index]
  if (!section) throw new Error('Bagian formulir tidak tersedia.')
  const navigation = section.navigation
  const answer = navigation?.questionKey ? answers[navigation.questionKey] : undefined
  const target = (answer != null
    ? navigation?.routes?.find((route) => route.optionValue === String(answer))?.target
    : undefined) ??
    navigation?.defaultTarget ?? { type: 'next' }
  if (target.type === 'submit') return null
  if (target.type === 'next') return sections[index + 1]?.id ?? null
  if (!sections.some((item, i) => i > index && item.id === target.sectionId))
    throw new Error('Tujuan formulir tidak valid.')
  return target.sectionId
}

export function formRoute(schema: RoutingSchema, answers: Record<string, unknown>): string[] {
  const route: string[] = []
  let current: string | null = customSections(schema)[0]?.id ?? null
  while (current !== null) {
    if (route.includes(current)) throw new Error('Alur formulir berulang.')
    route.push(current)
    current = nextSectionId(schema, current, answers)
  }
  return route
}

export function pruneFormAnswers(
  schema: RoutingSchema,
  answers: Record<string, unknown>
): Record<string, unknown> {
  const sections = customSections(schema)
  const route = new Set(formRoute(schema, answers))
  const skipped = new Set(
    sections
      .filter((section) => !route.has(section.id))
      .flatMap((section) => section.fields.map((field) => field.key))
  )
  return Object.fromEntries(Object.entries(answers).filter(([key]) => !skipped.has(key)))
}
