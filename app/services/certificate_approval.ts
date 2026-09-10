import type IssuedCertificate from '#models/issued_certificate'

export type CertificateApproval = {
  signer_name: string
  signer_title: string
  approved_at: string
}

export function hasCertificateApproval(issued: IssuedCertificate): boolean {
  const required = issued.templateSnapshot?.template_data.elements.some(
    (element) =>
      element.type === 'variable-text' &&
      element.variable?.replace(/[{}]/g, '').trim() === 'approval'
  )
  if (!required) return true
  const approval = issued.approvalSnapshot
  return Boolean(approval?.signer_name && approval.signer_title && approval.approved_at)
}

export function publicApproval(
  approval?: CertificateApproval | null
): CertificateApproval | undefined {
  if (!approval) return undefined
  return {
    signer_name: approval.signer_name,
    signer_title: approval.signer_title,
    approved_at: approval.approved_at,
  }
}
