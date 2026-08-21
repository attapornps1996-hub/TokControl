# มังกรพ่นไฟ — สำรอง Title/เสียง (อนิเมชันหลักอยู่ฝั่ง Java)
title @a title {"text":"มังกรบุก!","color":"dark_purple","bold":true}
title @a subtitle {"text":"พ่นไฟเผาทั้งนา","color":"red"}
tellraw @a [{"text":"🐉 มังกรพ่นไฟ — ทั้งนาจะติดไฟ!","color":"dark_purple","bold":true}]
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run playsound entity.ender_dragon.growl master @a ~ ~10 ~ 2 0.8
