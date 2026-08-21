# สุ่มเสกวัวรอบ origin
execute unless entity @e[type=marker,tag=tc_farm_origin,limit=1] run function tokcontrol_farm:setup/sync_origin
tellraw @a [{"text":"🐄 วัวบุกนา! ","color":"yellow","bold":true},{"text":"วัวจะกินข้าวที่เดินเหยียบ","color":"gray"}]
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run playsound entity.cow.ambient master @a ~ ~ ~ 1 1

kill @e[type=cow,tag=tc_farm_cow]
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon cow ~-14 ~ ~-10 {Tags:["tc_farm_cow","tc_farm"],CustomName:'{"text":"วัวกินข้าว","color":"yellow"}',CustomNameVisible:1b,PersistenceRequired:1b}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon cow ~12 ~ ~8 {Tags:["tc_farm_cow","tc_farm"],CustomName:'{"text":"วัวกินข้าว","color":"yellow"}',CustomNameVisible:1b,PersistenceRequired:1b}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon cow ~-8 ~ ~14 {Tags:["tc_farm_cow","tc_farm"],CustomName:'{"text":"วัวกินข้าว","color":"yellow"}',CustomNameVisible:1b,PersistenceRequired:1b}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon cow ~10 ~ ~-12 {Tags:["tc_farm_cow","tc_farm"],CustomName:'{"text":"วัวกินข้าว","color":"yellow"}',CustomNameVisible:1b,PersistenceRequired:1b}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon cow ~0 ~ ~16 {Tags:["tc_farm_cow","tc_farm"],CustomName:'{"text":"วัวกินข้าว","color":"yellow"}',CustomNameVisible:1b,PersistenceRequired:1b}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon cow ~-16 ~ ~4 {Tags:["tc_farm_cow","tc_farm"],CustomName:'{"text":"วัวกินข้าว","color":"yellow"}',CustomNameVisible:1b,PersistenceRequired:1b}
