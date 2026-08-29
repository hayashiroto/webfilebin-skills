#!/usr/bin/env node
// WebFileBin エージェント API のクライアント。
// Node.js 20 以降の組み込み fetch のみを使い、外部依存を持たない。
//
// 必要な環境変数:
//   WFB_API_BASE      … agent-api の Function URL（例: https://xxxx.lambda-url.ap-northeast-1.on.aws）
//   WFB_CLIENT_ID     … Web UI の「AI連携」タブで発行した client_id
//   WFB_CLIENT_SECRET … 同タブで発行時に一度だけ表示される client_secret
//   WFB_SCOPE         … （任意）要求スコープ。省略時はクライアントに許可された全スコープ

import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join, relative, sep } from 'node:path'

const TEXT_EXTENSIONS = new Set(['.html', '.htm'])
const UPLOADABLE_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.jpg',
  '.jpeg',
  '.png',
  '.mp4',
])
// Function URL のリクエストサイズ上限（6MB）に対する安全側の目安
const MAX_REQUEST_BYTES = 5 * 1024 * 1024

class WfbError extends Error {
  constructor(message, { status, code, hint } = {}) {
    super(message)
    this.status = status
    this.code = code
    this.hint = hint
  }
}

const requireEnv = (name) => {
  const value = process.env[name]
  if (!value) {
    throw new WfbError(`環境変数 ${name} が設定されていません`, {
      hint: 'WebFileBin の「AI連携」タブで資格情報を発行し、環境変数を設定してください。',
    })
  }
  return value
}

const config = () => ({
  base: requireEnv('WFB_API_BASE').replace(/\/$/, ''),
  clientId: requireEnv('WFB_CLIENT_ID'),
  clientSecret: requireEnv('WFB_CLIENT_SECRET'),
  scope: process.env.WFB_SCOPE ?? '',
})

// アクセストークンは短命なので、同じ client_id 単位でローカルにキャッシュする
const tokenCachePath = (base, clientId) => {
  const digest = createHash('sha256')
    .update(`${base}\u0000${clientId}`)
    .digest('hex')
    .slice(0, 16)
  return join(tmpdir(), `wfb-token-${digest}.json`)
}

const readCachedToken = async (path) => {
  try {
    const cached = JSON.parse(await readFile(path, 'utf8'))
    // 期限切れ間際のトークンは使い回さない
    if (typeof cached.access_token !== 'string') return null
    if (typeof cached.expires_at !== 'number') return null
    if (cached.expires_at - Date.now() < 60_000) return null
    return cached.access_token
  } catch {
    return null
  }
}

const describeError = async (response) => {
  let body = {}
  try {
    body = await response.json()
  } catch {
    /* JSON でないレスポンスはそのまま扱う */
  }
  const code = body.error ?? `http_${response.status}`
  const detail = body.error_description ?? body.message ?? response.statusText
  const hints = {
    invalid_client:
      'client_id / client_secret を確認してください。失効させた資格情報は再利用できません。',
    plan_required:
      '所有ユーザーの Pro プランが有効ではありません。プランを確認してください。',
    insufficient_scope:
      'この資格情報には必要なスコープがありません。Web UI でスコープを付け直して再発行してください。',
    invalid_token:
      'アクセストークンが失効しています。トークンキャッシュを削除して再試行してください。',
    rate_limited: `レート上限に達しました。${response.headers.get('retry-after') ?? '60'} 秒ほど待ってから再試行してください。`,
  }
  return new WfbError(detail, {
    status: response.status,
    code,
    hint: hints[code],
  })
}

const fetchToken = async ({ base, clientId, clientSecret, scope }) => {
  const form = new URLSearchParams({ grant_type: 'client_credentials' })
  if (scope) form.set('scope', scope)

  const response = await fetch(`${base}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // client_secret はヘッダで送り、コマンド履歴やログに残さない
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: form.toString(),
  })
  if (!response.ok) throw await describeError(response)

  const token = await response.json()
  const path = tokenCachePath(base, clientId)
  await writeFile(
    path,
    JSON.stringify({
      access_token: token.access_token,
      expires_at: Date.now() + (token.expires_in ?? 3600) * 1000,
      scope: token.scope,
    }),
    { mode: 0o600 },
  )
  return token.access_token
}

const accessToken = async (cfg) => {
  const cached = await readCachedToken(tokenCachePath(cfg.base, cfg.clientId))
  if (cached) return cached
  return await fetchToken(cfg)
}

// 401 の場合はキャッシュ済みトークンを捨てて一度だけ再取得する
const callApi = async (cfg, path, { method = 'GET', body } = {}) => {
  const send = async (token) =>
    await fetch(`${cfg.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })

  let response = await send(await accessToken(cfg))
  if (response.status === 401) {
    response = await send(await fetchToken(cfg))
  }
  if (!response.ok) throw await describeError(response)
  return await response.json()
}

const assertUploadable = (fileName) => {
  const ext = extname(fileName).toLowerCase()
  if (!UPLOADABLE_EXTENSIONS.has(ext)) {
    throw new WfbError(`対応していない拡張子です: ${ext || '(なし)'}`, {
      hint: `アップロードできるのは ${[...UPLOADABLE_EXTENSIONS].join(', ')} です。`,
    })
  }
  return ext
}

const assertRequestSize = (bytes, what) => {
  if (bytes > MAX_REQUEST_BYTES) {
    throw new WfbError(
      `${what} が大きすぎます（${(bytes / 1024 / 1024).toFixed(1)}MB）`,
      {
        hint: 'Function URL の上限は 6MB です。ファイルを分割するか、フォルダを複数回に分けて送ってください。',
      },
    )
  }
}

const collectFiles = async (dir, root = dir) => {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full, root)))
    } else if (entry.isFile()) {
      files.push({
        // S3 のキーは常に / 区切りにする
        path: relative(root, full).split(sep).join('/'),
        content: (await readFile(full)).toString('base64'),
      })
    }
  }
  return files
}

const commands = {
  async whoami(cfg) {
    return await callApi(cfg, '/v1/me')
  },

  async list(cfg, args) {
    const params = new URLSearchParams()
    if (args.limit) params.set('limit', args.limit)
    if (args.next) params.set('nextToken', args.next)
    const query = params.toString()
    return await callApi(cfg, `/v1/files${query ? `?${query}` : ''}`)
  },

  async upload(cfg, args) {
    const source = args._[0]
    if (!source) {
      throw new WfbError('アップロードするファイルのパスを指定してください')
    }
    const fileName = args.name ?? basename(source)
    const ext = assertUploadable(fileName)
    const raw = await readFile(source)
    assertRequestSize(raw.byteLength, fileName)

    const isText = TEXT_EXTENSIONS.has(ext)
    const access = resolveAccessModeArgs(args)
    return await callApi(cfg, '/v1/files', {
      method: 'POST',
      body: {
        fileName,
        encoding: isText ? 'text' : 'base64',
        content: isText ? raw.toString('utf8') : raw.toString('base64'),
        overwrite: Boolean(args.overwrite),
        ...access,
      },
    })
  },

  async 'upload-folder'(cfg, args) {
    const source = args._[0]
    if (!source) {
      throw new WfbError('アップロードするフォルダのパスを指定してください')
    }
    const info = await stat(source)
    if (!info.isDirectory()) {
      throw new WfbError(`${source} はフォルダではありません`)
    }

    const folderName = args.name ?? basename(source.replace(/[/\\]+$/, ''))
    const files = await collectFiles(source)
    if (files.length === 0) {
      throw new WfbError('フォルダにアップロード対象のファイルがありません')
    }
    if (!files.some((file) => file.path === 'index.html')) {
      throw new WfbError('フォルダ直下に index.html が必要です', {
        hint: '公開時のエントリポイントとして index.html を用意してください。',
      })
    }
    assertRequestSize(
      files.reduce((total, file) => total + file.content.length, 0),
      `フォルダ ${folderName}`,
    )

    return await callApi(cfg, '/v1/folders', {
      method: 'POST',
      body: { folderName, files, overwrite: Boolean(args.overwrite) },
    })
  },

  async protect(cfg, args) {
    const name = args._[0]
    if (!name) {
      throw new WfbError('パスワードをかけるファイル名を指定してください')
    }
    const password = resolvePassword(args)
    if (!password) {
      throw new WfbError('パスワードを指定してください', {
        hint: '--password <値> または環境変数 WFB_SITE_PASSWORD を使ってください。',
      })
    }
    return await callApi(cfg, `/v1/files/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: { accessMode: 'password', password },
    })
  },

  async unprotect(cfg, args) {
    const name = args._[0]
    if (!name) {
      throw new WfbError('パスワードを外すファイル名を指定してください')
    }
    return await callApi(cfg, `/v1/files/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: { accessMode: 'public' },
    })
  },

  async delete(cfg, args) {
    const name = args._[0]
    if (!name) {
      throw new WfbError('削除するファイル名またはフォルダ名を指定してください')
    }
    return await callApi(cfg, `/v1/files/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
  },

  async 'clear-token'(cfg) {
    // トークンキャッシュを空にする（失効直後などに使う）
    const path = tokenCachePath(cfg.base, cfg.clientId)
    await mkdir(tmpdir(), { recursive: true })
    await writeFile(path, '{}', { mode: 0o600 })
    return { cleared: true, path }
  },
}

const resolvePassword = (args) => {
  if (typeof args.password === 'string' && args.password.length > 0) {
    return args.password
  }
  if (args.password === true) {
    throw new WfbError('パスワードを指定してください', {
      hint: '--password <値> または環境変数 WFB_SITE_PASSWORD を使ってください。',
    })
  }
  const fromEnv = process.env.WFB_SITE_PASSWORD
  return fromEnv || undefined
}

const resolveAccessModeArgs = (args) => {
  const password = resolvePassword(args)
  if (args.public && password) {
    throw new WfbError('--public と --password は同時に指定できません')
  }
  if (args.public) return { accessMode: 'public' }
  if (password) return { accessMode: 'password', password }
  return {}
}

const parseArgs = (argv) => {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      args._.push(token)
      continue
    }
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      args[key] = true
    } else {
      args[key] = next
      i += 1
    }
  }
  return args
}

const usage = () => `使い方: node wfb.mjs <command> [options]

コマンド:
  whoami                                    トークンの所有ユーザーと許可スコープを表示
  list [--limit N] [--next TOKEN]           自分のアップロード済みアイテムを一覧表示
  upload <path> [--name NAME] [--overwrite] [--password PASS | --public]
                                            単一ファイルをアップロード。--password で保護
  upload-folder <dir> [--name NAME] [--overwrite]
                                            フォルダを一括アップロード（index.html 必須）
  protect <name> --password PASS            あとからパスワードをかける / 差し替える
  unprotect <name>                          パスワードを外して公開に戻す
  delete <name>                             ファイル名またはフォルダ名で削除
  clear-token                               ローカルのトークンキャッシュを破棄

必要な環境変数: WFB_API_BASE, WFB_CLIENT_ID, WFB_CLIENT_SECRET
パスワードは --password の代わりに WFB_SITE_PASSWORD でも渡せます
`

const main = async () => {
  const [command, ...rest] = process.argv.slice(2)
  if (!command || command === 'help' || command === '--help') {
    process.stdout.write(usage())
    return
  }

  const run = commands[command]
  if (!run) {
    process.stderr.write(`不明なコマンド: ${command}\n\n${usage()}`)
    process.exitCode = 2
    return
  }

  try {
    const result = await run(config(), parseArgs(rest))
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } catch (error) {
    if (error instanceof WfbError) {
      const code = error.code ? ` [${error.code}]` : ''
      const status = error.status ? ` (HTTP ${error.status})` : ''
      process.stderr.write(`エラー${status}${code}: ${error.message}\n`)
      if (error.hint) process.stderr.write(`ヒント: ${error.hint}\n`)
    } else {
      process.stderr.write(`予期しないエラー: ${error.message}\n`)
    }
    process.exitCode = 1
  }
}

await main()
