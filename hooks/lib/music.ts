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

// Each action is a few fixed lines that run inside `tell application "Spotify"`.
const TRANSPORT: Record<string, string[]> = {
  resume: ['play'],
  pause: ['pause'],
  next: ['next track'],
  prev: ['previous track'],
  shuffle: ['set shuffling to not shuffling'],
  repeat: ['set repeating to not repeating'],
  'volume-up': ['set level to (sound volume) + 10', 'if level > 100 then set level to 100', 'set sound volume to level'],
  'volume-down': ['set level to (sound volume) - 10', 'if level < 0 then set level to 0', 'set sound volume to level'],
}

function script(lines: string[], ...args: string[]): string[] {
  return ['osascript', ...lines.flatMap(line => ['-e', line]), ...args]
}

// Prints "closed" instead of launching Spotify when it is not running.
export function transportArgv(action: string): string[] | null {
  if (!Object.hasOwn(TRANSPORT, action)) return null

  return script([
    'if application "Spotify" is not running then return "closed"',
    'tell application "Spotify"',
    ...(TRANSPORT[action] ?? []),
    'end tell',
    'return "ok"',
  ])
}

export function playArgv(target: SpotifyTarget): string[] {
  return script(
    [
      'on run argv',
      'set trackUri to item 1 of argv',
      'if application "Spotify" is not running then return "closed"',
      'tell application "Spotify" to play track trackUri',
      'return "ok"',
      'end run',
    ],
    target.uri,
  )
}

// One line of fields split by the ASCII unit separator, which no title or artist can contain.
const FIELDS = 11
const SEPARATOR = '\u001f'

export function statusArgv(): string[] {
  return script([
    'if application "Spotify" is not running then return ""',
    'tell application "Spotify"',
    'if player state is stopped then return ""',
    'set sep to character id 31',
    'set song to current track',
    'set art to ""',
    'try',
    'set art to artwork url of song',
    'end try',
    'return (name of song) & sep & (artist of song) & sep & (album of song) & sep & (player state as text) & sep & (((player position) as integer) as text) & sep & (((duration of song) div 1000) as text) & sep & (sound volume as text) & sep & (shuffling as text) & sep & (repeating as text) & sep & art & sep & (spotify url of song)',
    'end tell',
  ])
}

const ARTWORK = /^https:\/\/i\.scdn\.co\/image\/[a-f0-9]{40}$/

function whole(value: string | undefined, max: number): number {
  return value && /^\d{1,7}$/.test(value.trim()) ? Math.min(Number(value), max) : 0
}

// The page for a track, rebuilt from the validated id rather than echoed back.
export function webLink(target: SpotifyTarget): string {
  return `https://open.spotify.com/${target.kind}/${target.uri.slice(target.uri.lastIndexOf(':') + 1)}`
}

export function parseTrack(stdout: string): NowPlaying | null {
  const fields = stdout.trim().split(SEPARATOR)
  if (fields.length !== FIELDS) return null
  const title = text(fields[0], '')
  if (!title) return null
  const target = parseSpotifyTarget(fields[10] ?? '')
  const artwork = (fields[9] ?? '').trim()

  return {
    title,
    artist: text(fields[1], 'Spotify'),
    album: text(fields[2], ''),
    isPlaying: fields[3]?.trim() === 'playing',
    positionSec: whole(fields[4], 359999),
    durationSec: whole(fields[5], 359999),
    volume: whole(fields[6], 100),
    isShuffling: fields[7]?.trim() === 'true',
    isRepeating: fields[8]?.trim() === 'true',
    artworkUrl: ARTWORK.test(artwork) ? artwork : null,
    url: target?.kind === 'track' ? webLink(target) : null,
  }
}

// Album art: fetched with fixed commands into a private temp folder, shrunk to a small PNG, then removed.
// Only a validated Spotify image link and a folder the system just made ever reach these arguments.
const TEMP_DIR = /^\/[\w./-]*\/tmp\.[A-Za-z0-9]{6,12}$/

// Only kitty and Ghostty draw pictures, so nothing is downloaded for any other terminal.
export function drawsImages(termProgram: string, term: string): boolean {
  return /ghostty/i.test(termProgram) || /kitty|ghostty/i.test(term)
}

export function mktempArgv(): string[] {
  return ['mktemp', '-d']
}

export function tempDirOf(stdout: string): string | null {
  const dir = stdout.trim()

  return TEMP_DIR.test(dir) && !dir.includes('..') ? dir : null
}

export function fetchArtArgv(url: string, dir: string): string[] | null {
  return ARTWORK.test(url) ? ['curl', '--fail', '--silent', '--max-time', '10', '--max-filesize', '2000000', '--output', `${dir}/cover.jpg`, url] : null
}

export function shrinkArtArgv(dir: string): string[] {
  return ['sips', '-s', 'format', 'png', '-Z', '200', `${dir}/cover.jpg`, '--out', `${dir}/cover.png`]
}

export function artPath(dir: string): string {
  return `${dir}/cover.png`
}

export function cleanupArgv(dir: string): string[] {
  return ['rm', '-r', dir]
}

export function searchQuery(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
}

export function searchUrl(query: string): string {
  return `https://api.spotify.com/v1/search?type=track&limit=4&q=${encodeURIComponent(query)}`
}

export function accessTokenOf(body: unknown): string | null {
  const token = (body as { access_token?: unknown } | null)?.access_token

  return typeof token === 'string' && /^[\w.~+/-]+=*$/.test(token) ? token : null
}

export type FoundTrack = { uri: string; label: string }

type SearchItem = { uri?: unknown; name?: unknown; artists?: { name?: unknown }[] }

// The hits worth offering: each URI is checked like any other link, so a bad response cannot reach a script.
export function tracksOf(body: unknown): FoundTrack[] {
  const items = (body as { tracks?: { items?: unknown } } | null)?.tracks?.items
  if (!Array.isArray(items)) return []

  return items.slice(0, 4).flatMap((item: SearchItem) => {
    const target = typeof item?.uri === 'string' ? parseSpotifyTarget(item.uri) : null
    if (target?.kind !== 'track') return []
    const artists = Array.isArray(item.artists) ? item.artists.map(artist => text(artist?.name, '')).filter(Boolean) : []

    return [{ uri: target.uri, label: text(artists.length ? `${text(item.name, 'Track')} - ${artists.join(', ')}` : item.name, 'Track').slice(0, 70) }]
  })
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
