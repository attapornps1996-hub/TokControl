# น้ำท่วมนา — ดับไฟทั้งหมด (Java ทำหลัก / function นี้เป็นสำรอง Title+เสียง)
title @a title {"text":"น้ำท่วมนา!","color":"aqua","bold":true}
title @a subtitle {"text":"ไฟดับหมดแล้ว","color":"white"}
tellraw @a [{"text":"🌊 น้ำท่วมนา — ดับไฟทั้งหมด!","color":"aqua","bold":true}]
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run playsound entity.generic.splash master @a ~ ~ ~ 1.5 0.6
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run fill ~-20 ~ ~-20 ~20 ~ ~20 air replace fire
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run fill ~-20 ~ ~-20 ~20 ~ ~20 air replace soul_fire
gamerule doFireTick false
scoreboard players set #spread tc_farm 0
