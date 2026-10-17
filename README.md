# spotify-claude-code-mod: Claude Code Mod for Spotify (macOS)

**spotify-claude-code-mod** is a free, open-source **Claude Code mod** (plugin) for Spotify on macOS. Control the **Spotify desktop app** from your terminal without leaving your AI coding session: see what is playing with a progress bar, play, pause, skip, change the volume, toggle shuffle and repeat, play a Spotify link, or search for a song and pick from the results. Uses AppleScript (`osascript`) and the Spotify Web API. MIT licensed.

Keywords: Claude Code mod, Claude Code mods, Claude Code plugin, Spotify mod for Claude Code, Spotify, Spotify controller, Spotify CLI, music player, now playing, play pause skip, AppleScript, osascript, macOS, Spotify Web API, TypeScript.

> Status: pre-release. The code is unit-tested (strict TypeScript, 31 tests) and the status script and album-art pipeline have been run against a live Spotify app, but play, volume, shuffle and search have not yet been tried end to end. Issues and pull requests are welcome.
>
> Not affiliated with or endorsed by Spotify AB. "Spotify" is a trademark of Spotify AB.

## Features

- Now playing: title, artist, album, a progress bar with position and length, and a link to the track
- Play, pause, next track, previous track
- Volume up and down, shuffle and repeat toggles
- Album art in terminals that can draw pictures (kitty and Ghostty); other terminals skip it
- Play any Spotify link or URI (track, album, playlist, artist, episode)
- Search by name and pick from up to four results
- A pane inside Claude Code plus a `/spotify` slash command

## Why it is safe

It is a safer alternative to Spotify mods and plugins for Claude Code that keep a background daemon and a shared state file.
This one has neither:

- Every `osascript` script is fixed text. The one value that varies (a Spotify URI) is passed as an argument
  that AppleScript reads as data, never pasted into the script.
- Anything you type or Spotify returns must match a strict, anchored pattern (`spotify:track:<22 chars>` or an
  `open.spotify.com` link) before it gets near a script.
- No shell is involved, no daemon, no state file, no microphone, no login. Album art is the one thing that touches disk: a
  small PNG in a private temp folder that is deleted right after it is read, fetched only from `i.scdn.co`.
- It never launches Spotify; if the app is closed it tells you so.
- The Spotify client secret lives in Claude Code secure storage and is only ever sent to Spotify's own https endpoints.

## Install

```
claude plugin marketplace add gfb-47/spotify-claude-code-mod
claude plugin install spotify-claude-code-mod@spotify-claude-code-mod
```

macOS will ask once whether Claude Code may control Spotify. Allow it (System Settings > Privacy & Security > Automation).

## Search (optional)

Playing links and the player controls work with no setup. Search needs a Spotify developer app:

1. Create an app at https://developer.spotify.com/dashboard (any redirect URI, e.g. `http://127.0.0.1`).
2. Run `claude plugin configure spotify-claude-code-mod@spotify-claude-code-mod` and enter the client ID and secret.

Search uses the client-credentials flow, so there is no user login and no access to your account.

Spotify has been tightening its developer rules: apps in development mode are limited in users and features, and the
app owner may need a Premium account. Check https://developer.spotify.com for the current terms before you set this up.
Everything except search works without it.

## Use

- `/spotify` opens or closes the Spotify pane (Prev, Play/Pause, Next, Vol, Shuffle, Repeat, Search, Refresh).
  The pane refreshes every 15 seconds.
- `/spotify pause`, `/spotify play`, `/spotify next`, `/spotify prev`, `/spotify shuffle`, `/spotify repeat`
- `/spotify https://open.spotify.com/track/...` plays that link.
- `/spotify some song name` searches and plays the first track. The pane's Search lets you pick from the results instead.

## Develop

```
scripts/verify.sh
```

Runs tsc (strict, no unused code), the layer check (`scripts/check-layers.sh`), `claude plugin validate` and
`claude plugin test`. Set `CLAUDE_CODE_TYPES` and `TSC` if they are not found automatically.

| Path | What lives there |
|---|---|
| `hooks/register.tsx` | The only file that uses `$` |
| `hooks/host.ts` | The port services use: run a process, fetch a URL, read a file |
| `hooks/services/music.ts` | Use cases: transport, play a link, now playing, album art, search |
| `hooks/lib/music.ts` | Pure rules: URI validation, argv builders, response parsing |
| `hooks/ui/music.tsx` | The pane view |

## License

MIT
