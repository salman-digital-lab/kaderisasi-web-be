import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import pg from 'pg'

const env = parseEnv(await readFile(new URL('../../docs/.env.test.be', import.meta.url), 'utf8'))
const schema = `public_perf_${randomUUID().replaceAll('-', '')}`
const client = new pg.Client({
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
})
const childEnv = {
  ...process.env,
  ...env,
  NODE_ENV: 'test',
  DB_SCHEMA: schema,
  PUBLIC_PERFORMANCE_TEST_SCHEMA: schema,
  PGOPTIONS: `-c search_path=${schema}`,
  ADMIN_BOOTSTRAP_EMAILS: 'performance@example.test',
}
const artifacts = new URL(`../tmp/public-performance/${schema}/`, import.meta.url)
await mkdir(artifacts, { recursive: true })
async function run(cwd, args) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += chunk
    process.stdout.write(chunk)
  })
  child.stderr.on('data', (chunk) => {
    output += chunk
    process.stderr.write(chunk)
  })
  const [code] = await once(child, 'exit')
  await writeFile(new URL(`${args[1].replaceAll(':', '-')}.log`, artifacts), output)
  if (code !== 0) throw new Error(`${args[1]} failed (${code})`)
}
await client.connect()
try {
  await client.query(`CREATE SCHEMA "${schema}"`)
  await run(new URL('../../kaderisasi-admin-be/', import.meta.url), [
    'ace',
    'migration:run',
    '--force',
  ])
  await run(new URL('../', import.meta.url), [
    'ace',
    'test',
    'unit',
    '--files=tests/unit/public_performance.spec.ts',
    ...process.argv.slice(2),
  ])
} finally {
  await client.query(`DROP SCHEMA "${schema}" CASCADE`)
  const remaining = await client.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema])
  await writeFile(
    new URL('cleanup.json', artifacts),
    JSON.stringify(
      {
        schema,
        cleaned: remaining.rowCount === 0,
        storage: 'in-memory controlled adapter; no external objects',
      },
      null,
      2
    )
  )
  console.log(`Cleaned owned schema: ${schema}; no external storage objects created`)
  await client.end()
}
