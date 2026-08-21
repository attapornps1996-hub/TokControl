# Dance Club (3D Idle) — TokControl Game Center

Browser-based 3D dance club idle sim. Embeddable as a Game Center game / OBS overlay.

## Structure

```
games/dance-club/
  index.html          Display view (3D stage)
  control.html        Settings / remote control
  dance-club.css      Shared styles
  js/
    view-main.js      Display page entry
    control-main.js   Control page entry
    runtime.js        3D + audio engine
    sync.js           Cross-window BroadcastChannel
    hud-bindings.js   Control panel UI wiring
    scene.js          Big room, moving heads, lasers, LED wall, floor tiles, bloom
    backgrounds.js    Shader cyclorama — 8 reactive themes + auto-cycle
    camera.js         12 preset shots, beat auto-cut, cinematic focus
    character.js      Mascot dancers (circle head + single-line limbs)
    dance-moves.js    Choreography library (twitchy / glitchy moves)
    audio.js          Procedural beat, file, mic, YouTube + BPM clock
    gift-focus.js     Gift → float + camera focus + light punch
    demo-data.js      Demo dancer roster
```

## Run

- Game Center → **Dance Club** → **เปิดเกม + ตั้งค่า** (เปิด 2 หน้าต่างพร้อมกัน)
- **หน้าแสดงผล** (`index.html`) — ฉาก 3D เต็มจอ สำหรับ OBS / ดูสด
- **หน้าตั้งค่า** (`control.html`) — ควบคุมเพลง ไฟ กล้อง นักเต้น (ซิงก์ไปหน้าแสดงผลอัตโนมัติ)
- Overlay: route `dance-club` (`?overlay=1`) — หน้าแสดงผลแบบไม่มี HUD

### แยก 2 หน้า

| หน้า | URL | หน้าที่ |
|------|-----|---------|
| แสดงผล | `/games/dance-club/index.html` | Engine 3D + เสียง + รับคำสั่ง |
| ตั้งค่า | `/games/dance-club/control.html` | Remote control panel |

ทั้งสองหน้าซิงก์ผ่าน `BroadcastChannel` — เปิดหน้าแสดงผลก่อน แล้วเปิดหน้าตั้งค่า จะเห็นสถานะ "เชื่อมต่อแล้ว"

Query params (หน้าแสดงผล): `?overlay=1`, `?bpm=140`, `?palette=toxic`, `?bg=nebula`

## Characters

Each dancer is a circular profile head with single-line limbs, mitten hands and
dome shoes. Two face modes:

- **หน้าการ์ตูน** (default) — cartoon eyes/brows/smile on the dancer's colour
- **รูปโปรไฟล์** — the viewer's actual profile picture clipped into the circle

Heads pitch toward the camera so they stay circular even from crane/top-down shots.

## Dance moves

`bounce`, `glitch`, `jackhammer`, `noodle`, `headspin`, `shuffle`, `kicker`,
`sprinkler`, `flail`, `sway`, plus `hype` (locked while a gift is focused).

In auto mode every dancer re-rolls a move every 8 beats and gets a random
snap-jitter on individual beats, so the crowd never moves in lockstep.

## Audio sources

| Source | Spectrum analysis | Notes |
|---|---|---|
| บีทในตัว | ✅ | Synthesised kick/hat/bass, follows the BPM slider |
| ไฟล์เพลง | ✅ | MP3/WAV/OGG, tempo detected from bass onsets |
| ไมค์/ระบบ | ✅ | Analyse-only (not routed to speakers, avoids feedback) |
| YouTube | ❌ | See below |

**YouTube limitation:** the IFrame player renders audio in a cross-origin frame,
so the Web Audio API cannot read its samples. Playback works, and visuals are
driven by the BPM clock instead — set the BPM slider or hit **Tap** a few times
on the beat, then **Resync** to line the phase up. Everything downstream
(lights, moves, background, camera cuts) reads the same frame shape, so it looks
identical to an analysed source.

## Controls

| UI | Action |
|----|--------|
| แหล่งเพลง | Switch between built-in beat / YouTube / file / mic |
| BPM · Tap · Resync | Manual tempo, tap tempo, phase realign |
| ความละเอียดบีท | Beat subdivision driving the visuals (1/2 … 1/16) |
| ชุดสีไฟ · แพตเทิร์น | Palette and moving-head pattern |
| สโตรบ / เลเซอร์ / ลำแสง | Toggle fixture groups |
| พื้นหลัง | 8 themes, reactivity amount, auto-cycle every N bars |
| กล้อง | 12 preset shots, auto-cut every N bars, beat shake |
| ท่าเต้น | Force one move on everyone, or let it auto-roll |
| หน้าตัวละคร | Cartoon face vs profile picture |

### Keyboard

`1`–`9` shots · `Space` play/pause · `C` next shot · `B` next background ·
`L` next light pattern · `G` mock gift · `T` tap tempo · `H` hide HUD

## JS API

```js
DanceClubGift.mock()
DanceClubGift.trigger({ dancerId: 'd1', giftName: 'Rose', coins: 1, from: 'Viewer' })

DanceClub.focusDancer('d3')
DanceClub.setShot('crane')
DanceClub.setBackground('nebula')
DanceClub.setPalette('toxic')
DanceClub.setBpm(140)
DanceClub.playYouTube('https://youtu.be/VIDEOID')
DanceClub.forceMove('glitch')   // null = back to auto
```

## Tech

- Three.js r160 (CDN import map)
- EffectComposer + UnrealBloomPass
- OrbitControls (free-orbit shot only)
- Web Audio API (AnalyserNode, onset-based tempo tracking)
- YouTube IFrame Player API
- Custom GLSL background shader with crossfade between themes
- InstancedMesh for the LED wall (128 panels) and floor tiles (144)
