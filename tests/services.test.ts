import type { HttpInit, HttpResponse } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

import type { Host } from '../hooks/host'
import { controlSpotify, coverArt, currentTrack, findTracks, playOrSearch, playSpotifyLink, searchAndPlay, spotifyConfigFrom, type SpotifyConfig } from '../hooks/services/music'

type Fake = {
  http?: (url: string, init?: HttpInit) => unknown
  osascript?: (argv: string[]) => { exitCode?: number; stdout?: string }
}

function respond(body: unknown, status = 200): HttpResponse {
  return { status, ok: status < 300, headers: {}, text: JSON.stringify(body) }
}

function fakeHost(fake: Fake = {}) {
  const requests: { url: string; method: string }[] = []
  const sent: HttpInit[] = []
  const scripts: string[][] = []
  const reads: string[] = []
  const host: Host = {
    run: async argv => {
      scripts.push([...argv])
      const out = fake.osascript?.([...argv])

      return { exitCode: out?.exitCode ?? 0, stdout: out?.stdout ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
    },
    fetch: async (url, init) => {
      requests.push({ url, method: init?.method ?? 'GET' })
      sent.push(init ?? {})

      return respond(fake.http?.(url, init) ?? null)
    },
    readBase64: async path => {
      reads.push(path)

      return 'UE5H'
    },
  }

  return { host, requests, sent, scripts, reads }
}

describe('spotify service', () => {
  const ID = '0VjIjW4GlUZAMYd2vXMi3b'
  const SPOTIFY: SpotifyConfig = { id: 'client-id', secret: 'client-secret' }
  const spotifyServer = (url: string) =>
    url.includes('/api/token') ? { access_token: 'tok-123' } : { tracks: { items: [{ uri: `spotify:track:${ID}`, name: 'Song', artists: [{ name: 'Artist' }] }] } }

  test('reads the credentials from the plugin options, both or neither', () => {
    expect(spotifyConfigFrom({ spotify_client_id: ' id ', spotify_client_secret: ' secret ' })).toEqual({ id: 'id', secret: 'secret' })
    expect(spotifyConfigFrom({ spotify_client_id: 'id' })).toBeNull()
    expect(spotifyConfigFrom({ spotify_client_secret: 5 })).toBeNull()
  })

  test('runs a fixed transport script with no shell', async () => {
    const { host, scripts } = fakeHost({ osascript: () => ({ stdout: 'ok' }) })
    expect(await controlSpotify(host, 'pause')).toBe('Done.')
    expect(scripts).toHaveLength(1)
    expect(scripts[0]?.[0]).toBe('osascript')
  })

  test('rejects an unknown action without running anything', async () => {
    const { host, scripts } = fakeHost()
    expect(await controlSpotify(host, 'rm -rf /')).toContain('Unknown Spotify action')
    expect(scripts).toHaveLength(0)
  })

  test('says so when Spotify is closed or does not answer', async () => {
    expect(await controlSpotify(fakeHost({ osascript: () => ({ stdout: 'closed' }) }).host, 'next')).toContain('not running')
    expect(await controlSpotify(fakeHost({ osascript: () => ({ exitCode: 1 }) }).host, 'next')).toContain('did not answer')
  })

  test('plays a link only after it passes the check', async () => {
    const { host, scripts } = fakeHost({ osascript: () => ({ stdout: 'ok' }) })
    expect(await playSpotifyLink(host, `https://open.spotify.com/track/${ID}?si=1`)).toBe('Playing track.')
    expect(scripts[0]?.at(-1)).toBe(`spotify:track:${ID}`)
    expect(await playSpotifyLink(host, `spotify:track:${ID}" & (do shell script "id") & "`)).toContain('not a Spotify link')
    expect(scripts).toHaveLength(1)
  })

  test('shows what is playing', async () => {
    const line = ['Weightless', 'Marconi Union', 'Album', 'playing', '65', '480', '70', 'false', 'true', '', `spotify:track:${ID}`].join('\u001f')
    const { host } = fakeHost({ osascript: () => ({ stdout: line }) })
    expect(await currentTrack(host)).toEqual({
      title: 'Weightless',
      artist: 'Marconi Union',
      album: 'Album',
      isPlaying: true,
      positionSec: 65,
      durationSec: 480,
      volume: 70,
      isShuffling: false,
      isRepeating: true,
      artworkUrl: null,
      url: `https://open.spotify.com/track/${ID}`,
    })
    expect(await currentTrack(fakeHost({ osascript: () => ({ stdout: '' }) }).host)).toBeNull()
  })

  test('searches, then plays the first hit', async () => {
    const { host, requests, sent, scripts } = fakeHost({ http: spotifyServer, osascript: () => ({ stdout: 'ok' }) })
    expect(await searchAndPlay(host, SPOTIFY, 'leo middea')).toBe('Playing track.')
    expect(requests.map(request => request.method)).toEqual(['POST', 'GET'])
    expect(requests.every(request => request.url.startsWith('https://'))).toBe(true)
    expect(sent[0]?.headers?.Authorization).toMatch(/^Basic /)
    expect(requests[1]?.url).toContain('q=leo%20middea')
    expect(sent[1]?.headers?.Authorization).toBe('Bearer tok-123')
    expect(scripts[0]?.at(-1)).toBe(`spotify:track:${ID}`)
  })

  test('never lets the secret reach a note, a script or the search request', async () => {
    const { host, requests, scripts } = fakeHost({ http: spotifyServer, osascript: () => ({ stdout: 'ok' }) })
    const note = await searchAndPlay(host, SPOTIFY, 'leo middea')
    expect(note).not.toContain(SPOTIFY.secret)
    expect(JSON.stringify(scripts)).not.toContain(SPOTIFY.secret)
    expect(requests[1]?.url).not.toContain(SPOTIFY.secret)
  })

  test('explains a missing setup, a refused login and an empty result', async () => {
    expect(await searchAndPlay(fakeHost().host, null, 'x')).toContain('plugin settings')
    expect(await searchAndPlay(fakeHost().host, SPOTIFY, '   ')).toContain('Type something')
    const refused = fakeHost({ http: () => ({ error: 'invalid_client' }) })
    refused.host.fetch = async () => respond({ error: 'invalid_client' }, 400)
    expect(await searchAndPlay(refused.host, SPOTIFY, 'x')).toContain('refused')
    const empty = fakeHost({ http: url => (url.includes('/api/token') ? { access_token: 'tok' } : { tracks: { items: [] } }) })
    expect(await searchAndPlay(empty.host, SPOTIFY, 'zzzz')).toContain('No track found')
  })

  test('plays a pasted link without searching, and searches for anything else', async () => {
    const link = fakeHost({ http: spotifyServer, osascript: () => ({ stdout: 'ok' }) })
    expect(await playOrSearch(link.host, SPOTIFY, `https://open.spotify.com/track/${ID}`)).toBe('Playing track.')
    expect(link.requests).toHaveLength(0)
    const words = fakeHost({ http: spotifyServer, osascript: () => ({ stdout: 'ok' }) })
    expect(await playOrSearch(words.host, SPOTIFY, 'leo middea')).toBe('Playing track.')
    expect(words.requests).toHaveLength(2)
  })

  test('lists the hits for the pane to choose from, without playing any', async () => {
    const { host, scripts } = fakeHost({ http: spotifyServer })
    expect(await findTracks(host, SPOTIFY, 'leo middea')).toEqual({ tracks: [{ uri: `spotify:track:${ID}`, label: 'Song - Artist' }], problem: null })
    expect(scripts).toHaveLength(0)
    expect((await findTracks(host, null, 'x')).problem).toContain('plugin settings')
  })

  test('fetches the cover only in a terminal that draws it, and always cleans up', async () => {
    const DIR = '/var/folders/ab/cd/T/tmp.AbC123'
    const url = 'https://i.scdn.co/image/' + 'a'.repeat(40)
    const answer = (term: string) => (argv: string[]) => ({
      stdout: argv[0] === 'mktemp' ? DIR : argv[0] === 'printenv' ? (argv[1] === 'TERM' ? term : '') : '',
    })

    const kitty = fakeHost({ osascript: answer('xterm-kitty') })
    expect(await coverArt(kitty.host, url)).toBe('UE5H')
    expect(kitty.reads).toEqual([`${DIR}/cover.png`])
    expect(kitty.scripts.map(argv => argv[0])).toEqual(['printenv', 'printenv', 'mktemp', 'curl', 'sips', 'rm'])

    const plain = fakeHost({ osascript: answer('xterm-256color') })
    expect(await coverArt(plain.host, url)).toBeNull()
    expect(plain.scripts.map(argv => argv[0])).toEqual(['printenv', 'printenv'])

    const failing = fakeHost({ osascript: argv => (argv[0] === 'curl' ? { exitCode: 22 } : answer('xterm-kitty')(argv)) })
    expect(await coverArt(failing.host, url)).toBeNull()
    expect(failing.scripts.at(-1)).toEqual(['rm', '-r', DIR])
    expect(failing.reads).toEqual([])
  })

  test('refuses a poisoned search result without running a script', async () => {
    const { host, scripts } = fakeHost({
      http: url => (url.includes('/api/token') ? { access_token: 'tok' } : { tracks: { items: [{ uri: 'spotify:track:" & (do shell script "id") & "' }] } }),
    })
    expect(await searchAndPlay(host, SPOTIFY, 'x')).toContain('No track found')
    expect(scripts).toHaveLength(0)
  })
})
