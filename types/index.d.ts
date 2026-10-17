export type NowPlaying = { title: string; artist: string; isPlaying: boolean }

declare module 'claude-code' {
  interface PluginState {
    'spotify-control': {
      nowPlaying: NowPlaying | null
      note: string | null
    }
  }
}
