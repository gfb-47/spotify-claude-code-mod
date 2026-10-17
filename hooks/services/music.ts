import type { NowPlaying } from '../../types'
import type { Host } from '../host'
import { parseJson } from '../lib/format'
import { accessTokenOf, basicAuth, firstTrackOf, parseSpotifyTarget, parseTrack, playArgv, searchQuery, searchUrl, statusArgv, transportArgv } from '../lib/music'

export type SpotifyConfig = { id: string; secret: string }

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const OSASCRIPT_MS = 10000

// The secret only ever goes to Spotify's own https endpoints, and never into the store, a file or a note.
export function spotifyConfigFrom(options: Record<string, unknown>): SpotifyConfig | null {
  const id = typeof options.spotify_client_id === 'string' ? options.spotify_client_id.trim() : ''
  const secret = typeof options.spotify_client_secret === 'string' ? options.spotify_client_secret.trim() : ''

  return id && secret ? { id, secret } : null
}

async function osascript(host: Host, argv: string[]): Promise<string | null> {
  const result = await host.run(argv, { timeoutMs: OSASCRIPT_MS }).catch(() => null)

  return result && result.exitCode === 0 ? result.stdout.trim() : null
}

function outcome(answer: string | null, done: string): string {
  if (answer === null) return 'Spotify did not answer. Is the desktop app installed, and is Claude Code allowed to control it?'

  return answer === 'closed' ? 'Spotify is not running. Open it first.' : done
}

export async function controlSpotify(host: Host, action: string): Promise<string> {
  const argv = transportArgv(action)
  if (!argv) return `Unknown Spotify action: ${action}`

  return outcome(await osascript(host, argv), 'Done.')
}

export async function playSpotifyLink(host: Host, raw: string): Promise<string> {
  const target = parseSpotifyTarget(raw)
  if (!target) return 'That is not a Spotify link or URI.'

  return outcome(await osascript(host, playArgv(target)), `Playing ${target.kind}.`)
}

export async function currentTrack(host: Host): Promise<NowPlaying | null> {
  const answer = await osascript(host, statusArgv())

  return answer ? parseTrack(answer) : null
}

// Looks the query up with Spotify's client-credentials flow (no user login) and plays the first hit.
export async function searchAndPlay(host: Host, config: SpotifyConfig | null, raw: string): Promise<string> {
  const query = searchQuery(raw)
  if (!query) return 'Type something to search for.'
  if (!config) return 'Add a Spotify client id and secret in the plugin settings to search.'

  const token = await host.fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(config.id, config.secret), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const accessToken = token.ok ? accessTokenOf(parseJson(token.text)) : null
  if (!accessToken) return `Spotify refused the client id and secret (${token.status}).`

  const found = await host.fetch(searchUrl(query), { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!found.ok) return `Spotify search failed (${found.status}).`
  const target = firstTrackOf(parseJson(found.text))

  return target ? playSpotifyLink(host, target.uri) : `No track found for "${query}".`
}

// What the Search box does: a pasted Spotify link plays as is, anything else is searched for.
export async function playOrSearch(host: Host, config: SpotifyConfig | null, raw: string): Promise<string> {
  return parseSpotifyTarget(raw) ? playSpotifyLink(host, raw) : searchAndPlay(host, config, raw)
}
