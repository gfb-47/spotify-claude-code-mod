import type { NowPlaying } from '../../types'

// Spotify's catalogue is outside this mod, so titles and artists are shown as text only.
function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) : fallback
}

// Driving the Spotify desktop app with osascript. Nothing a person, a file or a web response says is
// ever pasted into a script: the scripts below are fixed text, and the one thing that varies (a Spotify
// URI) travels as an argument that AppleScript reads as data.
export type SpotifyTarget = { kind: string; uri: string }

const KINDS = 'track|album|playlist|artist|episode'
const URI = new RegExp(`^spotify:(${KINDS}):([A-Za-z0-9]{22})$`)
const LINK = new RegExp(`^https://open\\.spotify\\.com/(?:intl-[a-z]{2}/)?(${KINDS})/([A-Za-z0-9]{22})(?:[?#].*)?$`)

// Accepts a Spotify URI or an open.spotify.com link and nothing else; the id is rebuilt from the match.
export function parseSpotifyTarget(raw: string): SpotifyTarget | null {
  const match = URI.exec(raw.trim()) ?? LINK.exec(raw.trim())
  const kind = match?.[1]
  const id = match?.[2]

  return kind && id ? { kind, uri: `spotify:${kind}:${id}` } : null
}

const TRANSPORT: Record<string, string> = {
  resume: 'play',
  pause: 'pause',
  next: 'next track',
  prev: 'previous track',
}

function script(lines: string[], ...args: string[]): string[] {
  return ['osascript', ...lines.flatMap(line => ['-e', line]), ...args]
}

// Prints "closed" instead of launching Spotify when it is not running.
export function transportArgv(action: string): string[] | null {
  if (!Object.hasOwn(TRANSPORT, action)) return null

  return script([
    'if application "Spotify" is not running then return "closed"',
    `tell application "Spotify" to ${TRANSPORT[action]}`,
    'return "ok"',
  ])
}

export function playArgv(target: SpotifyTarget): string[] {
  return script(
    [
      'on run argv',
      'if application "Spotify" is not running then return "closed"',
      'tell application "Spotify" to play track (item 1 of argv)',
      'return "ok"',
      'end run',
    ],
    target.uri,
  )
}

export function statusArgv(): string[] {
  return script([
    'if application "Spotify" is not running then return ""',
    'tell application "Spotify"',
    'if player state is stopped then return ""',
    'return (name of current track) & linefeed & (artist of current track) & linefeed & (player state as text)',
    'end tell',
  ])
}

export function parseTrack(stdout: string): NowPlaying | null {
  const lines = stdout.trim().split('\n')
  if (lines.length < 3) return null
  const title = text(lines[0], '')

  return title ? { title, artist: text(lines.slice(1, -1).join(' '), 'Spotify'), isPlaying: lines[lines.length - 1]?.trim() === 'playing' } : null
}

export function searchQuery(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
}

export function searchUrl(query: string): string {
  return `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(query)}`
}

export function accessTokenOf(body: unknown): string | null {
  const token = (body as { access_token?: unknown } | null)?.access_token

  return typeof token === 'string' && /^[\w.~+/-]+=*$/.test(token) ? token : null
}

// The first hit's URI, checked like any other link so a bad response cannot reach a script.
export function firstTrackOf(body: unknown): SpotifyTarget | null {
  const uri = (body as { tracks?: { items?: { uri?: unknown }[] } } | null)?.tracks?.items?.[0]?.uri
  const target = typeof uri === 'string' ? parseSpotifyTarget(uri) : null

  return target?.kind === 'track' ? target : null
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// HTTP Basic credentials for Spotify's token endpoint. Ids and secrets are ASCII, so bytes are char codes.
export function basicAuth(id: string, secret: string): string {
  const bytes = Array.from(`${id}:${secret}`, char => char.charCodeAt(0) & 255)
  let out = ''
  for (let at = 0; at < bytes.length; at += 3) {
    const n = ((bytes[at] ?? 0) << 16) | ((bytes[at + 1] ?? 0) << 8) | (bytes[at + 2] ?? 0)
    out += BASE64.charAt((n >> 18) & 63) + BASE64.charAt((n >> 12) & 63)
    out += at + 1 < bytes.length ? BASE64.charAt((n >> 6) & 63) : '='
    out += at + 2 < bytes.length ? BASE64.charAt(n & 63) : '='
  }

  return `Basic ${out}`
}
