import { describe, expect, test } from 'claude-code/testing'

import { accessTokenOf, basicAuth, firstTrackOf, parseSpotifyTarget, parseTrack, playArgv, searchQuery, statusArgv, transportArgv } from '../hooks/lib/music'

describe('spotify control', () => {
  const ID = '0VjIjW4GlUZAMYd2vXMi3b'

  test('accepts only real Spotify URIs and links', () => {
    expect(parseSpotifyTarget(`spotify:track:${ID}`)).toEqual({ kind: 'track', uri: `spotify:track:${ID}` })
    expect(parseSpotifyTarget(`  https://open.spotify.com/intl-es/album/${ID}?si=abc `)).toEqual({ kind: 'album', uri: `spotify:album:${ID}` })
    for (const bad of [
      '',
      ID,
      `spotify:track:${ID}x`,
      `spotify:user:${ID}`,
      `spotify:track:${ID}" & (do shell script "id") & "`,
      `http://open.spotify.com/track/${ID}`,
      `https://open.spotify.com.evil.test/track/${ID}`,
      `https://evil.test/https://open.spotify.com/track/${ID}`,
    ]) {
      expect(parseSpotifyTarget(bad)).toBeNull()
    }
  })

  test('the link travels as an argument, never inside the script text', () => {
    const argv = playArgv({ kind: 'track', uri: `spotify:track:${ID}` })
    expect(argv[0]).toBe('osascript')
    expect(argv[argv.length - 1]).toBe(`spotify:track:${ID}`)
    expect(argv.slice(0, -1).join('\n')).not.toContain(ID)
  })

  test('transport actions come from a fixed list', () => {
    expect(transportArgv('pause')?.join(' ')).toContain('tell application "Spotify" to pause')
    expect(transportArgv('next')?.join(' ')).toContain('next track')
    for (const bad of ['', 'play"; do shell script "id', 'constructor', '__proto__', 'toString']) {
      expect(transportArgv(bad)).toBeNull()
    }
  })

  test('no script launches Spotify when it is closed', () => {
    for (const argv of [transportArgv('pause'), playArgv({ kind: 'track', uri: `spotify:track:${ID}` }), statusArgv()]) {
      expect(argv?.join('\n')).toContain('is not running then return')
    }
  })

  test('reads the track and treats it as untrusted text', () => {
    expect(parseTrack('Weightless\nMarconi Union\nplaying')).toEqual({ title: 'Weightless', artist: 'Marconi Union', isPlaying: true })
    expect(parseTrack('Weightless\nMarconi Union\npaused')?.isPlaying).toBe(false)
    expect(parseTrack('a\u001b[31mb\n\nplaying')).toEqual({ title: 'a [31mb', artist: 'Spotify', isPlaying: true })
    expect(parseTrack('')).toBeNull()
    expect(parseTrack('only a title')).toBeNull()
  })

  test('cleans a search query', () => {
    expect(searchQuery('  leo\u0000   middea\n')).toBe('leo middea')
    expect(searchQuery('x'.repeat(300))).toHaveLength(100)
  })

  test('takes the first hit only when it is a real track URI', () => {
    const hit = (uri: unknown) => ({ tracks: { items: [{ uri }] } })
    expect(firstTrackOf(hit(`spotify:track:${ID}`))).toEqual({ kind: 'track', uri: `spotify:track:${ID}` })
    expect(firstTrackOf(hit(`spotify:album:${ID}`))).toBeNull()
    expect(firstTrackOf(hit('spotify:track:" & (do shell script "id") & "'))).toBeNull()
    expect(firstTrackOf(hit(7))).toBeNull()
    expect(firstTrackOf({ tracks: { items: [] } })).toBeNull()
    expect(firstTrackOf(null)).toBeNull()
  })

  test('accepts only a well-formed access token', () => {
    expect(accessTokenOf({ access_token: 'BQD-abc_123.xyz' })).toBe('BQD-abc_123.xyz')
    expect(accessTokenOf({ access_token: 'bad token\r\nX-Evil: 1' })).toBeNull()
    expect(accessTokenOf({ access_token: 5 })).toBeNull()
    expect(accessTokenOf(null)).toBeNull()
  })

  test('builds Basic credentials the standard way', () => {
    expect(basicAuth('a', 'b')).toBe('Basic YTpi')
    expect(basicAuth('Aladdin', 'open sesame')).toBe('Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==')
    expect(basicAuth('ab', 'c')).toBe('Basic YWI6Yw==')
  })
})
