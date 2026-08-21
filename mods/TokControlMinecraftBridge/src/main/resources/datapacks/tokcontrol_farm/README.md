# Farm Control (Map 4) — datapack `.mcfunction`

ติดตั้งอัตโนมัติโดย plugin ไปที่ `<world>/datapacks/tokcontrol_farm`

## Functions

| Function | คำอธิบาย |
|----------|----------|
| `tokcontrol_farm:events/fire_disaster` | สุ่มวาง `fire` บนข้าว แล้วเปิดไฟลาม |
| `tokcontrol_farm:events/fire_spread` | กระจายไฟไปข้าวที่ติดกัน (เรียกจาก tick) |
| `tokcontrol_farm:events/water_splash` | Splash Water Bottle / AEC → `fire` เป็น `air` |
| `tokcontrol_farm:events/give_water` | แจก Splash Water Bottle |
| `tokcontrol_farm:events/cow_spawn` | เสกวัวแท็ก `tc_farm_cow` |
| `tokcontrol_farm:events/cow_eat` | วัวบนข้าว → ลบข้าว / farmland |
| `tokcontrol_farm:events/villager_spawn` | Farmer 5 ตัว แท็ก `tc_farm_helper` |
| `tokcontrol_farm:events/villager_plant` | ปลูกข้าวบน farmland ว่าง |
| `tokcontrol_farm:events/wipe` | ไฟเต็มนา + Bell + Title |

## RCON / plugin

```
/tokcontrol farm start
/tokcontrol farm fire
/tokcontrol farm cow
/tokcontrol farm villager
/tokcontrol farm wipe
/tokcontrol farm water
/tokcontrol farm function events/fire_disaster
```

พิกัดอ้างอิง marker `tc_farm_origin` (ระดับบล็อคข้าว) ที่ plugin วางหลังสร้างแมพ
