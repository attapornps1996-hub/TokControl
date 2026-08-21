# คัทซีนลบวิน — เพลิงกัลป์ล้างผืนนา (Java ทำคลื่นไฟ / เถ้า)
execute unless entity @e[type=marker,tag=tc_farm_origin,limit=1] run function tokcontrol_farm:setup/sync_origin

title @a times 6 50 14
title @a title {"text":"เพลิงกัลป์ล้างผืนนา","color":"dark_red","bold":true}
title @a subtitle {"text":"นาถูกเผาเป็นเถ้าถ่าน","color":"red"}

execute at @e[type=marker,tag=tc_farm_origin,limit=1] run playsound minecraft:entity.lightning_bolt.thunder master @a ~ ~3 ~ 1.8 0.75
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run playsound minecraft:entity.generic.explode master @a ~ ~1 ~ 1.3 0.55
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run particle minecraft:flame ~ ~0.8 ~ 2.4 0.6 2.4 0.04 80 force
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run particle minecraft:large_smoke ~ ~1 ~ 2.2 0.7 2.2 0.03 60 force
