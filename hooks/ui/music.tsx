import type { BoxProps, ButtonProps, ElementConstructor, TextProps } from 'claude-code'

import type { NowPlaying } from '../../types'
import { clip } from '../lib/format'

// The elements the view draws with, from `$.ui.resolve(e)`. Views never see `$`.
export type Kit = { Box: ElementConstructor<BoxProps>; Text: ElementConstructor<TextProps>; Button: ElementConstructor<ButtonProps> }

export type MusicActions = {
  refresh: () => Promise<void>
  transport: (action: string) => Promise<void>
  search: () => Promise<void>
}

export function musicView(ui: Kit, track: NowPlaying | null, note: string | null, actions: MusicActions, width: number) {
  const { Box, Text, Button } = ui
  const control = (key: string, label: string, action: string, hotkey: string) => (
    <Button key={`music-${key}`} plain hotkey={hotkey} label={label} onPress={() => actions.transport(action)} />
  )

  return (
    <Box flexDirection="column" gap={1}>
      <Box justifyContent="space-between">
        <Text bold>Spotify</Text>
        <Button key="music-refresh" plain dimColor hotkey="r" label="Refresh" onPress={actions.refresh} />
      </Box>
      {track ? (
        <Box flexDirection="column">
          <Text color={track.isPlaying ? 'green' : undefined}>
            {track.isPlaying ? '▶' : '❚❚'} {clip(track.title, width - 3)}
          </Text>
          <Text dimColor>{clip(`   ${track.artist}`, width)}</Text>
        </Box>
      ) : (
        <Text dimColor>Nothing playing. Open Spotify, or search for something to start.</Text>
      )}
      <Box columnGap={2}>
        {control('prev', '⏮ Prev', 'prev', 'b')}
        {control('toggle', track?.isPlaying ? '❚❚ Pause' : '▶ Play', track?.isPlaying ? 'pause' : 'resume', 'p')}
        {control('next', 'Next ⏭', 'next', 'n')}
      </Box>
      <Button key="music-search" plain hotkey="s" label="Search…" onPress={actions.search} />
      {note && <Text dimColor>{clip(note, width * 2)}</Text>}
    </Box>
  )
}
