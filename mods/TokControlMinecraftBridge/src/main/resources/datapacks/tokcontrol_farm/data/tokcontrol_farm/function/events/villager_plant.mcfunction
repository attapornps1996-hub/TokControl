# ชาวบ้านปลูกข้าวบน farmland ที่ว่าง (air เหนือ farmland)
execute as @e[type=villager,tag=tc_farm_helper] at @s if block ~ ~-1 ~ farmland if block ~ ~ ~ air run setblock ~ ~ ~ wheat[age=0]
execute as @e[type=villager,tag=tc_farm_helper] at @s if block ~ ~-1 ~ farmland if block ~ ~ ~ wheat run particle compost ~ ~0.8 ~ 0.15 0.2 0.15 0 2
# ก้าวไปหา farmland ว่างใกล้ๆ (สุ่มเดินเบาๆ ด้วย motion)
execute as @e[type=villager,tag=tc_farm_helper] at @s if block ~1 ~-1 ~ farmland if block ~1 ~ ~ air run tp @s ~0.15 ~ ~
execute as @e[type=villager,tag=tc_farm_helper] at @s if block ~-1 ~-1 ~ farmland if block ~-1 ~ ~ air run tp @s ~-0.15 ~ ~
execute as @e[type=villager,tag=tc_farm_helper] at @s if block ~ ~-1 ~1 farmland if block ~ ~ ~1 air run tp @s ~ ~ ~0.15
execute as @e[type=villager,tag=tc_farm_helper] at @s if block ~ ~-1 ~-1 farmland if block ~ ~ ~-1 air run tp @s ~ ~ ~-0.15
