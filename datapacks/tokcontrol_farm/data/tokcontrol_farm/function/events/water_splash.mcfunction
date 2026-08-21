# ดับไฟเมื่อมี Splash Water Bottle / area effect cloud ในระยะ
execute as @e[type=minecraft:potion] at @s run fill ~-3 ~-2 ~-3 ~3 ~3 ~3 air replace fire
execute as @e[type=minecraft:area_effect_cloud] at @s run fill ~-3 ~-1 ~-3 ~3 ~2 ~3 air replace fire
