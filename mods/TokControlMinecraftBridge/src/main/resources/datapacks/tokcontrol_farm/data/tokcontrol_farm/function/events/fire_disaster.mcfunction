# ระบบไฟไหม้ — สุ่มวาง fire บน wheat แล้วเปิดไฟลาม
execute unless entity @e[type=marker,tag=tc_farm_origin,limit=1] run function tokcontrol_farm:setup/sync_origin

tellraw @a [{"text":"🔥 ไฟไหม้นา! ","color":"gold","bold":true},{"text":"ใช้ Splash Water Bottle ดับไฟ","color":"gray"}]
title @a title {"text":"ไฟไหม้!","color":"gold","bold":true}
title @a subtitle {"text":"ปาขวดน้ำดับไฟ","color":"white"}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run playsound block.fire.ambient master @a ~ ~ ~ 1 1

kill @e[type=marker,tag=tc_farm_fire_pick]
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~-18 ~ ~-18 {Tags:["tc_farm_fire_pick"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~-12 ~ ~-6 {Tags:["tc_farm_fire_pick"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~-6 ~ ~14 {Tags:["tc_farm_fire_pick"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~4 ~ ~-16 {Tags:["tc_farm_fire_pick"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~10 ~ ~8 {Tags:["tc_farm_fire_pick"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~16 ~ ~-4 {Tags:["tc_farm_fire_pick"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~-16 ~ ~10 {Tags:["tc_farm_fire_pick"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~8 ~ ~16 {Tags:["tc_farm_fire_pick"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~-2 ~ ~-10 {Tags:["tc_farm_fire_pick"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~14 ~ ~2 {Tags:["tc_farm_fire_pick"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~-8 ~ ~2 {Tags:["tc_farm_fire_pick"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~2 ~ ~-8 {Tags:["tc_farm_fire_pick"]}

execute as @e[type=marker,tag=tc_farm_fire_pick] at @s if block ~ ~ ~ wheat run setblock ~ ~ ~ fire
execute as @e[type=marker,tag=tc_farm_fire_pick] at @s if block ~ ~-1 ~ farmland if block ~ ~ ~ air run setblock ~ ~ ~ fire
kill @e[type=marker,tag=tc_farm_fire_pick]

scoreboard players set #spread tc_farm 160
gamerule doFireTick true
