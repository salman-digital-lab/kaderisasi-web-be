import database from '@adonisjs/lucid/services/db'
import PublicUser from '#models/public_user'
import Profile from '#models/profile'
import { generateMemberId } from '../helpers/member_id_generator.js'
import { GoogleLoginError, type GoogleIdentity } from '#services/google_identity_service'

export async function resolveGoogleAccount(identity: GoogleIdentity): Promise<PublicUser> {
  return database.transaction(async (trx) => {
    await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtext(?))', [identity.email])
    const users = await PublicUser.query({ client: trx })
      .whereRaw('lower(email) = ?', [identity.email])
      .limit(2)
    if (users.length > 1) throw new GoogleLoginError('GOOGLE_EMAIL_PASSWORD_REQUIRED')
    if (users[0]) {
      // The alumni migration defaulted existing password accounts to no_account.
      if (!['active', 'no_account'].includes(users[0].accountStatus)) {
        throw new GoogleLoginError('GOOGLE_ACCOUNT_INACTIVE')
      }
      return users[0]
    }

    const user = await PublicUser.create(
      { email: identity.email, password: null, accountStatus: 'active' },
      { client: trx }
    )
    user.memberId = generateMemberId(user.id)
    await user.save()
    await Profile.create({ userId: user.id, name: identity.name }, { client: trx })
    return user
  })
}
