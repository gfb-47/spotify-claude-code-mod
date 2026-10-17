import { describe, expect, test } from 'claude-code/testing'

import {
  accessTokenOf,
  basicAuth,
  drawsImages,
  fetchArtArgv,
  parseSpotifyTarget,
  parseTrack,
  playArgv,
  searchQuery,
  searchUrl,
  statusArgv,
  tempDirOf,
  tracksOf,
  transportArgv,
} from '../hooks/lib/music'

describe('spotify control', () => {
  const ID = '0VjIjW4GlUZAMYd2vXMi3b'
  const ART = 'ab67616d00001e02'.padEnd(40, 'a')
  const SEP = '\u001f'
  // A whole status line, with any field swapped by its position.
  const status = (over: Record<number, string> = {}) =>
    [
      'Weightless',
      'Marconi Union',
      'Weightless',
      'playing',
      '65',
      '480',
      '70',
      'true',
      'false',
      `https://i.scdn.co/image/${ART}`,
      `spotify:track:${ID}`,
    ]
      .map((value, at) => over[at] ?? value)
      .join(SEP)

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
    expect(transportArgv('pause')?.join(' ')).toContain('pause')
    expect(transportArgv('next')?.join(' ')).toContain('next track')
    expect(transportArgv('shuffle')?.join(' ')).toContain('set shuffling to not shuffling')
    expect(transportArgv('repeat')?.join(' ')).toContain('set repeating to not repeating')
    expect(transportArgv('volume-up')?.join(' ')).toContain('if level > 100 then set level to 100')
    expect(transportArgv('volume-down')?.join(' ')).toContain('if level < 0 then set level to 0')
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
    expect(parseTrack(status())).toEqual({
      title: 'Weightless',
      artist: 'Marconi Union',
      album: 'Weightless',
      isPlaying: true,
      positionSec: 65,
      durationSec: 480,
      volume: 70,
      isShuffling: true,
      isRepeating: false,
      artworkUrl: `https://i.scdn.co/image/${ART}`,
      url: `https://open.spotify.com/track/${ID}`,
    })
    expect(parseTrack(status({ 3: 'paused' }))?.isPlaying).toBe(false)
    expect(parseTrack(status({ 0: 'a\u001b[31mb', 1: '' }))).toMatchObject({ title: 'a [31mb', artist: 'Spotify' })
    expect(parseTrack('')).toBeNull()
    expect(parseTrack('only a title')).toBeNull()
    expect(parseTrack(`${status()}${SEP}extra`)).toBeNull()
  })

  test('drops pictures and links that are not Spotify', () => {
    const track = parseTrack(status({ 9: 'https://evil.test/image/x', 10: 'spotify:ad:1234' }))
    expect(track?.artworkUrl).toBeNull()
    expect(track?.url).toBeNull()
    expect(parseTrack(status({ 4: '12.5', 6: '9999' }))).toMatchObject({ positionSec: 0, volume: 100 })
  })

  test('the status script asks for every field and never launches Spotify', () => {
    const script = statusArgv().join('\n')
    expect(script).not.toContain('round')
    for (const field of ['album of song', 'player position', 'sound volume', 'shuffling', 'repeating', 'spotify url']) {
      expect(script).toContain(field)
    }
  })

  test('cleans a search query', () => {
    expect(searchQuery('  leo\u0000   middea\n')).toBe('leo middea')
    expect(searchQuery('x'.repeat(300))).toHaveLength(100)
  })

  test('offers at most four hits, and only real track URIs', () => {
    const hit = (uri: unknown, name = 'Song', artists = [{ name: 'Artist' }]) => ({ uri, name, artists })
    const found = tracksOf({ tracks: { items: [hit(`spotify:track:${ID}`), hit(`spotify:album:${ID}`), hit('spotify:track:" & (do shell script "id") & "'), hit(7)] } })
    expect(found).toEqual([{ uri: `spotify:track:${ID}`, label: 'Song - Artist' }])
    const many = Array.from({ length: 9 }, () => hit(`spotify:track:${ID}`))
    expect(tracksOf({ tracks: { items: many } })).toHaveLength(4)
    expect(tracksOf({ tracks: { items: [] } })).toEqual([])
    expect(tracksOf({ tracks: { items: 'nope' } })).toEqual([])
    expect(tracksOf(null)).toEqual([])
    expect(searchUrl('a b')).toContain('limit=4')
  })

  test('only fetches album art for a Spotify image into a system temp folder', () => {
    const url = `https://i.scdn.co/image/${ART}`
    expect(fetchArtArgv(url, '/var/folders/ab/cd/T/tmp.AbC123')?.at(-1)).toBe(url)
    expect(fetchArtArgv('https://evil.test/a.jpg', '/var/folders/ab/cd/T/tmp.AbC123')).toBeNull()
    expect(tempDirOf('/var/folders/ab/cd/T/tmp.AbC123\n')).toBe('/var/folders/ab/cd/T/tmp.AbC123')
    for (const bad of ['', '/', '/etc', '/var/folders/../tmp.AbC123', '/tmp/x; rm -rf ~/tmp.AbC123']) {
      expect(tempDirOf(bad)).toBeNull()
    }
  })

  test('draws pictures only in kitty and Ghostty', () => {
    expect(drawsImages('ghostty', 'xterm-ghostty')).toBe(true)
    expect(drawsImages('', 'xterm-kitty')).toBe(true)
    expect(drawsImages('Apple_Terminal', 'xterm-256color')).toBe(false)
    expect(drawsImages('', '')).toBe(false)
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
