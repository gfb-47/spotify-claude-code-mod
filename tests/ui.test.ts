import { describe, expect, test } from 'claude-code/testing'

import type { Kit, MusicActions } from '../hooks/ui/music'
import { musicView } from '../hooks/ui/music'

const element = (props: object) => ({ props }) as never
const KIT: Kit = { Box: element, Text: element, Button: element }
const idle = async () => {}
const ACTIONS: MusicActions = { refresh: idle, transport: idle, search: idle }

describe('music view', () => {
  test('shows the track and a pause button while playing', () => {
    const drawn = JSON.stringify(musicView(KIT, { title: 'Song', artist: 'Artist', isPlaying: true }, null, ACTIONS, 40))
    expect(drawn).toContain('Song')
    expect(drawn).toContain('Pause')
  })

  test('offers play when paused', () => {
    expect(JSON.stringify(musicView(KIT, { title: 'Song', artist: 'Artist', isPlaying: false }, null, ACTIONS, 40))).toContain('Play')
  })

  test('says so when nothing plays, and shows the last note', () => {
    const drawn = JSON.stringify(musicView(KIT, null, 'Spotify is not running. Open it first.', ACTIONS, 40))
    expect(drawn).toContain('Nothing playing')
    expect(drawn).toContain('not running')
  })
})
