export type SpotifyNowPlaying = {
  title: string
  artist: string
  album: string
  isPlaying: boolean
  positionSec: number
  durationSec: number
  volume: number
  isShuffling: boolean
  isRepeating: boolean
  artworkUrl: string | null
  url: string | null
}

export type SpotifyFoundTrack = { uri: string; label: string }

// A search never throws: `problem` says why there is nothing to pick from.
export type SpotifySearch = { tracks: SpotifyFoundTrack[]; problem: string | null }

export type SpotifyAction = 'resume' | 'pause' | 'next' | 'prev' | 'shuffle' | 'repeat' | 'volume-up' | 'volume-down'

// What `$.spotify` gives another plugin. Every call answers with plain data or a sentence to show, and
// none of them launches Spotify: a closed app is reported, not started.
export type Spotify = {
  current: () => Promise<SpotifyNowPlaying | null>
  control: (action: SpotifyAction) => Promise<string>
  playLink: (link: string) => Promise<string>
  find: (query: string) => Promise<SpotifySearch>
  // The cover as a small base64 PNG, or null (also null in terminals that cannot draw it).
  cover: (url: string) => Promise<string | null>
}

declare module 'claude-code' {
  interface EngineInterface {
    spotify: Spotify
  }

  interface PluginState {
    'spotify-claude-code-mod': {
      nowPlaying: SpotifyNowPlaying | null
      note: string | null
      cover: { url: string; png: string } | null
    }
  }
}
