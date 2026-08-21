# TokControl_REPO_Tiktoklive

Connect **TokControl** (stream gift app) to **R.E.P.O.** in real time.

## Features

- Local **WebSocket / HTTP** bridge on `127.0.0.1:8080` (IPv4 only — avoids clashing with other stream mods on `localhost`/IPv6)
- Auto-fallback ports if 8080 is busy: `8082`, `8090`, `18080`, `28080`
- Spawn **items**, **enemies**, and **valuables** via REPOLib
- Mid-screen **MissionUI announce** for random rolls (`announce` / `hud` / `roll`)
- Debug logging to BepInEx + Unity console
- Works with Thunderstore Mod Manager

## Multiplayer (client relay)

- **You do not need to be host** to trigger spawns from TokControl on your PC.
- If you join someone else's lobby, the **lobby host must also have this mod** installed.
- Commands are relayed to the host over Photon automatically.

## Quick start

1. Install REPOLib + this mod (host and/or your client)
2. Launch the game **via Mod Manager** (not Steam alone)
3. Confirm log: `WebSocket listening on ws://127.0.0.1:8080/`
4. In TokControl Game Center → R.E.P.O. → Connection → ping / เช็คใหม่
5. Add gift triggers and press START

## Port conflict

If another TikTok/stream mod already uses port 8080, this build still binds **IPv4 `127.0.0.1`**. If that fails too, it moves to a fallback port — check the log and set TokControl Connection URL to match.

Health check: `GET http://127.0.0.1:8080/health` → `{"ok":true,"mod":"TokControl_REPO_Tiktoklive",...}`

## Example triggers

| TikTok Gift | Command |
|-------------|---------|
| Rose | `spawn_item\|gun\|1` |
| Lion | `spawn_ghost\|Hunter` |
| Galaxy | `spawn_enemy\|Reaper\|1` |

## Support

Check `BepInEx/LogOutput.log` for `[TokControl]` messages.
