# ไฟลามจากจุดที่มี fire ไปยัง wheat ที่ติดกัน
kill @e[type=marker,tag=tc_farm_spread]
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~-17 ~ ~-11 {Tags:["tc_farm_spread"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~-11 ~ ~7 {Tags:["tc_farm_spread"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~-5 ~ ~-15 {Tags:["tc_farm_spread"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~3 ~ ~13 {Tags:["tc_farm_spread"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~9 ~ ~-9 {Tags:["tc_farm_spread"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~15 ~ ~5 {Tags:["tc_farm_spread"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~-14 ~ ~15 {Tags:["tc_farm_spread"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~11 ~ ~-17 {Tags:["tc_farm_spread"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~-3 ~ ~3 {Tags:["tc_farm_spread"]}
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run summon marker ~7 ~ ~-3 {Tags:["tc_farm_spread"]}

execute as @e[type=marker,tag=tc_farm_spread] at @s if block ~ ~ ~ wheat if block ~1 ~ ~ fire run setblock ~ ~ ~ fire
execute as @e[type=marker,tag=tc_farm_spread] at @s if block ~ ~ ~ wheat if block ~-1 ~ ~ fire run setblock ~ ~ ~ fire
execute as @e[type=marker,tag=tc_farm_spread] at @s if block ~ ~ ~ wheat if block ~ ~ ~1 fire run setblock ~ ~ ~ fire
execute as @e[type=marker,tag=tc_farm_spread] at @s if block ~ ~ ~ wheat if block ~ ~ ~-1 fire run setblock ~ ~ ~ fire
kill @e[type=marker,tag=tc_farm_spread]

scoreboard players remove #spread tc_farm 1
execute if score #spread tc_farm matches ..0 run gamerule doFireTick false
execute if score #spread tc_farm matches ..0 run scoreboard players set #spread tc_farm 0
