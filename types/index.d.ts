export type NowPlaying = { title: string; artist: string; isPlaying: boolean }

declare module 'claude-code' {
  interface PluginState {
    'spotify-claude-code-mod': {
      nowPlaying: NowPlaying | null
      note: string | null
    }
  }
}
