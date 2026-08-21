# รันทุก tick — ดับไฟจาก splash / วัวกินข้าว / ชาวบ้านปลูก / ไฟลาม (ถ้าเปิด)
function tokcontrol_farm:events/water_splash
function tokcontrol_farm:events/cow_eat
function tokcontrol_farm:events/villager_plant
execute if score #spread tc_farm matches 1.. run function tokcontrol_farm:events/fire_spread
