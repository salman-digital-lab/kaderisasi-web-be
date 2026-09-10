import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, parseEnv } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import sharp from 'sharp'
import {
  S3Client,
  GetObjectCommand,
  GetObjectAclCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { optimizeProfileImage } from '../app/services/profile_image_service.ts'

const { values } = parseArgs({
  options: {
    environment: { type: 'string' },
    mode: { type: 'string', default: 'prepare' },
    directory: { type: 'string' },
    limit: { type: 'string' },
    schema: { type: 'string' },
  },
})
if (
  !['prod', 'test'].includes(values.environment) ||
  !['prepare', 'apply', 'verify', 'rollback', 'probe'].includes(values.mode) ||
  !values.directory
) {
  throw new Error(
    'Use --environment=prod|test --directory=<private backup directory> --mode=prepare|apply|verify|rollback|probe'
  )
}
if (values.mode === 'probe' && values.environment !== 'test') throw new Error('Probe requires test')
if (
  values.schema &&
  (values.environment !== 'test' || !/^profile_image_test_[a-f0-9]{32}$/.test(values.schema))
) {
  throw new Error('Only an owned test schema may override the profile table')
}
const profileTable = `"${values.schema || 'public'}".profiles`
const workspace = fileURLToPath(new URL('../../', import.meta.url))
const env = parseEnv(await readFile(join(workspace, `docs/.env.${values.environment}.be`), 'utf8'))
const fe = parseEnv(
  await readFile(join(workspace, `docs/.env.${values.environment}.web-fe`), 'utf8')
)
const directory = resolve(values.directory)
await mkdir(directory, { recursive: true, mode: 0o700 })
for (const child of ['originals', 'optimized', 'journal'])
  await mkdir(join(directory, child), { mode: 0o700 }).catch((error) => {
    if (error.code !== 'EEXIST') throw error
  })
const bucket = env.DRIVE_BUCKET
const client = new S3Client({
  endpoint: env.DRIVE_ENDPOINT,
  region: env.DRIVE_REGION,
  forcePathStyle: env.DRIVE_DISK === 'minio',
  credentials: {
    accessKeyId: env.DRIVE_ACCESS_KEY_ID,
    secretAccessKey: env.DRIVE_SECRET_ACCESS_KEY,
  },
  maxAttempts: 2,
})
const db = new pg.Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  connectionTimeoutMillis: 10000,
  statement_timeout: 30000,
  options: '-c default_transaction_read_only=on',
  application_name: 'profile_image_optimization',
})
const hash = (data) => createHash('sha256').update(data).digest('hex')
const idFor = (key) => hash(key)
const safeError = (error) => ({
  name: error.name,
  code: error.code,
  status: error.$metadata?.httpStatusCode,
})
async function json(name, value) {
  const target = join(directory, name)
  await writeFile(`${target}.tmp`, JSON.stringify(value, null, 2), { mode: 0o600 })
  await rename(`${target}.tmp`, target)
}
async function exists(name) {
  try {
    await access(join(directory, name))
    return true
  } catch {
    return false
  }
}
function localKey(picture) {
  if (!picture.includes('://')) return picture
  const base = fe.NEXT_PUBLIC_IMAGE_BASE_URL.replace(/\/$/, '') + '/'
  return picture.startsWith(base) ? decodeURIComponent(picture.slice(base.length)) : null
}
function validKey(key) {
  return (
    key &&
    !key.startsWith('/') &&
    !key.includes('://') &&
    !key.includes('\\') &&
    !key.split('/').some((part) => part === '..' || part === '.')
  )
}
function headers(response) {
  return Object.fromEntries(
    [
      'CacheControl',
      'ContentDisposition',
      'ContentEncoding',
      'ContentLanguage',
      'Expires',
      'WebsiteRedirectLocation',
      'StorageClass',
      'Metadata',
      'ContentType',
    ]
      .filter((key) => response[key] !== undefined)
      .map((key) => [key, response[key]])
  )
}
function putHeaders(entry) {
  return {
    ...entry.headers,
    ...(entry.headers.Expires ? { Expires: new Date(entry.headers.Expires) } : {}),
    ACL: 'public-read',
    Tagging:
      new URLSearchParams(entry.tags.map((tag) => [tag.Key, tag.Value])).toString() || undefined,
  }
}
async function publicVerify(entry, expectedBytes) {
  const base = fe.NEXT_PUBLIC_IMAGE_BASE_URL.replace(/\/$/, '')
  const url = `${base}/${entry.key.split('/').map(encodeURIComponent).join('/')}?profile-verify=${randomUUID()}`
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), cache: 'no-store' })
  if (!response.ok) throw new Error('Public image is unavailable')
  const data = Buffer.from(await response.arrayBuffer())
  if (hash(data) !== hash(expectedBytes)) throw new Error('Public image byte verification failed')
  const metadata = await sharp(data).metadata()
  if (metadata.format !== entry.format || metadata.width > 512 || metadata.height > 512)
    throw new Error('Public image dimensions or format mismatch')
  await sharp(data).raw().toBuffer()
}

try {
  await db.connect()
  if (values.mode === 'probe') {
    const key = `profile-image-probe/${randomUUID()}.png`
    const bytes = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#4080a0' },
    })
      .png()
      .toBuffer()
    try {
      const initial = await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: 'image/png',
          ACL: 'public-read',
          IfNoneMatch: '*',
        })
      )
      let guarded = false
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: bytes,
            IfMatch: '"intentionally-stale-etag"',
            ACL: 'public-read',
          })
        )
      } catch (error) {
        if (error.$metadata?.httpStatusCode === 412) guarded = true
        else throw error
      }
      if (!guarded) throw new Error('Provider does not enforce conditional writes')
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: 'image/png',
          ACL: 'public-read',
          IfMatch: initial.ETag,
        })
      )
      await publicVerify({ key, format: 'png' }, bytes)
      await json('probe.json', {
        conditionalWrites: true,
        publicReadable: true,
        environment: values.environment,
        checkedAt: new Date().toISOString(),
      })
      console.log('Conditional overwrite and public image access verified')
    } finally {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        throw new Error('Fixture still exists')
      } catch (error) {
        if (error.$metadata?.httpStatusCode !== 404) throw error
      }
      console.log('Removed and verified owned probe object')
    }
  } else if (values.mode === 'prepare') {
    if (await exists('plan.json'))
      throw new Error('Use a fresh directory; do not replace an existing rollback plan')
    const result = await db.query(
      `SELECT id, picture FROM ${profileTable} WHERE picture IS NOT NULL AND btrim(picture) <> '' ORDER BY id`
    )
    const objects = new Map()
    const skipped = []
    for (const row of result.rows) {
      const key = localKey(row.picture)
      if (!validKey(key)) {
        skipped.push({ profileId: row.id, reason: 'external_or_invalid_key' })
        continue
      }
      if (!objects.has(key)) objects.set(key, { key, profiles: [] })
      objects.get(key).profiles.push({ id: row.id, picture: row.picture })
    }
    const entries = []
    const source = [...objects.values()]
    let next = 0
    let completed = 0
    async function worker() {
      while (next < source.length) {
        const item = source[next++]
        try {
          const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: item.key }))
          if (head.Metadata?.['profile-optimization'] === '512-v1') {
            skipped.push({ key: item.key, reason: 'already_optimized' })
            continue
          }
          if (
            !head.ContentLength ||
            head.ContentLength > 20 * 1024 * 1024 ||
            head.ContentEncoding ||
            head.WebsiteRedirectLocation ||
            head.ServerSideEncryption
          )
            throw new Error('Unsupported source metadata or size')
          const [acl, tags] = await Promise.all([
            client.send(new GetObjectAclCommand({ Bucket: bucket, Key: item.key })),
            client.send(new GetObjectTaggingCommand({ Bucket: bucket, Key: item.key })),
          ])
          const grants = acl.Grants || []
          if (
            grants.length !== 2 ||
            !grants.some(
              (grant) =>
                grant.Permission === 'READ' &&
                grant.Grantee?.URI === 'http://acs.amazonaws.com/groups/global/AllUsers'
            ) ||
            !grants.some(
              (grant) => grant.Permission === 'FULL_CONTROL' && grant.Grantee?.ID === acl.Owner?.ID
            )
          )
            throw new Error('Nonstandard access policy; preserve unchanged')
          const response = await client.send(
            new GetObjectCommand({ Bucket: bucket, Key: item.key, IfMatch: head.ETag })
          )
          const bytes = Buffer.from(await response.Body.transformToByteArray())
          if (bytes.length !== head.ContentLength) throw new Error('Download size mismatch')
          const metadata = await sharp(bytes, {
            limitInputPixels: 40_000_000,
            failOn: 'error',
          }).metadata()
          const format = metadata.format
          if (!['jpeg', 'png', 'webp'].includes(format))
            throw new Error('Unsupported profile image format')
          const optimized = await optimizeProfileImage(bytes, format)
          if (optimized.length >= bytes.length) {
            skipped.push({ key: item.key, reason: 'no_size_saving', bytes: bytes.length })
            continue
          }
          await sharp(optimized).raw().toBuffer()
          const id = idFor(item.key)
          await writeFile(join(directory, 'originals', id), bytes, { mode: 0o600, flag: 'wx' })
          await writeFile(join(directory, 'optimized', id), optimized, { mode: 0o600, flag: 'wx' })
          entries.push({
            ...item,
            id,
            format,
            originalBytes: bytes.length,
            optimizedBytes: optimized.length,
            originalSha256: hash(bytes),
            optimizedSha256: hash(optimized),
            originalETag: head.ETag,
            originalModified: head.LastModified,
            headers: headers(head),
            acl,
            tags: tags.TagSet || [],
            originalWidth: metadata.width,
            originalHeight: metadata.height,
            orientation: metadata.orientation,
          })
        } catch (error) {
          skipped.push({ key: item.key, reason: 'preparation_failed', error: safeError(error) })
        } finally {
          completed++
          if (completed % 25 === 0 || completed === source.length)
            console.log({
              prepared: completed,
              total: source.length,
              candidates: entries.length,
              skipped: skipped.length,
            })
        }
      }
    }
    await Promise.all(Array.from({ length: 4 }, worker))
    entries.sort((a, b) => a.key.localeCompare(b.key))
    await json('plan.json', {
      version: 1,
      environment: values.environment,
      bucket,
      profileTable,
      endpoint: env.DRIVE_ENDPOINT,
      preparedAt: new Date().toISOString(),
      policy:
        'Preserve existing keys, formats and public access; optimize only when smaller; original bytes retained locally',
      profiles: result.rowCount,
      objects: source.length,
      entries,
      skipped,
    })
    console.log({
      profiles: result.rowCount,
      candidates: entries.length,
      originalBytes: entries.reduce((s, entry) => s + entry.originalBytes, 0),
      optimizedBytes: entries.reduce((s, entry) => s + entry.optimizedBytes, 0),
      skipped: skipped.length,
    })
  } else {
    const plan = JSON.parse(await readFile(join(directory, 'plan.json'), 'utf8'))
    if (
      plan.environment !== values.environment ||
      plan.bucket !== bucket ||
      (plan.profileTable || '"public".profiles') !== profileTable ||
      plan.endpoint !== env.DRIVE_ENDPOINT ||
      plan.version !== 1
    )
      throw new Error('Plan environment mismatch')
    const limit = values.limit ? Number(values.limit) : Infinity
    if (!(limit > 0)) throw new Error('Invalid limit')
    let processed = 0
    const failures = []
    for (const entry of plan.entries) {
      if (processed >= limit) break
      const journalName = `journal/${entry.id}.json`
      const prior = (await exists(journalName))
        ? JSON.parse(await readFile(join(directory, journalName), 'utf8'))
        : null
      if (values.mode === 'apply' && prior?.status === 'verified') continue
      try {
        const original = await readFile(join(directory, 'originals', entry.id))
        const optimized = await readFile(join(directory, 'optimized', entry.id))
        if (hash(original) !== entry.originalSha256 || hash(optimized) !== entry.optimizedSha256)
          throw new Error('Local backup checksum mismatch')
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: entry.key }))
        if (values.mode === 'verify') {
          if (prior?.status !== 'verified') continue
          await publicVerify(entry, optimized)
        } else if (values.mode === 'rollback') {
          if (!['verified', 'uploaded', 'writing'].includes(prior?.status)) continue
          const current = await client.send(
            new GetObjectCommand({ Bucket: bucket, Key: entry.key, IfMatch: head.ETag })
          )
          const currentBytes = Buffer.from(await current.Body.transformToByteArray())
          if (hash(currentBytes) !== entry.optimizedSha256)
            throw new Error('Object changed after migration; refusing rollback')
          await client.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: entry.key,
              Body: original,
              ...putHeaders(entry),
              IfMatch: head.ETag,
            })
          )
          const restored = await client.send(
            new GetObjectCommand({ Bucket: bucket, Key: entry.key })
          )
          if (
            hash(Buffer.from(await restored.Body.transformToByteArray())) !== entry.originalSha256
          )
            throw new Error('Rollback verification failed')
          await json(journalName, {
            status: 'rolled_back',
            key: entry.key,
            at: new Date().toISOString(),
          })
        } else {
          const references = await db.query(
            `SELECT id FROM ${profileTable} WHERE id = ANY($1::int[]) AND picture = ANY($2::text[])`,
            [entry.profiles.map((row) => row.id), entry.profiles.map((row) => row.picture)]
          )
          if (!references.rowCount) throw new Error('Profile no longer references source')
          if (
            head.ETag !== entry.originalETag ||
            head.ContentLength !== entry.originalBytes ||
            head.LastModified.toISOString() !== entry.originalModified
          ) {
            if (!['writing', 'uploaded'].includes(prior?.status))
              throw new Error('Source changed after preparation')
            await publicVerify(entry, optimized)
          } else {
            await json(journalName, {
              status: 'writing',
              key: entry.key,
              at: new Date().toISOString(),
            })
            const uploaded = await client.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: entry.key,
                Body: optimized,
                ...putHeaders(entry),
                Metadata: { ...entry.headers.Metadata, 'profile-optimization': '512-v1' },
                IfMatch: entry.originalETag,
              })
            )
            await json(journalName, {
              status: 'uploaded',
              key: entry.key,
              etag: uploaded.ETag,
              at: new Date().toISOString(),
            })
            await publicVerify(entry, optimized)
          }
          await json(journalName, {
            status: 'verified',
            key: entry.key,
            bytesSaved: entry.originalBytes - entry.optimizedBytes,
            at: new Date().toISOString(),
          })
        }
        processed++
        if (processed % 25 === 0) console.log({ mode: values.mode, processed })
      } catch (error) {
        failures.push({ key: entry.key, error: safeError(error), reason: error.message })
        break
      }
    }
    await json(`${values.mode}-result.json`, { at: new Date().toISOString(), processed, failures })
    console.log({ mode: values.mode, processed, failures })
    if (failures.length) process.exitCode = 1
  }
} finally {
  await db.end()
  client.destroy()
}
