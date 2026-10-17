export type NowPlaying = {
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

declare module 'claude-code' {
  interface PluginState {
    'spotify-claude-code-mod': {
      nowPlaying: NowPlaying | null
      note: string | null
      cover: { url: string; png: string } | null
    }
  }
}
