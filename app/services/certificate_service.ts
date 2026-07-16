import ActivityRegistration from '#models/activity_registration'
import IssuedCertificate from '#models/issued_certificate'

export const ELIGIBLE_CERTIFICATE_STATUS = 'LULUS KEGIATAN'
export const CERTIFICATE_CODE_MAX_LENGTH = 96

export type CertificateOwnerState =
  | 'not_eligible'
  | 'eligible_not_issued'
  | 'issued_active'
  | 'issued_revoked'

export type CertificateParticipantData = {
  registration_id: number
  user_id: number | null
  name: string
  email: string
  university: string
  gender: string
  activity_name: string
  activity_date: string
}

export type CertificateActivityData = {
  id: number
  name: string
  activity_start: string | null
}

export type CertificateTemplateData = {
  id: number
  name: string
  version?: number
  background_image: string | null
  template_data: {
    backgroundUrl: string | null
    elements: Array<{
      id: string
      type: 'static-text' | 'variable-text' | 'image' | 'qr-code' | 'signature'
      name?: string
      x: number
      y: number
      width: number
      height: number
      content?: string
      variable?: string
      fontSize?: number
      fontFamily?: string
      color?: string
      textAlign?: 'left' | 'center' | 'right'
      verticalAlign?: 'top' | 'middle' | 'bottom'
      fontWeight?: 'normal' | 'bold'
      fontStyle?: 'normal' | 'italic'
      textDecoration?: 'none' | 'underline'
      lineHeight?: number
      letterSpacing?: number
      imageUrl?: string
      opacity?: number
      rotation?: number
      borderRadius?: number
      objectFit?: 'contain' | 'cover' | 'fill'
      visible?: boolean
      locked?: boolean
    }>
    canvasWidth: number
    canvasHeight: number
  }
}

export type IssuedCertificateData = {
  id: number
  certificate_code: string
  registration_id: number
  activity_id: number
  template_id: number
  issued_at: string
  revoked_at: string | null
  revoked_reason: string | null
}

export type CertificateResponseData = {
  activity: CertificateActivityData
  template: CertificateTemplateData
  participant: CertificateParticipantData
  certificate: IssuedCertificateData
}

export type PublicCertificateRenderData = {
  state: 'issued_active' | 'issued_revoked'
  activity: {
    name: string
    activity_start: string | null
    activity_date: string
  }
  template: {
    name: string
    background_image: string | null
    template_data: CertificateTemplateData['template_data']
  }
  participant: {
    name: string
    university: string
    gender: string
    activity_name: string
    activity_date: string
  }
  certificate: {
    certificate_code: string
    issued_at: string
    revoked_at: string | null
    revoked_reason: string | null
  }
}

export type CertificateVerificationData = {
  valid: boolean
  state: 'issued_active' | 'issued_revoked'
  certificate_code: string
  participant_name: string
  activity_name: string
  activity_date: string
  issued_at: string
  revoked_at: string | null
  revoked_reason: string | null
}

export type OwnerCertificateStateData = {
  state: CertificateOwnerState
  registration_id: number
  certificate_code: string | null
  issued_at: string | null
  revoked_at: string | null
}

export function serializeOwnerCertificateState(
  registration: ActivityRegistration,
  issued?: IssuedCertificate | null
): OwnerCertificateStateData {
  if (!issued) {
    return {
      state:
        registration.status === ELIGIBLE_CERTIFICATE_STATUS
          ? 'eligible_not_issued'
          : 'not_eligible',
      registration_id: registration.id,
      certificate_code: null,
      issued_at: null,
      revoked_at: null,
    }
  }

  return {
    state: issued.revokedAt ? 'issued_revoked' : 'issued_active',
    registration_id: registration.id,
    certificate_code: issued.certificateCode,
    issued_at: issued.issuedAt.toISO(),
    revoked_at: issued.revokedAt?.toISO() ?? null,
  }
}

export type CertificateErrorType =
  | 'INVALID_CERTIFICATE_CODE'
  | 'REGISTRATION_NOT_FOUND'
  | 'CERTIFICATE_NOT_FOUND'
  | 'CERTIFICATE_NOT_ISSUED'
  | 'CERTIFICATE_REVOKED'
  | 'FORBIDDEN'

export type CertificateResult<T> =
  | { success: true; data: T }
  | { success: false; error: CertificateErrorType }

export function normalizeCertificateCode(code: string): string | null {
  const normalized = code.trim().toUpperCase()

  if (!normalized || normalized.length > CERTIFICATE_CODE_MAX_LENGTH) {
    return null
  }

  return /^[A-Z0-9-]+$/.test(normalized) ? normalized : null
}

function buildActivitySnapshot(issued: IssuedCertificate): CertificateActivityData {
  return (
    issued.activitySnapshot ?? {
      id: issued.activityId,
      name: issued.participantSnapshot.activity_name,
      activity_start: null,
    }
  )
}

function buildIssuedCertificateData(issued: IssuedCertificate): IssuedCertificateData {
  return {
    id: issued.id,
    certificate_code: issued.certificateCode,
    registration_id: issued.registrationId,
    activity_id: issued.activityId,
    template_id: issued.templateId,
    issued_at: issued.issuedAt.toISO() ?? '',
    revoked_at: issued.revokedAt?.toISO() ?? null,
    revoked_reason: issued.revokedReason,
  }
}

export function buildIssuedResponseData(issued: IssuedCertificate): CertificateResponseData {
  return {
    activity: buildActivitySnapshot(issued),
    template: issued.templateSnapshot,
    participant: {
      ...issued.participantSnapshot,
      gender: issued.participantSnapshot.gender ?? '',
    },
    certificate: buildIssuedCertificateData(issued),
  }
}

export function serializePublicCertificate(
  data: CertificateResponseData
): PublicCertificateRenderData {
  const revoked = data.certificate.revoked_at !== null

  return {
    state: revoked ? 'issued_revoked' : 'issued_active',
    activity: {
      name: data.activity.name,
      activity_start: data.activity.activity_start,
      activity_date: data.participant.activity_date,
    },
    template: {
      name: data.template.name,
      background_image: data.template.background_image,
      template_data: data.template.template_data,
    },
    participant: {
      name: data.participant.name,
      university: data.participant.university,
      gender: data.participant.gender,
      activity_name: data.participant.activity_name,
      activity_date: data.participant.activity_date,
    },
    certificate: {
      certificate_code: data.certificate.certificate_code,
      issued_at: data.certificate.issued_at,
      revoked_at: data.certificate.revoked_at,
      revoked_reason: data.certificate.revoked_reason,
    },
  }
}

export function serializeCertificateVerification(
  data: CertificateResponseData
): CertificateVerificationData {
  const revoked = data.certificate.revoked_at !== null

  return {
    valid: !revoked,
    state: revoked ? 'issued_revoked' : 'issued_active',
    certificate_code: data.certificate.certificate_code,
    participant_name: data.participant.name,
    activity_name: data.participant.activity_name,
    activity_date: data.participant.activity_date,
    issued_at: data.certificate.issued_at,
    revoked_at: data.certificate.revoked_at,
    revoked_reason: data.certificate.revoked_reason,
  }
}

async function findIssuedByCode(code: string): Promise<CertificateResult<IssuedCertificate>> {
  const normalizedCode = normalizeCertificateCode(code)

  if (!normalizedCode) {
    return { success: false, error: 'INVALID_CERTIFICATE_CODE' }
  }

  const issued = await IssuedCertificate.findBy('certificateCode', normalizedCode)

  return issued
    ? { success: true, data: issued }
    : { success: false, error: 'CERTIFICATE_NOT_FOUND' }
}

export async function getPublicCertificateByCode(
  code: string
): Promise<CertificateResult<PublicCertificateRenderData>> {
  const result = await findIssuedByCode(code)

  return result.success
    ? { success: true, data: serializePublicCertificate(buildIssuedResponseData(result.data)) }
    : result
}

export async function verifyCertificateByCode(
  code: string
): Promise<CertificateResult<CertificateVerificationData>> {
  const result = await findIssuedByCode(code)

  return result.success
    ? {
        success: true,
        data: serializeCertificateVerification(buildIssuedResponseData(result.data)),
      }
    : result
}

export async function getOwnerRegistrationCertificateState(
  registrationId: number,
  userId: number
): Promise<CertificateResult<OwnerCertificateStateData>> {
  const registration = await ActivityRegistration.find(registrationId)

  if (!registration) {
    return { success: false, error: 'REGISTRATION_NOT_FOUND' }
  }

  if (registration.userId !== userId) {
    return { success: false, error: 'FORBIDDEN' }
  }

  const issued = await IssuedCertificate.findBy('registrationId', registrationId)
  return { success: true, data: serializeOwnerCertificateState(registration, issued) }
}

function assertIssuedOwnership(
  issued: IssuedCertificate,
  userId: number
): CertificateResult<IssuedCertificate> {
  if (issued.userId !== userId) {
    return { success: false, error: 'FORBIDDEN' }
  }

  if (issued.revokedAt) {
    return { success: false, error: 'CERTIFICATE_REVOKED' }
  }

  return { success: true, data: issued }
}

export async function getOwnerCertificateByCode(
  code: string,
  userId: number
): Promise<CertificateResult<CertificateResponseData>> {
  const result = await findIssuedByCode(code)

  if (!result.success) {
    return result
  }

  const ownership = assertIssuedOwnership(result.data, userId)
  return ownership.success
    ? { success: true, data: buildIssuedResponseData(ownership.data) }
    : ownership
}

export async function getOwnerCertificateByRegistration(
  registrationId: number,
  userId: number
): Promise<CertificateResult<CertificateResponseData>> {
  const registration = await ActivityRegistration.find(registrationId)

  if (!registration) {
    return { success: false, error: 'REGISTRATION_NOT_FOUND' }
  }

  if (registration.userId !== userId) {
    return { success: false, error: 'FORBIDDEN' }
  }

  const issued = await IssuedCertificate.findBy('registrationId', registrationId)

  if (!issued) {
    return { success: false, error: 'CERTIFICATE_NOT_ISSUED' }
  }

  if (issued.revokedAt) {
    return { success: false, error: 'CERTIFICATE_REVOKED' }
  }

  return { success: true, data: buildIssuedResponseData(issued) }
}
