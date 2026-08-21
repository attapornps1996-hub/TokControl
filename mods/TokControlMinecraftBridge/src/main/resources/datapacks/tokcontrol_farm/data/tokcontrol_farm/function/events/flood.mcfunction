# น้ำท่วมนา — เฉพาะ title/เสียง (ดับไฟตามคลื่นน้ำทำใน Java ทีละแถว)
title @a title {"text":"น้ำท่วมนา!","color":"aqua","bold":true}
title @a subtitle {"text":"คลื่นกำลังไหล...","color":"white"}
tellraw @a [{"text":"🌊 น้ำท่วมนา — คลื่นไหลดับไฟทีละแถว!","color":"aqua","bold":true}]
execute at @e[type=marker,tag=tc_farm_origin,limit=1] run playsound entity.generic.splash master @a ~ ~ ~ 1.5 0.6
