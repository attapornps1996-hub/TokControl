# ล้างนา — ไฟเต็มนา + Bell + Title
execute unless entity @e[type=marker,tag=tc_farm_origin,limit=1] run function tokcontrol_farm:setup/sync_origin

title @a times 10 60 20
title @a title {"text":"⚠ ล้างนา!","color":"dark_red","bold":true}
title @a subtitle {"text":"ไฟไหม้ทั่วทั้งนา","color":"red"}
tellraw @a [{"text":"🚨 WIPE EVENT ","color":"dark_red","bold":true},{"text":"— ไฟไหม้ทั่วนาข้าว!","color":"red"}]

execute at @e[type=marker,tag=tc_farm_origin,limit=1] run playsound block.bell.use master @a ~ ~3 ~ 2 0.7
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run playsound block.bell.resonate master @a ~ ~3 ~ 2 0.5
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run playsound block.bell.use master @a ~ ~3 ~ 2 1.2

# ไฟแทนข้าวรอบหอ (เว้นแกนกลาง ±5)
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run fill ~-20 ~ ~-20 ~-6 ~ ~20 fire replace wheat
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run fill ~6 ~ ~-20 ~20 ~ ~20 fire replace wheat
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run fill ~-5 ~ ~-20 ~5 ~ ~-6 fire replace wheat
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run fill ~-5 ~ ~6 ~5 ~ ~20 fire replace wheat

scoreboard players set #spread tc_farm 200
gamerule doFireTick true
