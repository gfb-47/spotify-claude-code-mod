import type { NowPlaying } from '../../types'
import type { Host } from '../host'
import { parseJson } from '../lib/format'
import {
  accessTokenOf,
  artPath,
  basicAuth,
  cleanupArgv,
  drawsImages,
  fetchArtArgv,
  mktempArgv,
  parseSpotifyTarget,
  parseTrack,
  playArgv,
  searchQuery,
  searchUrl,
  shrinkArtArgv,
  statusArgv,
  tempDirOf,
  tracksOf,
  transportArgv,
  type FoundTrack,
} from '../lib/music'

export type SpotifyConfig = { id: string; secret: string }

const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const COMMAND_MS = 10000

// The secret only ever goes to Spotify's own https endpoints, and never into the store, a file or a note.
export function spotifyConfigFrom(options: Record<string, unknown>): SpotifyConfig | null {
  const id = typeof options.spotify_client_id === 'string' ? options.spotify_client_id.trim() : ''
  const secret = typeof options.spotify_client_secret === 'string' ? options.spotify_client_secret.trim() : ''

  return id && secret ? { id, secret } : null
}

async function command(host: Host, argv: string[]): Promise<string | null> {
  const result = await host.run(argv, { timeoutMs: COMMAND_MS }).catch(() => null)

  return result && result.exitCode === 0 ? result.stdout.trim() : null
}

function outcome(answer: string | null, done: string): string {
  if (answer === null) return 'Spotify did not answer. Is the desktop app installed, and is Claude Code allowed to control it?'

  return answer === 'closed' ? 'Spotify is not running. Open it first.' : done
}

export async function controlSpotify(host: Host, action: string): Promise<string> {
  const argv = transportArgv(action)
  if (!argv) return `Unknown Spotify action: ${action}`

  return outcome(await command(host, argv), 'Done.')
}

export async function playSpotifyLink(host: Host, raw: string): Promise<string> {
  const target = parseSpotifyTarget(raw)
  if (!target) return 'That is not a Spotify link or URI.'

  return outcome(await command(host, playArgv(target)), `Playing ${target.kind}.`)
}

export async function currentTrack(host: Host): Promise<NowPlaying | null> {
  const answer = await command(host, statusArgv())

  return answer ? parseTrack(answer) : null
}

// The cover as a small PNG (base64), or null when any step fails. The temp folder is always removed.
export async function coverArt(host: Host, url: string): Promise<string | null> {
  const [program, term] = await Promise.all([command(host, ['printenv', 'TERM_PROGRAM']), command(host, ['printenv', 'TERM'])])
  if (!drawsImages(program ?? '', term ?? '')) return null
  const dir = tempDirOf((await command(host, mktempArgv())) ?? '')
  const download = dir ? fetchArtArgv(url, dir) : null
  if (!dir || !download) return null

  try {
    if ((await command(host, download)) === null || (await command(host, shrinkArtArgv(dir))) === null) return null

    return await host.readBase64(artPath(dir))
  } catch {
    return null
  } finally {
    await command(host, cleanupArgv(dir))
  }
}

export type TrackSearch = { tracks: FoundTrack[]; problem: string | null }

// Looks the query up with Spotify's client-credentials flow (no user login).
export async function findTracks(host: Host, config: SpotifyConfig | null, raw: string): Promise<TrackSearch> {
  const query = searchQuery(raw)
  if (!query) return { tracks: [], problem: 'Type something to search for.' }
  if (!config) return { tracks: [], problem: 'Add a Spotify client id and secret in the plugin settings to search.' }

  const token = await host.fetch(TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: basicAuth(config.id, config.secret), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const accessToken = token.ok ? accessTokenOf(parseJson(token.text)) : null
  if (!accessToken) return { tracks: [], problem: `Spotify refused the client id and secret (${token.status}).` }

  const found = await host.fetch(searchUrl(query), { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!found.ok) return { tracks: [], problem: `Spotify search failed (${found.status}).` }
  const tracks = tracksOf(parseJson(found.text))

  return { tracks, problem: tracks.length ? null : `No track found for "${query}".` }
}

// The slash command's search: plays the first hit.
export async function searchAndPlay(host: Host, config: SpotifyConfig | null, raw: string): Promise<string> {
  const { tracks, problem } = await findTracks(host, config, raw)

  return tracks[0] ? playSpotifyLink(host, tracks[0].uri) : (problem ?? 'No track found.')
}

// What the Search box does: a pasted Spotify link plays as is, anything else is searched for.
export async function playOrSearch(host: Host, config: SpotifyConfig | null, raw: string): Promise<string> {
  return parseSpotifyTarget(raw) ? playSpotifyLink(host, raw) : searchAndPlay(host, config, raw)
}
