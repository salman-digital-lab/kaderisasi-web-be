import Activity from '#models/activity'
import ActivityRegistration from '#models/activity_registration'
import CertificateTemplate from '#models/certificate_template'

export type CertificateParticipantData = {
  registration_id: number
  user_id: number
  name: string
  email: string
  university: string
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
  background_image: string | null
  template_data: {
    backgroundUrl: string | null
    elements: Array<{
      id: string
      type: 'static-text' | 'variable-text' | 'image' | 'qr-code' | 'signature'
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
      imageUrl?: string
    }>
    canvasWidth: number
    canvasHeight: number
  }
}

export type CertificateResponseData = {
  activity: CertificateActivityData
  template: CertificateTemplateData
  participant: CertificateParticipantData
}

export type CertificateErrorType =
  | 'REGISTRATION_NOT_FOUND'
  | 'ACTIVITY_NOT_FOUND'
  | 'NO_CERTIFICATE_TEMPLATE'
  | 'CERTIFICATE_TEMPLATE_NOT_FOUND'

export type CertificateResult =
  | { success: true; data: CertificateResponseData }
  | { success: false; error: CertificateErrorType }

async function fetchRegistration(registrationId: number) {
  return ActivityRegistration.query()
    .where('id', registrationId)
    .where('status', 'LULUS KEGIATAN')
    .preload('publicUser', (query) => {
      query.preload('profile', (profileQuery) => {
        profileQuery.preload('university')
      })
    })
    .first()
}

async function fetchActivity(activityId: number) {
  return Activity.find(activityId)
}

async function fetchTemplate(templateId: number) {
  return CertificateTemplate.find(templateId)
}

function buildParticipantData(
  registration: ActivityRegistration,
  activity: Activity,
): CertificateParticipantData {
  const profile = registration.publicUser?.profile

  return {
    registration_id: registration.id,
    user_id: registration.userId,
    name: profile?.name || registration.publicUser?.email || 'Unknown',
    email: registration.publicUser?.email || '',
    university: profile?.university?.name || '',
    activity_name: activity.name,
    activity_date: activity.activityStart
      ? activity.activityStart.toFormat('dd MMMM yyyy')
      : '',
  }
}

function buildActivityData(activity: Activity): CertificateActivityData {
  return {
    id: activity.id,
    name: activity.name,
    activity_start: activity.activityStart?.toISO() ?? null,
  }
}

function buildTemplateData(template: CertificateTemplate): CertificateTemplateData {
  return {
    id: template.id,
    name: template.name,
    background_image: template.backgroundImage,
    template_data: template.templateData,
  }
}

export async function buildCertificateData(
  registrationId: number,
): Promise<CertificateResult> {
  const registration = await fetchRegistration(registrationId)

  if (!registration) {
    return { success: false, error: 'REGISTRATION_NOT_FOUND' }
  }

  const activity = await fetchActivity(registration.activityId)

  if (!activity) {
    return { success: false, error: 'ACTIVITY_NOT_FOUND' }
  }

  const templateId = activity.additionalConfig?.certificate_template_id

  if (!templateId) {
    return { success: false, error: 'NO_CERTIFICATE_TEMPLATE' }
  }

  const template = await fetchTemplate(templateId)

  if (!template) {
    return { success: false, error: 'CERTIFICATE_TEMPLATE_NOT_FOUND' }
  }

  return {
    success: true,
    data: {
      activity: buildActivityData(activity),
      template: buildTemplateData(template),
      participant: buildParticipantData(registration, activity),
    },
  }
}

export async function validateRegistrationOwnership(
  registrationId: number,
  userId: number,
): Promise<boolean> {
  const registration = await ActivityRegistration.query()
    .where('id', registrationId)
    .where('userId', userId)
    .first()

  return registration !== null
}
