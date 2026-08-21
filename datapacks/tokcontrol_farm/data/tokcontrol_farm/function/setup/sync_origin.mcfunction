# สร้าง marker origin ที่พิกัดครอป (plugin จะ summon ทับพิกัดจริงหลังสร้างแมพ)
scoreboard players set #fy tc_farm 4
kill @e[type=marker,tag=tc_farm_origin]
summon marker 0 5 0 {Tags:["tc_farm_origin","tc_farm"],CustomName:'{"text":"Farm Origin"}'}
