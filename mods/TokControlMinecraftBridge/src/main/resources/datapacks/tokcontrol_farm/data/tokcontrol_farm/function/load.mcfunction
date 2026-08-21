# TokControl Farm — init scoreboards + gamerules (แมพพิกัดตรงกับ FarmBuilder: ครึ่งละ 22 บล็อก, Y พื้น = tc_farm_y)
scoreboard objectives add tc_farm dummy
scoreboard players set #half tc_farm 22
scoreboard players set #fy tc_farm 4
scoreboard players set #spread tc_farm 0
gamerule doFireTick false
gamerule mobGriefing false
tellraw @a [{"text":"[Farm] ","color":"green","bold":true},{"text":"datapack พร้อม — ไฟ / วัว / ชาวบ้าน / ล้างนา","color":"white"}]
