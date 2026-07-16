const MAX_SUBMISSION_SIZE = 100_000
const MAX_FIELD_STRING_LENGTH = 10_000

type CustomFormOption = {
  label: string
  value?: unknown
  disabled?: boolean
}

type CustomFormValidation = {
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  customMessage?: string
}

type CustomFormField = {
  key: string
  label: string
  required: boolean
  type: string
  hidden?: boolean
  disabled?: boolean
  options?: CustomFormOption[]
  validation?: CustomFormValidation
}

type CustomFormSection = {
  section_name: string
  fields: CustomFormField[]
}

type CustomFormSchema = {
  fields: CustomFormSection[]
}

export type CustomFormSubmissionError = {
  field?: string
  message: string
}

export type CustomFormSubmissionValidation =
  | { valid: true; data: Record<string, unknown> }
  | { valid: false; errors: CustomFormSubmissionError[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCustomFormSchema(value: unknown): value is CustomFormSchema {
  if (!isRecord(value) || !Array.isArray(value.fields)) return false

  return value.fields.every(
    (section) =>
      isRecord(section) &&
      typeof section.section_name === 'string' &&
      Array.isArray(section.fields) &&
      section.fields.every(
        (field) =>
          isRecord(field) &&
          typeof field.key === 'string' &&
          typeof field.label === 'string' &&
          typeof field.required === 'boolean' &&
          typeof field.type === 'string' &&
          (field.options === undefined ||
            (Array.isArray(field.options) &&
              field.options.every(
                (option) => isRecord(option) && typeof option.label === 'string'
              ))) &&
          (field.validation === undefined || isRecord(field.validation))
      )
  )
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

function getOptionValue(option: CustomFormOption): string {
  if (option.value === undefined || option.value === null) return option.label
  return String(option.value) || option.label
}

function validateValueType(field: CustomFormField, value: unknown): boolean {
  switch (field.type) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'multiselect':
      return Array.isArray(value) && value.every((item) => typeof item === 'string')
    case 'checkbox':
      return field.options?.length
        ? Array.isArray(value) && value.every((item) => typeof item === 'string')
        : typeof value === 'boolean'
    default:
      return typeof value === 'string'
  }
}

function validateAllowedOptions(field: CustomFormField, value: unknown): boolean {
  if (!field.options?.length) return true

  const allowedValues = new Set(
    field.options.filter((option) => !option.disabled).map(getOptionValue)
  )
  const submittedValues = Array.isArray(value) ? value : [value]

  return submittedValues.every(
    (submittedValue) => typeof submittedValue === 'string' && allowedValues.has(submittedValue)
  )
}

function validateFieldRules(field: CustomFormField, value: unknown): string | undefined {
  if (field.required && (isEmptyValue(value) || (field.type === 'checkbox' && value === false))) {
    return `${field.label} wajib diisi.`
  }

  if (isEmptyValue(value)) return undefined

  if (!validateValueType(field, value)) {
    return `Format ${field.label} tidak valid.`
  }

  if (!validateAllowedOptions(field, value)) {
    return `Pilihan ${field.label} tidak valid.`
  }

  if (typeof value === 'string' && value.length > MAX_FIELD_STRING_LENGTH) {
    return `${field.label} terlalu panjang.`
  }

  const rules = field.validation
  if (!rules) return undefined

  const customMessage = rules.customMessage

  if (typeof value === 'number' && rules.min !== undefined && value < rules.min) {
    return customMessage || `Nilai minimum ${field.label} adalah ${rules.min}.`
  }

  if (typeof value === 'number' && rules.max !== undefined && value > rules.max) {
    return customMessage || `Nilai maksimum ${field.label} adalah ${rules.max}.`
  }

  if (
    typeof value === 'string' &&
    rules.minLength !== undefined &&
    value.length < rules.minLength
  ) {
    return customMessage || `${field.label} minimal ${rules.minLength} karakter.`
  }

  if (
    typeof value === 'string' &&
    rules.maxLength !== undefined &&
    value.length > rules.maxLength
  ) {
    return customMessage || `${field.label} maksimal ${rules.maxLength} karakter.`
  }

  if (typeof value === 'string' && rules.pattern) {
    try {
      if (!new RegExp(rules.pattern).test(value)) {
        return customMessage || `Format ${field.label} tidak valid.`
      }
    } catch {
      return `Konfigurasi validasi ${field.label} tidak valid.`
    }
  }

  return undefined
}

export function validateCustomFormSubmission(
  schema: unknown,
  submission: unknown
): CustomFormSubmissionValidation {
  if (!isCustomFormSchema(schema)) {
    return { valid: false, errors: [{ message: 'Konfigurasi formulir tidak valid.' }] }
  }

  if (!isRecord(submission)) {
    return { valid: false, errors: [{ message: 'Data formulir tidak valid.' }] }
  }

  if (JSON.stringify(submission).length > MAX_SUBMISSION_SIZE) {
    return { valid: false, errors: [{ message: 'Data formulir terlalu besar.' }] }
  }

  const allSchemaFields = schema.fields.flatMap((section) => section.fields)
  const allSubmissionFields = schema.fields
    .filter((section) => section.section_name !== 'profile_data')
    .flatMap((section) => section.fields)
  const fields = allSubmissionFields.filter((field) => !field.hidden && !field.disabled)

  const fieldKeys = new Set<string>()
  for (const field of allSchemaFields) {
    if (fieldKeys.has(field.key)) {
      return {
        valid: false,
        errors: [
          { field: field.key, message: `Kunci formulir ${field.key} digunakan lebih dari sekali.` },
        ],
      }
    }
    fieldKeys.add(field.key)
  }

  const unknownField = Object.keys(submission).find((key) => !fieldKeys.has(key))
  if (unknownField) {
    return {
      valid: false,
      errors: [
        { field: unknownField, message: 'Formulir telah berubah. Muat ulang lalu isi kembali.' },
      ],
    }
  }

  const errors = fields.flatMap((field): CustomFormSubmissionError[] => {
    const message = validateFieldRules(field, submission[field.key])
    return message ? [{ field: field.key, message }] : []
  })

  if (errors.length > 0) return { valid: false, errors }

  const data = Object.fromEntries(
    fields
      .filter((field) => field.key in submission)
      .map((field) => [field.key, submission[field.key]])
  )

  return { valid: true, data }
}
