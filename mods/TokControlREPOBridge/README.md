# TokControl_REPO_Tiktoklive

BepInEx mod for **R.E.P.O.** that connects [TokControl](https://github.com/) (Pandy App) to the game via a **local WebSocket server** on port **8080**.

When viewers send TikTok gifts, TokControl can trigger in-game spawns in real time.

## Requirements

- [BepInEx](https://thunderstore.io/c/repo/p/BepInEx/BepInExPack/) (via Thunderstore Mod Manager)
- [REPOLib](https://thunderstore.io/c/repo/p/Zehs/REPOLib/) 4.2.0+
- **Multiplayer:** You do **not** need to be host if the **lobby host** also has this mod installed (client relay via Photon).
- **Solo / Host:** Works directly — spawn runs on your machine.
- If you join someone else's lobby as a client, TokControl sends spawn commands to the host over the network.

## Install (Thunderstore / r2modman)

1. Install **BepInEx** and **REPOLib** from Thunderstore for R.E.P.O.
2. Install **TokControl_REPO_Tiktoklive** (this mod).
3. Launch the game — check `BepInEx/LogOutput.log` for:
   ```
   [TokControl] WebSocket listening on ws://127.0.0.1:8080/
   ```

## Project layout

```
mods/TokControlREPOBridge/
  *.cs                 # source code (edit here only)
  thunderstore/        # Thunderstore manifest + README
  package.bat          # builds dist/ zip package
  dist/                # generated — upload this to Thunderstore (gitignored)
  bin/ obj/            # dotnet build cache (gitignored)
```

Do **not** keep copies under `plugins/` — that folder was a build-tool side effect and is disabled now.

## Manual build

```bash
cd mods/TokControlREPOBridge
dotnet build -c Release
```

The DLL is copied to your R.E.P.O. `BepInEx/plugins` folder automatically when using `Linkoid.Repo.Plugin.Build` (game must be installed).

## WebSocket protocol

Connect to: `ws://127.0.0.1:8080/`

### JSON (recommended)

```json
{"cmd":"spawn_item","name":"gun","count":1,"user":"viewer123"}
{"cmd":"spawn_ghost","name":"Hidden"}
{"cmd":"spawn_enemy","name":"Hunter","count":1}
{"cmd":"speak","text":"สวัสดีจาก TikTok!","user":"viewer123"}
{"cmd":"ping"}
```

### Plain text

```
spawn_item|gun|3
spawn_ghost|Hidden
spawn_enemy|Hunter|1
ping
```

### Commands

| Command | Description |
|---------|-------------|
| `spawn_item` | Spawn shop item by name (partial match OK) |
| `spawn_ghost` | Spawn enemy (default: `Hidden` from config) |
| `spawn_enemy` | Spawn enemy by name |
| `spawn_valuable` | Spawn valuable by prefab name |
| `list_items` | Log all item names (debug) |
| `list_enemies` | Log all enemy names (debug) |
| `speak` / `say` / `tts` | Local player speaks in-game via REPO chat TTS (`text` or `message` field) |
| `ping` | Health check → `pong` |

Response JSON:

```json
{"success":true,"message":"spawned_item:gun","detail":"count=1"}
```

HTTP fallback (for TokControl test button):

- `GET http://127.0.0.1:8080/health`
- `POST http://127.0.0.1:8080/` with JSON body

## TokControl setup

1. Open **Game Center** → **R.E.P.O.**
2. Connection type: **WebSocket**
3. Host: `ws://127.0.0.1:8080`
4. Add trigger: Gift `Rose` → Command `spawn_item|gun|{count}`
5. Enable **เปิดใช้ทริกเกอร์เกมนี้ขณะสตรีม**

## Config (`BepInEx/config/com.tokcontrol.repobridge.cfg`)

| Key | Default | Description |
|-----|---------|-------------|
| `Server.Port` | 8080 | WebSocket port |
| `Debug.LogToUnityConsole` | true | Mirror logs to Unity console |
| `Gameplay.DefaultGhostEnemy` | Hidden | Enemy for `spawn_ghost` without name |

## Debug logs

- **BepInEx:** `BepInEx/LogOutput.log`
- **Unity:** Console when `LogToUnityConsole` is enabled
- All lines prefixed with `[TokControl]`

## License

MIT — TokControl / Pandy App
