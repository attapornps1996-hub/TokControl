# Farmer helper 5 ตัว
execute unless entity @e[type=marker,tag=tc_farm_origin,limit=1] run function tokcontrol_farm:setup/sync_origin
tellraw @a [{"text":"👨‍🌾 ชาวบ้านช่วยปลูก! ","color":"green","bold":true},{"text":"ปลูกข้าวบน farmland ว่าง","color":"gray"}]
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run playsound entity.villager.yes master @a ~ ~ ~ 1 1

kill @e[type=villager,tag=tc_farm_helper]
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon villager ~-15 ~ ~-8 {Tags:["tc_farm_helper","tc_farm"],VillagerData:{profession:"minecraft:farmer",level:2,type:"minecraft:plains"},CustomName:'{"text":"ผู้ช่วยนา","color":"green"}',CustomNameVisible:1b,PersistenceRequired:1b,Invulnerable:1b}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon villager ~13 ~ ~6 {Tags:["tc_farm_helper","tc_farm"],VillagerData:{profession:"minecraft:farmer",level:2,type:"minecraft:plains"},CustomName:'{"text":"ผู้ช่วยนา","color":"green"}',CustomNameVisible:1b,PersistenceRequired:1b,Invulnerable:1b}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon villager ~-7 ~ ~15 {Tags:["tc_farm_helper","tc_farm"],VillagerData:{profession:"minecraft:farmer",level:2,type:"minecraft:plains"},CustomName:'{"text":"ผู้ช่วยนา","color":"green"}',CustomNameVisible:1b,PersistenceRequired:1b,Invulnerable:1b}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon villager ~9 ~ ~-14 {Tags:["tc_farm_helper","tc_farm"],VillagerData:{profession:"minecraft:farmer",level:2,type:"minecraft:plains"},CustomName:'{"text":"ผู้ช่วยนา","color":"green"}',CustomNameVisible:1b,PersistenceRequired:1b,Invulnerable:1b}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon villager ~0 ~ ~18 {Tags:["tc_farm_helper","tc_farm"],VillagerData:{profession:"minecraft:farmer",level:2,type:"minecraft:plains"},CustomName:'{"text":"ผู้ช่วยนา","color":"green"}',CustomNameVisible:1b,PersistenceRequired:1b,Invulnerable:1b}
