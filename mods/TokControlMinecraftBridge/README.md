# TokControl Minecraft Bridge

แมพไลฟ์แกล้ง — ผู้ชมส่งของขวัญ TikTok แล้วบีบ/ขยายแมพขอบ Bedrock ใน Minecraft จริง

## วิธีใช้ (ง่าย)

1. **Build plugin** (ครั้งแรก — ต้องมี Java JDK 17+)
   ```
   mods\TokControlMinecraftBridge\build.bat
   ```
2. เปิด **TokControl** → **Game Center** → **Minecraft**
3. กด **📦 ติดตั้งเซิร์ฟเวอร์** (ดาวน์โหลด Paper อัตโนมัติ)
4. กด **▶ เปิดเซิร์ฟเวอร์** (รอโหลด 1–2 นาที)
5. เปิด **Minecraft Java** → Multiplayer → **localhost:25565**
6. ในเกมพิมพ์: `/tokcontrol setplayer ชื่อคุณ`
7. เปิดทริกเกอร์ของขวัญใน TokControl แล้วไลฟ์ได้เลย

## แมพขอบ Bedrock (เปิดโล่งด้านบน)

```
[ด้านบนสุด - เปิดโล่ง]
      ┌─────────────────────┐  ▲
      │   ต่อคริสตัลม่วง     │  │ ความสูง 9 บล็อก
      │                     │  │
      └─────────────────────┘  ▼
        ◄── ขยายได้เรื่อยๆ ──►
```

- พื้น + กำแพง **Bedrock** — ไม่มีหลังคา
- รอบนอกคืนดิน/หญ้า
- ขยายแมพได้เรื่อยๆ (ไม่ล็อกที่ 9x9)
- ขยาย/ย่อแล้วผู้เล่นอยู่ที่เดิม (ไม่วาร์ป)
- ต่อคริสตัลม่วงเต็มพื้นที่+ความสูง → นับ 15 วิ → พลุ + รีเซ็ตเป็น 9x9
- TNT ไม่ทำให้ผู้เล่นตาย

| Lv | พื้นที่เล่น |
|----|------------|
| 0 | 1x1 |
| 1 | 3x3 |
| 4 | 9x9 |
| 10 | 21x21 |
| … | ขยายต่อได้ |

- สร้างใหม่: `/tokcontrol rebuild`
- บิน: `/tokcontrol fly` หรือดับเบิลกระโดด
- ดูสถานะ: `/tokcontrol status`

## คำสั่งจากของขวัญ

| ของขวัญ / Event | ทำอะไร |
|--------|--------|
| Rose | เสก TNT บนหัวผู้เล่นทุกคน |
| Mini Heart | บีบแมพลง 1 ระดับ |
| Donut / Doughnut | ขยายแมพขึ้น 1 ระดับ |
| Finger Heart | แจก Cobblestone 16 ชิ้น |
| Like ครบทุก 100 | เสกแท่นกระจกกันตก 10 วินาที |

## Bridge Commands

| คำสั่ง | ทำอะไร |
|--------|--------|
| `mc_build_bedrock_map` | สร้างแมพขอบ Bedrock |
| `mc_expand_map` | ขยายแมพ (ของตกแต่งนอกแมพเลื่อนตามรั้วอัตโนมัติ) |
| `mc_shrink_map` | บีบแมพ (ของตกแต่งนอกแมพเลื่อนตามรั้วอัตโนมัติ) |
| `mc_reset_map` | ล้างบล็อกด้านในโดยไม่ทุบกรอบ |
| `mc_summon_tnt` | เสก TNT บนหัว |
| `mc_give_blocks` | แจกบล็อกช่วยต่อ |
| `mc_like_glass` | แท่นกระจกชั่วคราว |

Bridge HTTP: `http://127.0.0.1:8081`

## โฟลเดอร์เซิร์ฟเวอร์

`%APPDATA%\pandy-app\minecraft-server\` (หรือ `games/minecraft-server` ถ้าไม่ใช่ Electron)

## Build ด้วย Gradle

```bash
cd mods/TokControlMinecraftBridge
gradle build
# ผลลัพธ์: build/libs/TokControlMinecraftBridge.jar
```
