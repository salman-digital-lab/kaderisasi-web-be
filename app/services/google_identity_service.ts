import { OAuth2Client, type TokenPayload } from 'google-auth-library'

export class GoogleLoginError extends Error {}

export type GoogleIdentity = { email: string; name: string }

export function readGoogleIdentity(
  payload: TokenPayload | undefined,
  nonce: string
): GoogleIdentity {
  if (!payload?.sub || !payload.email || !payload.email_verified || payload.nonce !== nonce) {
    throw new GoogleLoginError('GOOGLE_LOGIN_FAILED')
  }
  const email = payload.email.trim().toLowerCase()
  // Only accept email ownership claims for mailboxes managed by Google.
  if (!email.endsWith('@gmail.com') && !payload.hd) {
    throw new GoogleLoginError('GOOGLE_EMAIL_PASSWORD_REQUIRED')
  }
  return { email, name: payload.name?.trim().slice(0, 255) || email.split('@')[0] }
}

export async function verifyGoogleCode(
  config: { clientId: string; clientSecret: string; redirectUri: string },
  input: { code: string; codeVerifier: string; nonce: string }
): Promise<GoogleIdentity> {
  const client = new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri)
  const { tokens } = await client.getToken({
    code: input.code,
    codeVerifier: input.codeVerifier,
  })
  if (!tokens.id_token) throw new GoogleLoginError('GOOGLE_LOGIN_FAILED')
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.clientId,
  })
  return readGoogleIdentity(ticket.getPayload(), input.nonce)
}
