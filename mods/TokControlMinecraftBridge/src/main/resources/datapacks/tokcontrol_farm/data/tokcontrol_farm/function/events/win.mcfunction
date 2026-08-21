# คัทซีนบวกวิน — รวงข้าวทองคำแห่งความอุดมสมบูรณ์ (Java ทำคลื่นข้าว / จิ้งจอก)
execute unless entity @e[type=marker,tag=tc_farm_origin,limit=1] run function tokcontrol_farm:setup/sync_origin

title @a times 8 55 12
title @a title {"text":"รวงข้าวทองคำแห่งความอุดมสมบูรณ์","color":"gold","bold":true}
title @a subtitle {"text":"นาอุดมสมบูรณ์!","color":"yellow"}

execute at @e[type=marker,tag=tc_farm_origin,limit=1] run playsound minecraft:block.bell.use master @a ~ ~2 ~ 1.6 1
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run particle minecraft:totem_of_undying ~ ~1.4 ~ 1.6 1.0 1.6 0.18 80 force
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run particle minecraft:happy_villager ~ ~1 ~ 2.2 0.7 2.2 0 50 force
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run particle minecraft:end_rod ~ ~0.8 ~ 1.4 0.5 1.4 0.04 40 force
