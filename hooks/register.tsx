import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Spotify } from '../types'
import type { Host } from './host'
import { errorText } from './lib/format'
import { parseSpotifyTarget } from './lib/music'
import { controlSpotify, coverArt, currentTrack, findTracks, playOrSearch, playSpotifyLink, spotifyConfigFrom, type SpotifyConfig } from './services/music'
import { musicView, type MusicActions } from './ui/music'

const PANE = 'spotify-claude-code-mod'
const PANE_TITLE = 'Spotify'
const REFRESH_MS = 15000
const TRANSPORT_WORDS = ['play', 'pause', 'next', 'prev', 'shuffle', 'repeat']

// The engine reads plugin and key as literals, so they stay spelled out.
const nowPlaying = atom({ plugin: 'spotify-claude-code-mod', key: 'nowPlaying' } as const, null)
const note = atom({ plugin: 'spotify-claude-code-mod', key: 'note' } as const, null)
const cover = atom({ plugin: 'spotify-claude-code-mod', key: 'cover' } as const, null)

// The one place `$` becomes the services' Host.
function hostOf($: EngineInterface): Host {
  return {
    run: (argv, init) => $.process.run(argv, init),
    fetch: (url, init) => $.http.fetch(url, init),
    readBase64: async path => (await $.fs.read(path, { as: 'bytes' })).base64,
  }
}

async function refresh($: EngineInterface): Promise<void> {
  const host = hostOf($)
  const next = await currentTrack(host)
  await update($, nowPlaying, () => next)

  // The cover is fetched once per picture, not on every refresh.
  const url = next?.artworkUrl ?? null
  if (url === ((await read($, cover))?.url ?? null)) return
  const png = url ? await coverArt(host, url).catch(() => null) : null
  await update($, cover, () => (url && png ? { url, png } : null))
}

// What other plugins get as `$.spotify`: the same services the pane uses, so there is one implementation.
function spotifyOf(host: Host, config: SpotifyConfig | null): Spotify {
  return {
    current: () => currentTrack(host),
    control: action => controlSpotify(host, action),
    playLink: link => playSpotifyLink(host, link),
    find: query => findTracks(host, config, query),
    cover: url => coverArt(host, url),
  }
}

// One action: a short note while it runs, the outcome when it is done.
async function act($: EngineInterface, task: (host: Host) => Promise<string>): Promise<string> {
  await update($, note, () => 'Spotify…')
  const text = await task(hostOf($)).catch(error => `Spotify did not answer: ${errorText(error)}`)
  await update($, note, () => text)
  await refresh($)

  return text
}

async function isShown($: EngineInterface): Promise<boolean> {
  return (await $.ui.panes()).some(pane => pane.id === PANE && pane.isShown)
}

function actionsOf($: EngineInterface, config: SpotifyConfig | null): MusicActions {
  return {
    refresh: () => refresh($),
    transport: async action => void (await act($, host => controlSpotify(host, action))),
    search: async () => {
      const query = (await $.ui.ask('What should Spotify play? Pick one, or type a search or a Spotify link under Other.', { options: ['lo-fi beats', 'deep focus'], header: 'Spotify' })).trim()
      if (!query) return
      if (parseSpotifyTarget(query)) return void (await act($, host => playSpotifyLink(host, query)))
      await act($, async host => {
        const { tracks, problem } = await findTracks(host, config, query)
        if (!tracks.length) return problem ?? 'No track found.'
        const options = tracks.map(track => track.label)
        const choice = options.length > 1 ? (await $.ui.ask('Which one?', { options, header: 'Spotify' })).trim() : (options[0] ?? '')
        const picked = tracks.find(track => track.label === choice)

        return picked ? playSpotifyLink(host, picked.uri) : 'Nothing was played.'
      })
    },
  }
}

export const register: Register = (on, options) => {
  const config = spotifyConfigFrom(options)

  on('engine.create', async (_, e, next) => {
    const built = await next(e)
    // The engine only lets `built` be called in place, so the host is spelled out here rather than via hostOf.
    const host: Host = {
      run: (argv, init) => built.process.run(argv, init),
      fetch: (url, init) => built.http.fetch(url, init),
      readBase64: async path => (await built.fs.read(path, { as: 'bytes' })).base64,
    }

    return { ...built, spotify: spotifyOf(host, config) }
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'spotify', description: 'Open the Spotify pane, or: spotify <play|pause|next|prev|shuffle|repeat|link|search words>' })
    void refresh($)
    $.clock.every(REFRESH_MS, () => void refresh($))

    return next(e)
  })

  on('command.run', { command: 'spotify' }, async ($, e) => {
    const arg = e.args.trim()
    if (!arg) {
      if (await isShown($)) {
        await $.ui.close({ id: PANE })

        return { text: 'Spotify pane closed.' }
      }
      await $.ui.open({ id: PANE, title: PANE_TITLE, focus: true })

      return { text: 'Spotify pane opened.' }
    }
    if (TRANSPORT_WORDS.includes(arg)) return { text: await act($, host => controlSpotify(host, arg === 'play' ? 'resume' : arg)) }

    return { text: await act($, host => playOrSearch(host, config, arg)) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [track, art, text] = await Promise.all([read($, nowPlaying), read($, cover), read($, note)])

    return musicView($.ui.resolve(e), track, art?.png ?? null, text, actionsOf($, config), e.props.bodyColumns)
  })
}
