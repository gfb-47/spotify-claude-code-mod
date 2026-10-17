# spotify-claude-code-mod: Claude Code Mod for Spotify (macOS)

**spotify-claude-code-mod** is a free, open-source **Claude Code mod** (plugin) for Spotify on macOS. Control the **Spotify desktop app** from your terminal without leaving your AI coding session: see what is playing, play, pause, skip, go back, play a Spotify link, or search for a song and play the first result. Uses AppleScript (`osascript`) and the Spotify Web API. MIT licensed.

Keywords: Claude Code mod, Claude Code mods, Claude Code plugin, Spotify mod for Claude Code, Spotify, Spotify controller, Spotify CLI, music player, now playing, play pause skip, AppleScript, osascript, macOS, Spotify Web API, TypeScript.

> Status: v0.1.0. The code is fully unit-tested (strict TypeScript, 23 tests), but it has not yet been tested end to end against a live Spotify app. Issues and pull requests are welcome.
>
> Not affiliated with or endorsed by Spotify AB. "Spotify" is a trademark of Spotify AB.

## Features

- Now playing (title, artist, playing or paused)
- Play, pause, next track, previous track
- Play any Spotify link or URI (track, album, playlist, artist, episode)
- Search by name and play the first matching track
- A pane inside Claude Code plus a `/spotify` slash command

## Why it is safe

It is a safer alternative to Spotify mods and plugins for Claude Code that keep a background daemon and a shared state file.
This one has neither:

- Every `osascript` script is fixed text. The one value that varies (a Spotify URI) is passed as an argument
  that AppleScript reads as data, never pasted into the script.
- Anything you type or Spotify returns must match a strict, anchored pattern (`spotify:track:<22 chars>` or an
  `open.spotify.com` link) before it gets near a script.
- No shell is involved, no daemon, no file in `/tmp`, no microphone, no login.
- It never launches Spotify; if the app is closed it tells you so.
- The Spotify client secret lives in Claude Code secure storage and is only ever sent to Spotify's own https endpoints.

## Install

```
claude plugin marketplace add gfb-47/spotify-claude-code-mod
claude plugin install spotify-claude-code-mod@spotify-claude-code-mod
```

macOS will ask once whether Claude Code may control Spotify. Allow it (System Settings > Privacy & Security > Automation).

## Search (optional)

Playing links and the transport buttons work with no setup. Search needs a free Spotify developer app:

1. Create an app at https://developer.spotify.com/dashboard (any redirect URI, e.g. `http://127.0.0.1`).
2. Run `claude plugin configure spotify-claude-code-mod@spotify-claude-code-mod` and enter the client ID and secret.

Search uses the client-credentials flow, so there is no user login and no access to your account.

## Use

- `/spotify` opens or closes the Spotify pane (Prev, Play/Pause, Next, Search, Refresh).
- `/spotify pause`, `/spotify play`, `/spotify next`, `/spotify prev`
- `/spotify https://open.spotify.com/track/...` plays that link.
- `/spotify some song name` searches and plays the first track.

## Develop

```
scripts/verify.sh
```

Runs tsc (strict, no unused code), the layer check (`scripts/check-layers.sh`), `claude plugin validate` and
`claude plugin test`. Set `CLAUDE_CODE_TYPES` and `TSC` if they are not found automatically.

| Path | What lives there |
|---|---|
| `hooks/register.tsx` | The only file that uses `$` |
| `hooks/host.ts` | The port services use: run a process, fetch a URL |
| `hooks/services/music.ts` | Use cases: transport, play a link, now playing, search |
| `hooks/lib/music.ts` | Pure rules: URI validation, argv builders, response parsing |
| `hooks/ui/music.tsx` | The pane view |

## License

MIT
