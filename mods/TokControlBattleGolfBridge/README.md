# TokControl_BattleGolf_Tiktoklive

Interactive mod pack for **Super Battle Golf** — connects [TokControl](https://github.com/attapornps1996-hub/TokControl) to the game over WebSocket so TikTok gifts can trigger in-game events.

## How it works

- Doorstop loads `TokControl_BattleGolf_InteractiveModData`.
- The mod **connects out** to TokControl on `ws://127.0.0.1:13715`.
- TokControl hosts the WebSocket server and sends events like:

```json
{"type":"event","data":"eventID=give_item_coffee&username=Viewer&lang=th"}
```

## Install

1. Close Super Battle Golf and any other app using port **13715**.
2. Run `install.bat` and point it at your game folder, **or** manually:
   - Copy `runtime\TokControl_BattleGolf_InteractiveModData` into the game root as:

```
<Game>\TokControl_BattleGolf_InteractiveModData\
```

   - Copy Doorstop files from `doorstop\` (`winhttp.dll`, `doorstop_config.ini`, …) into the game root if missing.
   - Ensure `doorstop_config.ini` has:

```ini
target_assembly=TokControl_BattleGolf_InteractiveModData\\ModLoader.dll
```

3. Launch the game with Doorstop enabled (`winhttp.dll` present).
4. Open TokControl → Game Center → **Super Battle Golf** → Start bridge → map gifts / use Test buttons on the same page.

When connected, TokControl status changes from “waiting for game” to connected.

## Package

```bat
package.bat
```

Creates `TokControl_BattleGolf_Tiktoklive-1.0.0.zip`.

## Notes

- Do **not** run another InteractiveMod host on port 13715 at the same time.
- Folder name must be `TokControl_BattleGolf_InteractiveModData`.
- Remove any leftover older InteractiveMod data folders that are not named TokControl.
