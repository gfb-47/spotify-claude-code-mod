import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Host } from './host'
import { errorText } from './lib/format'
import { controlSpotify, currentTrack, playOrSearch, spotifyConfigFrom, type SpotifyConfig } from './services/music'
import { musicView, type MusicActions } from './ui/music'

const PANE = 'spotify-control'
const PANE_TITLE = 'Spotify'
const REFRESH_MS = 15000
const TRANSPORT_WORDS = ['play', 'pause', 'next', 'prev']

// The engine reads plugin and key as literals, so they stay spelled out.
const nowPlaying = atom({ plugin: 'spotify-control', key: 'nowPlaying' } as const, null)
const note = atom({ plugin: 'spotify-control', key: 'note' } as const, null)

// The one place `$` becomes the services' Host.
function hostOf($: EngineInterface): Host {
  return {
    run: (argv, init) => $.process.run(argv, init),
    fetch: (url, init) => $.http.fetch(url, init),
  }
}

async function refresh($: EngineInterface): Promise<void> {
  const next = await currentTrack(hostOf($))
  await update($, nowPlaying, () => next)
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
      if (query) await act($, host => playOrSearch(host, config, query))
    },
  }
}

export const register: Register = (on, options) => {
  const config = spotifyConfigFrom(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'spotify', description: 'Open the Spotify pane, or: spotify <play|pause|next|prev|link|search words>' })
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
    const [track, text] = await Promise.all([read($, nowPlaying), read($, note)])

    return musicView($.ui.resolve(e), track, text, actionsOf($, config), e.props.bodyColumns)
  })
}
