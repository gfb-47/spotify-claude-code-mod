import { describe, expect, test } from 'claude-code/testing'

import type { NowPlaying } from '../types'
import type { Kit, MusicActions } from '../hooks/ui/music'
import { musicView } from '../hooks/ui/music'

const element = (props: object) => ({ props }) as never
const KIT: Kit = { Box: element, Text: element, Button: element, Link: element, Image: element }
const idle = async () => {}
const ACTIONS: MusicActions = { refresh: idle, transport: idle, search: idle }

const TRACK: NowPlaying = {
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  isPlaying: true,
  positionSec: 65,
  durationSec: 240,
  volume: 70,
  isShuffling: true,
  isRepeating: false,
  artworkUrl: null,
  url: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b',
}

describe('music view', () => {
  test('shows the track and a pause button while playing', () => {
    const drawn = JSON.stringify(musicView(KIT, TRACK, null, null, ACTIONS, 60))
    expect(drawn).toContain('Song')
    expect(drawn).toContain('Pause')
  })

  test('offers play when paused', () => {
    expect(JSON.stringify(musicView(KIT, { ...TRACK, isPlaying: false }, null, null, ACTIONS, 60))).toContain('Play')
  })

  test('shows the album, progress, volume, toggles and a link to the track', () => {
    const drawn = JSON.stringify(musicView(KIT, TRACK, null, null, ACTIONS, 60))
    expect(drawn).toContain('Album')
    expect(drawn).toContain('1:05')
    expect(drawn).toContain('4:00')
    expect(drawn).toContain('70%')
    expect(drawn).toContain('Shuffle on')
    expect(drawn).toContain('Repeat off')
    expect(drawn).toContain('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b')
  })

  test('draws the cover only when there is one', () => {
    expect(JSON.stringify(musicView(KIT, TRACK, null, null, ACTIONS, 60))).not.toContain('UE5H')
    expect(JSON.stringify(musicView(KIT, TRACK, 'UE5H', null, ACTIONS, 60))).toContain('UE5H')
    expect(JSON.stringify(musicView({ ...KIT, Image: undefined }, TRACK, 'UE5H', null, ACTIONS, 60))).not.toContain('UE5H')
  })

  test('says so when nothing plays, and shows the last note', () => {
    const drawn = JSON.stringify(musicView(KIT, null, null, 'Spotify is not running. Open it first.', ACTIONS, 40))
    expect(drawn).toContain('Nothing playing')
    expect(drawn).toContain('not running')
  })
})
