import type { BoxProps, ButtonProps, ElementConstructor, ImageProps, LinkProps, TextProps } from 'claude-code'

import type { NowPlaying } from '../../types'
import { clip } from '../lib/format'

// The elements the view draws with, from `$.ui.resolve(e)`. Views never see `$`.
// Image only exists on the terminal surface, and only draws in kitty and Ghostty.
export type Kit = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Link: ElementConstructor<LinkProps>
  Image?: ElementConstructor<ImageProps>
}

export type MusicActions = {
  refresh: () => Promise<void>
  transport: (action: string) => Promise<void>
  search: () => Promise<void>
}

const COVER_COLUMNS = 14
const COVER_ROWS = 7

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function progress(track: NowPlaying, columns: number): string {
  const done = track.durationSec > 0 ? Math.min(columns, Math.round((track.positionSec / track.durationSec) * columns)) : 0

  return `${clock(track.positionSec)} ${'█'.repeat(done)}${'░'.repeat(columns - done)} ${clock(track.durationSec)}`
}

export function musicView(ui: Kit, track: NowPlaying | null, cover: string | null, note: string | null, actions: MusicActions, width: number) {
  const { Box, Text, Button, Link, Image } = ui
  const control = (key: string, label: string, action: string, hotkey: string) => (
    <Button key={`music-${key}`} plain hotkey={hotkey} label={label} onPress={() => actions.transport(action)} />
  )
  const textWidth = width - (cover ? COVER_COLUMNS + 2 : 0)

  return (
    <Box flexDirection="column" gap={1}>
      <Box justifyContent="space-between">
        <Text bold>Spotify</Text>
        <Button key="music-refresh" plain dimColor hotkey="r" label="Refresh" onPress={actions.refresh} />
      </Box>
      {track ? (
        <Box columnGap={2}>
          {cover && Image && <Image key="music-cover" source={{ png: cover }} columns={COVER_COLUMNS} rows={COVER_ROWS} alt=" " />}
          <Box flexDirection="column">
            <Text color={track.isPlaying ? 'green' : undefined}>
              {track.isPlaying ? '▶' : '❚❚'} {clip(track.title, textWidth - 3)}
            </Text>
            <Text dimColor>{clip(track.artist, textWidth)}</Text>
            {track.album && <Text dimColor>{clip(track.album, textWidth)}</Text>}
            <Text>{progress(track, Math.max(8, Math.min(30, textWidth - 12)))}</Text>
            {track.url && <Link href={track.url} label="Open in Spotify" />}
          </Box>
        </Box>
      ) : (
        <Text dimColor>Nothing playing. Open Spotify, or search for something to start.</Text>
      )}
      <Box columnGap={2}>
        {control('prev', '⏮ Prev', 'prev', 'b')}
        {control('toggle', track?.isPlaying ? '❚❚ Pause' : '▶ Play', track?.isPlaying ? 'pause' : 'resume', 'p')}
        {control('next', 'Next ⏭', 'next', 'n')}
      </Box>
      {track && (
        <Box columnGap={2}>
          {control('vol-down', '− Vol', 'volume-down', 'd')}
          <Text dimColor>{`${track.volume}%`}</Text>
          {control('vol-up', 'Vol +', 'volume-up', 'u')}
          {control('shuffle', `⇄ Shuffle ${track.isShuffling ? 'on' : 'off'}`, 'shuffle', 'z')}
          {control('repeat', `↻ Repeat ${track.isRepeating ? 'on' : 'off'}`, 'repeat', 'e')}
        </Box>
      )}
      <Button key="music-search" plain hotkey="s" label="Search…" onPress={actions.search} />
      {note && <Text dimColor>{clip(note, width * 2)}</Text>}
    </Box>
  )
}
