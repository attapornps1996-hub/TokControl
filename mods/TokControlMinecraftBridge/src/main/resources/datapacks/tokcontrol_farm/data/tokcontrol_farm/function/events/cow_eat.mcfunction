# วัวกินข้าวบน wheat → air / farmland
execute as @e[type=cow,tag=tc_farm_cow] at @s if block ~ ~ ~ wheat run particle happy_villager ~ ~0.5 ~ 0.2 0.2 0.2 0 3
execute as @e[type=cow,tag=tc_farm_cow] at @s if block ~ ~ ~ wheat run setblock ~ ~ ~ air
execute as @e[type=cow,tag=tc_farm_cow] at @s if block ~ ~-1 ~ wheat run setblock ~ ~-1 ~ farmland
execute as @e[type=cow,tag=tc_farm_cow] at @s if block ~ ~-1 ~ dirt run setblock ~ ~-1 ~ farmland
execute as @e[type=cow,tag=tc_farm_cow] at @s if block ~ ~-1 ~ grass_block run setblock ~ ~-1 ~ farmland
