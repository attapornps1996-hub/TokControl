package com.tokcontrol.minecraft;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.title.Title;
import org.bukkit.Bukkit;
import org.bukkit.Difficulty;
import org.bukkit.GameRule;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.SoundCategory;
import org.bukkit.World;
import org.bukkit.boss.BarColor;
import org.bukkit.boss.BarStyle;
import org.bukkit.boss.BossBar;
import org.bukkit.block.Block;
import org.bukkit.block.data.Ageable;
import org.bukkit.entity.ArmorStand;
import org.bukkit.entity.Blaze;
import org.bukkit.entity.Cow;
import org.bukkit.entity.EnderDragon;
import org.bukkit.entity.Entity;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Fox;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Marker;
import org.bukkit.entity.Player;
import org.bukkit.entity.Snowball;
import org.bukkit.entity.Villager;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockFadeEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.block.MoistureChangeEvent;
import org.bukkit.event.entity.EntityTargetLivingEntityEvent;
import org.bukkit.event.entity.ProjectileHitEvent;
import org.bukkit.event.entity.ProjectileLaunchEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerRecipeDiscoverEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.PotionMeta;
import org.bukkit.potion.PotionType;
import org.bukkit.attribute.Attribute;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.NamespacedKey;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.util.Vector;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

/**
 * Farm Control — อีเวนต์รันใน Java (เห็นผลแน่นอนผ่าน RCON) + datapack สำรอง
 */
public final class FarmControlService implements Listener {

    private final TokControlPlugin plugin;
    private final FarmBuilder builder;
    private final Random random = new Random();
    private final NamespacedKey keyActions;
    private final NamespacedKey keyLastAction;
    private boolean active;
    private BukkitTask readyTask;
    private BukkitTask tickTask;
    private BukkitTask eventTask;
    private BukkitTask floodTask;
    private BukkitTask dragonTask;
    private BukkitTask winTask;
    private BukkitTask cinematicTask;
    private EnderDragon activeDragon;
    private org.bukkit.entity.Phantom activePhantom;
    private BossBar progressBar;
    private int winSecondsLeft;
    private int winTicksLeft;
    private int winSlowAccum;
    private int winHudPulse;
    private int lastDramaticSec = -1;
    private int winFullWheatBaseline;
    private static final int SNOWMAN_PLANTS_PER_SHOT = 6;
    private static final double SNOWMAN_SCALE = 1.75;
    private static final int BLAZE_BURNS_PER_SHOT = 3;
    private static final double WIN_FOX_SCALE = 3.6;
    private boolean winArmed;
    private boolean winDeltaAwarded;
    private boolean winCompleting;
    private boolean cinematicBusy;

    private static final int COW_EAT_LIMIT = 5;
    private static final int VILLAGER_PLANT_LIMIT = 5;
    private static final int HELPER_DURATION_TICKS = 15 * 20; // 15 วิ
    private static final int HELPER_ACTION_PERIOD = 3; // รัวๆ ทุก 3 ติ๊ก
    /** รัศมีดับไฟจากขวดน้ำ (บล็อก) — อยู่ในช่วง 3–6 ตามที่ต้องการ */
    private static final int WATER_EXTINGUISH_RADIUS = 4;
    private static final int WIN_HOLD_SEC = 15;
    /** ต้องปลูกโตเต็มครบทุกแปลงก่อนเริ่มนับ */
    private static final double WIN_RATIO = 1.0;
    /** ช่วง 3 วิสุดท้าย — ช้าลง (~1.8 วิจริง ต่อ 1 วิที่แสดง) */
    private static final int WIN_SLOW_TICKS_PER_SEC = 36;
    /** ข้าวระยะกลาง (เขียว) / โตเต็ม */
    private static final int WHEAT_STAGE_MID = 2;
    private static final int WHEAT_STAGE_FULL = 7;
    /** 5 ครั้งใน ~1 วิ (ชาวนา) / วัวใช้ช่วงใกล้เคียง */
    private static final int MOB_ACTION_INTERVAL_TICKS = 4;
    private static final int VILLAGER_ACTION_INTERVAL_TICKS = 4;

    public FarmControlService(TokControlPlugin plugin, FarmBuilder builder) {
        this.plugin = plugin;
        this.builder = builder;
        this.keyActions = new NamespacedKey(plugin, "fm_actions");
        this.keyLastAction = new NamespacedKey(plugin, "fm_last_act");
    }

    public FarmBuilder getBuilder() { return builder; }
    public boolean isActive() { return active; }

    public void start(World world) {
        if (world == null) return;
        shutdownTasks();
        builder.buildFarm(world, true, FarmBuilder.DEFAULT_HALF);
        installDatapack(world);
        placeOriginMarker(world);
        try {
            world.setGameRule(GameRule.DO_FIRE_TICK, false);
            world.setGameRule(GameRule.MOB_GRIEFING, false);
            world.setGameRule(GameRule.DO_MOB_SPAWNING, false);
            world.setGameRule(GameRule.ANNOUNCE_ADVANCEMENTS, false);
            world.setGameRule(GameRule.DO_MOB_LOOT, false);
            world.setGameRule(GameRule.DO_ENTITY_DROPS, false);
            world.setGameRule(GameRule.DO_TILE_DROPS, false);
            world.setGameRule(GameRule.KEEP_INVENTORY, true);
            world.setGameRule(GameRule.DO_DAYLIGHT_CYCLE, false);
            world.setTime(1000L);
        } catch (Exception ignored) {}
        active = true;
        winArmed = false;
        winSecondsLeft = 0;
        winTicksLeft = 0;
        winSlowAccum = 0;
        winHudPulse = 0;
        lastDramaticSec = -1;
        winDeltaAwarded = false;
        winCompleting = false;
        cinematicBusy = false;
        builder.clearFarmEntities(world);
        ensureProgressBar();
        updateProgressBar(world);
        // ลดแชทรก — ปิด command feedback ในโลกฟาร์ม
        try { world.setGameRule(GameRule.SEND_COMMAND_FEEDBACK, false); } catch (Exception ignored) {}
        try { world.setGameRule(GameRule.ANNOUNCE_ADVANCEMENTS, false); } catch (Exception ignored) {}
        try { world.setGameRule(GameRule.DO_MOB_SPAWNING, false); } catch (Exception ignored) {}
        allowHostileMobs(world);
        for (Player p : world.getPlayers()) {
            suppressChatNoise(p);
        }

        readyTask = Bukkit.getScheduler().runTaskLater(plugin, () -> {
            runConsole("datapack enable \"file/tokcontrol_farm\"");
            runConsole("function tokcontrol_farm:load");
            placeOriginMarker(world);
            builder.teleportPlayers(world);
            for (Player p : Bukkit.getOnlinePlayers()) {
                if (p.getWorld().equals(world)) {
                    giveFarmKit(p);
                    enableFarmFlight(p);
                }
            }
            titleAll("Farm Control", "ปา Snowball ลงนาเพื่อปลูกข้าว", NamedTextColor.GREEN);
            broadcast("§a§l[Farm] §fนาว่าง — หา §bSnowball §fปลูก · มี §9Splash Water §fดับไฟ · บินได้");
        }, 40L);

        tickTask = Bukkit.getScheduler().runTaskTimer(plugin, this::farmTick, 10L, 4L);
        plugin.getLogger().info("Farm Control started (Java events + datapack)");
    }

    public void shutdown() {
        active = false;
        winArmed = false;
        winSecondsLeft = 0;
        shutdownTasks();
        removeDragon();
        removeProgressBar();
    }

    private void shutdownTasks() {
        if (readyTask != null) { readyTask.cancel(); readyTask = null; }
        if (tickTask != null) { tickTask.cancel(); tickTask = null; }
        if (eventTask != null) { eventTask.cancel(); eventTask = null; }
        if (floodTask != null) { floodTask.cancel(); floodTask = null; }
        if (dragonTask != null) { dragonTask.cancel(); dragonTask = null; }
        if (winTask != null) { winTask.cancel(); winTask = null; }
        if (cinematicTask != null) { cinematicTask.cancel(); cinematicTask = null; }
        cinematicBusy = false;
    }

    public void rebuild(World world) {
        start(world != null ? world : primaryWorld());
    }

    // ─── Kit / snowball plant ─────────────────────────────────

    public void giveFarmKit(Player player) {
        if (player == null) return;
        // ลบคริสตัล Box ที่อาจค้างในกระเป๋า
        player.getInventory().remove(Material.AMETHYST_BLOCK);
        player.getInventory().setItem(0, new ItemStack(Material.SNOWBALL, 1));
        player.getInventory().setItem(1, splashWater(1));
        player.getInventory().setHeldItemSlot(0);
        enableFarmFlight(player);
    }

    private void enableFarmFlight(Player player) {
        if (player == null || !player.isOnline()) return;
        try {
            plugin.enablePlayerFlight(player);
        } catch (Throwable t) {
            player.setAllowFlight(true);
            player.setFlySpeed(0.1f);
        }
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onRecipeDiscover(PlayerRecipeDiscoverEvent event) {
        if (!active) return;
        Player p = event.getPlayer();
        if (p.getWorld().equals(primaryWorld()) || FarmBuilder.isFarmWorld(p.getWorld())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onDropItem(PlayerDropItemEvent event) {
        if (!active) return;
        Player p = event.getPlayer();
        if (plugin.isAdminDecorateMode(p)) return; // แอดมินทิ้งของได้
        if (p.getWorld().equals(primaryWorld()) || FarmBuilder.isFarmWorld(p.getWorld())) {
            event.setCancelled(true);
            refillUnlimitedKit(p);
        }
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onFarmHelperTarget(EntityTargetLivingEntityEvent event) {
        if (!active) return;
        Entity e = event.getEntity();
        if (e.getScoreboardTags().contains("tc_farm_blaze")
                || e.getScoreboardTags().contains("tc_farm_snowman")
                || e.getScoreboardTags().contains("tc_farm_cow")
                || e.getScoreboardTags().contains("tc_farm_helper")) {
            event.setCancelled(true);
            event.setTarget(null);
        }
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onFarmHelperProjectile(ProjectileLaunchEvent event) {
        if (!active) return;
        if (!(event.getEntity().getShooter() instanceof LivingEntity living)) return;
        if (living.getScoreboardTags().contains("tc_farm_blaze")
                || living.getScoreboardTags().contains("tc_farm_snowman")) {
            event.setCancelled(true);
        }
    }

    /**
     * โหมดแอดมิน — วาง/ทุบได้อิสระทั้งในนาและนอกรั้ว (ไม่ถูกยกเลิก)
     */
    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onAdminPlace(BlockPlaceEvent event) {
        if (!active) return;
        Player p = event.getPlayer();
        if (!plugin.isAdminDecorateMode(p)) return;
        World w = event.getBlock().getWorld();
        if (primaryWorld() == null || !w.equals(primaryWorld())) return;
        event.setCancelled(false);
        event.setBuild(true);
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onAdminBreak(BlockBreakEvent event) {
        if (!active) return;
        Player p = event.getPlayer();
        if (!plugin.isAdminDecorateMode(p)) return;
        World w = event.getBlock().getWorld();
        if (primaryWorld() == null || !w.equals(primaryWorld())) return;
        event.setCancelled(false);
        event.setDropItems(false);
        event.setExpToDrop(0);
    }

    /** ผู้เล่นปกติ — ห้ามวาง/ทุบบล็อกแมพ (แอดมินยกเว้น) */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onPlayerPlace(BlockPlaceEvent event) {
        if (!active) return;
        Player p = event.getPlayer();
        if (plugin.isAdminDecorateMode(p)) return;
        World w = event.getBlock().getWorld();
        if (primaryWorld() == null || !w.equals(primaryWorld())) return;
        event.setCancelled(true);
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onPlayerBreak(BlockBreakEvent event) {
        if (!active) return;
        Player p = event.getPlayer();
        if (plugin.isAdminDecorateMode(p)) return;
        World w = event.getBlock().getWorld();
        if (primaryWorld() == null || !w.equals(primaryWorld())) return;
        // อนุญาตทุบเฉพาะข้าวที่โต (เกมเพลย์) — ไม่ให้รื้อแมพ
        Block b = event.getBlock();
        if (b.getType() == Material.WHEAT) {
            event.setDropItems(false);
            event.setExpToDrop(0);
            Bukkit.getScheduler().runTask(plugin, () -> onCropDestroyed(w));
            return;
        }
        event.setCancelled(true);
    }

    /** ไม่ให้ farmland แห้ง/พัง */
    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onFarmlandFade(BlockFadeEvent event) {
        if (!active) return;
        Block b = event.getBlock();
        if (b.getType() != Material.FARMLAND) return;
        if (!isFarmPlot(b.getX(), b.getZ())) return;
        event.setCancelled(true);
        FarmBuilder.setFarmlandMoist(b.getWorld(), b.getX(), b.getY(), b.getZ());
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onMoistureChange(MoistureChangeEvent event) {
        if (!active) return;
        Block b = event.getBlock();
        if (b.getType() != Material.FARMLAND) return;
        if (!isFarmPlot(b.getX(), b.getZ())) return;
        event.setCancelled(true);
        try {
            b.setBlockData(Bukkit.createBlockData("minecraft:farmland[moisture=7]"), false);
        } catch (Throwable ignored) {
            FarmBuilder.setFarmlandMoist(b.getWorld(), b.getX(), b.getY(), b.getZ());
        }
    }

    private void refillUnlimitedKit(Player player) {
        if (player == null || !player.isOnline()) return;
        player.getInventory().remove(Material.AMETHYST_BLOCK);
        ItemStack s0 = player.getInventory().getItem(0);
        if (s0 == null || s0.getType() != Material.SNOWBALL || s0.getAmount() < 1) {
            player.getInventory().setItem(0, new ItemStack(Material.SNOWBALL, 1));
        } else if (s0.getAmount() != 1) {
            s0.setAmount(1);
        }
        ItemStack s1 = player.getInventory().getItem(1);
        if (s1 == null || s1.getType() != Material.SPLASH_POTION || s1.getAmount() < 1) {
            player.getInventory().setItem(1, splashWater(1));
        } else if (s1.getAmount() != 1) {
            s1.setAmount(1);
        }
    }

    private ItemStack splashWater(int amount) {
        ItemStack item = new ItemStack(Material.SPLASH_POTION, Math.max(1, amount));
        if (item.getItemMeta() instanceof PotionMeta meta) {
            try {
                meta.setBasePotionType(PotionType.WATER);
            } catch (Throwable t) {
                try { meta.setDisplayName("§9Splash Water Bottle"); } catch (Throwable ignored) {}
            }
            item.setItemMeta(meta);
        }
        return item;
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onSnowballHit(ProjectileHitEvent event) {
        if (!active) return;
        // ลูกไฟจากตัวพ่นไฟ — ลบข้าว
        if (event.getEntity() instanceof org.bukkit.entity.SmallFireball
                || event.getEntity().getScoreboardTags().contains("tc_farm_fireball")) {
            Block hit = event.getHitBlock();
            Location loc = hit != null ? hit.getLocation() : event.getEntity().getLocation();
            World world = loc.getWorld();
            if (world == null) return;
            for (int dx = -1; dx <= 1; dx++) {
                for (int dz = -1; dz <= 1; dz++) {
                    Block b = world.getBlockAt(loc.getBlockX() + dx, builder.getCropY(), loc.getBlockZ() + dz);
                    if (!isFarmPlot(b.getX(), b.getZ())) continue;
                    if (b.getType() == Material.WHEAT) {
                        b.setType(Material.AIR, false);
                        world.spawnParticle(Particle.FLAME, b.getLocation().add(0.5, 0.4, 0.5), 8, 0.2, 0.2, 0.2, 0.01);
                        world.spawnParticle(Particle.CAMPFIRE_COSY_SMOKE, b.getLocation().add(0.5, 0.5, 0.5), 4, 0.15, 0.15, 0.15, 0.01);
                    } else if (b.getType().isAir()) {
                        b.setType(Material.FIRE, false);
                    }
                }
            }
            playFarm(Sound.BLOCK_FIRE_EXTINGUISH, 0.5f, 1.4f);
            event.getEntity().remove();
            return;
        }
        if (!(event.getEntity() instanceof Snowball)) return;
        Block hit = event.getHitBlock();
        Location hitLoc = hit != null ? hit.getLocation() : event.getEntity().getLocation();
        World world = hitLoc.getWorld();
        if (world == null) return;
        // ปลูกตรงพิกัด cropY ในโซนา (รองรับ snowman ที่ลูกบอลตกผิดบล็อก)
        int tx = hitLoc.getBlockX();
        int tz = hitLoc.getBlockZ();
        if (!isFarmPlot(tx, tz)) {
            // ลองบล็อครอบๆ
            boolean found = false;
            for (int dx = -1; dx <= 1 && !found; dx++) {
                for (int dz = -1; dz <= 1 && !found; dz++) {
                    if (isFarmPlot(tx + dx, tz + dz)) {
                        tx += dx; tz += dz; found = true;
                    }
                }
            }
            if (!found) return;
        }
        Block soil = world.getBlockAt(tx, builder.getFloorY(), tz);
        if (soil.getType() != Material.FARMLAND) {
            FarmBuilder.setFarmlandMoist(world, tx, builder.getFloorY(), tz);
        }
        boolean helper = event.getEntity().getScoreboardTags().contains("tc_farm_helper_ball");
        // ผู้เล่น: ปลูก 3×3 · ครั้งที่ 1 เขียว · ครั้งที่ 2 โตเต็ม — ห้ามปลูกบนไฟ
        if (!helper) {
            plantSnowballBurst(world, tx, tz);
            Block center = world.getBlockAt(tx, builder.getCropY(), tz);
            if (event.getEntity().getShooter() instanceof Player p) {
                if (center.getType() == Material.FIRE || center.getType() == Material.SOUL_FIRE) {
                    playFarm(Sound.BLOCK_FIRE_EXTINGUISH, 0.35f, 1.4f);
                } else {
                    playFarm(Sound.ITEM_CROP_PLANT, 0.85f, 1.2f);
                }
                refillUnlimitedKit(p);
            }
        } else {
            Block crop = world.getBlockAt(tx, builder.getCropY(), tz);
            if (crop.getType() == Material.FIRE || crop.getType() == Material.SOUL_FIRE) {
                event.getEntity().remove();
                return;
            }
            plantWheatFull(crop);
        }
        event.getEntity().remove();
    }

    /** คลิกขวา Snowball บน farmland ก็ปลูก 3×3 ได้ */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onSnowballInteract(PlayerInteractEvent event) {
        if (!active) return;
        if (plugin.isAdminDecorateMode(event.getPlayer())) return;
        if (event.getAction() != Action.RIGHT_CLICK_BLOCK) return;
        if (event.getClickedBlock() == null) return;
        ItemStack hand = event.getItem();
        if (hand == null || hand.getType() != Material.SNOWBALL) return;
        Block block = event.getClickedBlock();
        Block soil = block.getType() == Material.FARMLAND ? block
                : (block.getRelative(0, -1, 0).getType() == Material.FARMLAND ? block.getRelative(0, -1, 0) : null);
        if (soil == null && isFarmPlot(block.getX(), block.getZ())
                && (block.getType() == Material.DIRT || block.getType() == Material.GRASS_BLOCK || block.getType() == Material.COARSE_DIRT)) {
            FarmBuilder.setFarmlandMoist(block.getWorld(), block.getX(), block.getY(), block.getZ());
            soil = block;
        }
        if (soil == null) return;
        if (!isFarmPlot(soil.getX(), soil.getZ())) return;
        event.setCancelled(true);
        plantSnowballBurst(soil.getWorld(), soil.getX(), soil.getZ());
        refillUnlimitedKit(event.getPlayer());
        Block crop = worldCropAbove(soil);
        if (crop.getType() == Material.FIRE || crop.getType() == Material.SOUL_FIRE) {
            playFarm(Sound.BLOCK_FIRE_EXTINGUISH, 0.35f, 1.4f);
        } else {
            playFarm(Sound.ITEM_CROP_PLANT, 0.7f, 1.2f);
        }
    }

    /**
     * ปลูกแบบคลื่นนุ่ม — วงกลม ไม่แข็งเป็นสี่เหลี่ยมทันที
     * ข้ามเฉพาะช่องที่มีไฟ (ช่องข้างยังปลูกได้)
     */
    private void plantSnowballBurst(World world, int cx, int cz) {
        List<int[]> cells = new ArrayList<>();
        for (int dx = -2; dx <= 2; dx++) {
            for (int dz = -2; dz <= 2; dz++) {
                double dist = Math.hypot(dx, dz);
                if (dist > 1.65) continue;
                int x = cx + dx;
                int z = cz + dz;
                if (!isFarmPlot(x, z)) continue;
                cells.add(new int[]{x, z, (int) Math.round(dist * 10)});
            }
        }
        cells.sort((a, b) -> Integer.compare(a[2], b[2]));
        AtomicInteger i = new AtomicInteger(0);
        Bukkit.getScheduler().runTaskTimer(plugin, task -> {
            int idx = i.getAndIncrement();
            if (idx >= cells.size() || !active) {
                task.cancel();
                return;
            }
            int[] c = cells.get(idx);
            Block crop = world.getBlockAt(c[0], builder.getCropY(), c[1]);
            if (crop.getType() == Material.FIRE || crop.getType() == Material.SOUL_FIRE) {
                world.spawnParticle(Particle.CAMPFIRE_COSY_SMOKE, crop.getLocation().add(0.5, 0.4, 0.5), 3, 0.1, 0.1, 0.1, 0.01);
                return;
            }
            if (!crop.getType().isAir() && crop.getType() != Material.WHEAT) return;
            advanceWheat(crop);
            Location p = crop.getLocation().add(0.5, 0.35, 0.5);
            world.spawnParticle(Particle.HAPPY_VILLAGER, p, 6, 0.12, 0.18, 0.12, 0);
            world.spawnParticle(Particle.END_ROD, p, 2, 0.08, 0.12, 0.08, 0.01);
        }, 0L, 1L);
    }

    private Block worldCropAbove(Block soil) {
        return soil.getWorld().getBlockAt(soil.getX(), builder.getCropY(), soil.getZ());
    }

    /** ครั้งที่ 1 → ข้าวเขียว (age 2) · ครั้งที่ 2 → โตเต็ม (age 7) */
    private String advanceWheat(Block crop) {
        ensureFarmlandBelow(crop);
        if (crop.getType() != Material.WHEAT) {
            crop.setType(Material.WHEAT, false);
            if (crop.getBlockData() instanceof Ageable age) {
                age.setAge(WHEAT_STAGE_MID);
                crop.setBlockData(age, false);
            }
            return "ข้าวเขียว (ระยะ 2) — ปาอีกครั้งเพื่อให้โตเต็ม";
        }
        if (crop.getBlockData() instanceof Ageable age) {
            if (age.getAge() >= WHEAT_STAGE_FULL) {
                return "ข้าวโตเต็มแล้ว";
            }
            age.setAge(WHEAT_STAGE_FULL);
            crop.setBlockData(age, false);
            return "ข้าวโตเต็มแล้ว!";
        }
        return "ปลูกแล้ว";
    }

    private void plantWheat(Block crop) {
        advanceWheat(crop);
    }

    /** ปลูกโตเต็มทันที */
    private void plantWheatFull(Block crop) {
        ensureFarmlandBelow(crop);
        crop.setType(Material.WHEAT, false);
        if (crop.getBlockData() instanceof Ageable age) {
            age.setAge(WHEAT_STAGE_FULL);
            crop.setBlockData(age, false);
        }
    }

    private void ensureFarmlandBelow(Block crop) {
        Block soil = crop.getWorld().getBlockAt(crop.getX(), builder.getFloorY(), crop.getZ());
        FarmBuilder.setFarmlandMoist(crop.getWorld(), soil.getX(), soil.getY(), soil.getZ());
    }

    private boolean isFarmPlot(int x, int z) {
        return builder.isFarmPlotAt(x, z);
    }

    public boolean expandFarm(int steps) {
        if (!ensureActive()) return false;
        World world = primaryWorld();
        // ขยายระหว่างนับถอยหลัง → รีเซ็ตเวลาให้เข้ากับขนาดใหม่
        onFarmSizeChanged(world);
        int neu = builder.expand(world, Math.max(1, steps));
        Location mid = midLoc(world);
        titleAll("⬆ ขยายฟาร์ม!", "ขนาดครึ่งด้าน " + neu, NamedTextColor.RED);
        playFarm(Sound.ENTITY_PLAYER_LEVELUP, 1.1f, 0.85f);
        playFarm(Sound.UI_TOAST_CHALLENGE_COMPLETE, 0.85f, 1.1f);
        playFarm(Sound.BLOCK_NOTE_BLOCK_PLING, 1.0f, 0.7f);
        playFarm(Sound.BLOCK_ANVIL_USE, 0.6f, 1.5f);
        world.spawnParticle(Particle.FLAME, mid, 35, 2, 1, 2, 0.02);
        world.spawnParticle(Particle.LAVA, mid, 8, 1.2, 0.4, 1.2, 0);
        updateProgressBar(world);
        checkWinProgress(world);
        return true;
    }

    public boolean shrinkFarm(int steps) {
        if (!ensureActive()) return false;
        World world = primaryWorld();
        onFarmSizeChanged(world);
        int neu = builder.shrink(world, Math.max(1, steps));
        Location mid = midLoc(world);
        boolean atMin = neu <= FarmBuilder.MIN_HALF;
        titleAll("⬇ ลดขนาดฟาร์ม",
                atMin ? "เล็กสุดแล้ว — เหลือ 1 แถวรอบหอคอย" : ("ขนาดครึ่งด้าน " + neu),
                NamedTextColor.GREEN);
        playFarm(Sound.ENTITY_PLAYER_LEVELUP, 1.0f, 1.35f);
        playFarm(Sound.BLOCK_NOTE_BLOCK_CHIME, 1.0f, 1.5f);
        playFarm(Sound.ENTITY_ITEM_PICKUP, 1.0f, 0.9f);
        playFarm(Sound.BLOCK_GRASS_PLACE, 0.9f, 1.1f);
        world.spawnParticle(Particle.HAPPY_VILLAGER, mid, 40, 2, 1, 2, 0.05);
        world.spawnParticle(Particle.CLOUD, mid, 20, 1.5, 0.6, 1.5, 0.02);
        updateProgressBar(world);
        checkWinProgress(world);
        return true;
    }

    /** เมื่อขนาดฟาร์มเปลี่ยน — ยกเลิกนับถอยหลังเก่า แล้วให้ checkWin คำนวณใหม่ */
    private void onFarmSizeChanged(World world) {
        if (!winArmed || winCompleting) {
            updateProgressBar(world);
            return;
        }
        // ยกเลิกนับเดิม (คืน Win ที่บวกไป) — ไม่โชว์ "พัง" เพราะเป็นการขยาย/ย่อ
        boolean awarded = winDeltaAwarded;
        winArmed = false;
        winSecondsLeft = 0;
        winTicksLeft = 0;
        winSlowAccum = 0;
        lastDramaticSec = -1;
        winFullWheatBaseline = 0;
        if (winTask != null) { winTask.cancel(); winTask = null; }
        if (awarded) {
            BridgeHttpServer.queueWinDelta(-1);
            winDeltaAwarded = false;
        }
        updateProgressBar(world);
    }

    /** สโนแมนบนหอ — ปลูกข้าวรัวๆ 15 วิ (สปอนเพิ่มได้ไม่จำกัด) */
    public boolean spawnSnowmanHelper() {
        if (!ensureActive()) return false;
        World world = primaryWorld();
        Location top = builder.getTowerTop(world);
        if (top == null) return false;
        builder.clearHelperStand(world);
        Location spawnAt = top.clone();

        broadcast("§b§l☃ สโนแมน — ปลูกข้าวรัวๆ 15 วิ!");
        playFarm(Sound.ENTITY_SNOW_GOLEM_AMBIENT, 1.2f, 1f);

        org.bukkit.entity.Snowman snowman = world.spawn(spawnAt, org.bukkit.entity.Snowman.class, s -> {
            s.addScoreboardTag("tc_farm_snowman");
            s.addScoreboardTag("tc_farm");
            s.customName(Component.text("☃ ผู้ช่วยสโนแมน", NamedTextColor.AQUA, TextDecoration.BOLD));
            s.setCustomNameVisible(true);
            s.setRemoveWhenFarAway(false);
            s.setPersistent(true);
            s.setInvulnerable(true);
            s.setAI(true);
            s.setAware(true);
            try { s.setDerp(false); } catch (Throwable ignored) {}
            scaleEntity(s, SNOWMAN_SCALE);
        });
        world.spawnParticle(Particle.SNOWFLAKE, spawnAt.clone().add(0, 1.4, 0), 40, 0.7, 1.1, 0.7, 0.02);
        world.spawnParticle(Particle.CLOUD, spawnAt.clone().add(0, 1.8, 0), 18, 0.5, 0.6, 0.5, 0.01);

        AtomicInteger ticksLeft = new AtomicInteger(HELPER_DURATION_TICKS);
        Bukkit.getScheduler().runTaskTimer(plugin, task -> {
            int left = ticksLeft.addAndGet(-HELPER_ACTION_PERIOD);
            if (!active || left <= 0 || snowman == null || !snowman.isValid()) {
                task.cancel();
                Bukkit.getScheduler().runTaskLater(plugin, () -> {
                    if (snowman != null && snowman.isValid()) snowman.remove();
                }, 20L);
                return;
            }
            containOnTower(snowman);
            List<Block> plots = new ArrayList<>(collectEmptyFarmlandTops(world));
            if (plots.isEmpty()) return;
            Location here = snowman.getLocation();
            plots.sort((a, b) -> Double.compare(dist2(a, here), dist2(b, here)));
            int planted = 0;
            Location from = snowman.getEyeLocation();
            for (int i = 0; i < SNOWMAN_PLANTS_PER_SHOT && i < plots.size(); i++) {
                Block target = plots.get(i);
                Block soil = world.getBlockAt(target.getX(), builder.getFloorY(), target.getZ());
                FarmBuilder.setFarmlandMoist(world, soil.getX(), soil.getY(), soil.getZ());
                Block crop = world.getBlockAt(target.getX(), builder.getCropY(), target.getZ());
                if (crop.getType() == Material.FIRE || crop.getType() == Material.SOUL_FIRE) continue;
                plantWheatFull(crop);
                planted++;
                world.spawnParticle(Particle.HAPPY_VILLAGER, crop.getLocation().add(0.5, 0.5, 0.5), 8, 0.2, 0.2, 0.2, 0.01);
                Location to = crop.getLocation().add(0.5, 0.6, 0.5);
                drawSnowTrail(world, from, to);
                world.spawnParticle(Particle.SNOWFLAKE, to, 6, 0.2, 0.15, 0.2, 0.01);
            }
            if (planted > 0) {
                playFarm(Sound.ENTITY_SNOWBALL_THROW, 0.55f, 1.35f);
            }
        }, 5L, HELPER_ACTION_PERIOD);
        return true;
    }

    private void drawSnowTrail(World world, Location from, Location to) {
        Vector delta = to.toVector().subtract(from.toVector());
        int steps = Math.max(6, (int) (delta.length() * 1.5));
        for (int i = 1; i <= steps; i++) {
            double t = i / (double) steps;
            Location p = from.clone().add(delta.clone().multiply(t));
            // โค้งสูงเหนือหอ
            p.add(0, Math.sin(t * Math.PI) * 2.5, 0);
            world.spawnParticle(Particle.SNOWFLAKE, p, 1, 0.02, 0.02, 0.02, 0);
        }
    }

    private static double dist2(Block b, Location loc) {
        double dx = b.getX() + 0.5 - loc.getX();
        double dz = b.getZ() + 0.5 - loc.getZ();
        return dx * dx + dz * dz;
    }

    private void clearTowerPad(World world, int x, int y, int z, int r) {
        for (int dx = -r; dx <= r; dx++) {
            for (int dz = -r; dz <= r; dz++) {
                for (int dy = 0; dy <= 3; dy++) {
                    Block b = world.getBlockAt(x + dx, y + dy, z + dz);
                    Material m = b.getType();
                    if (m != Material.GOLD_BLOCK && m != Material.BELL && !m.name().contains("BANNER")) {
                        if (dy == 0 && Math.abs(dx) <= 1 && Math.abs(dz) <= 1) {
                            b.setType(Material.STONE_BRICKS, false);
                        } else {
                            b.setType(Material.AIR, false);
                        }
                    }
                }
            }
        }
    }

    /** ตัวพ่นไฟบนหอ — ลบข้าวรัวๆ 15 วิ (สปอนเพิ่มได้ไม่จำกัด) */
    public boolean spawnBlazeThrower() {
        if (!ensureActive()) return false;
        World world = primaryWorld();
        Location top = builder.getTowerTop(world);
        if (top == null) return false;
        allowHostileMobs(world);
        builder.clearHelperStand(world);
        Location spawnAt = top.clone();

        broadcast("§c§l🔥 พ่นไฟ — ลบข้าว 3 ช่องต่อนัด 15 วิ!");
        playFarm(Sound.ENTITY_BLAZE_AMBIENT, 1.4f, 0.85f);
        world.spawnParticle(Particle.FLAME, spawnAt, 90, 0.8, 1.1, 0.8, 0.04);
        world.spawnParticle(Particle.LAVA, spawnAt, 28, 0.55, 0.5, 0.55, 0);

        LivingEntity visual = spawnBlazeVisual(world, spawnAt);

        AtomicInteger ticksLeft = new AtomicInteger(HELPER_DURATION_TICKS);
        Bukkit.getScheduler().runTaskTimer(plugin, task -> {
            int left = ticksLeft.addAndGet(-HELPER_ACTION_PERIOD);
            if (!active || left <= 0) {
                task.cancel();
                Bukkit.getScheduler().runTaskLater(plugin, () -> {
                    if (visual != null && visual.isValid()) visual.remove();
                }, 20L);
                return;
            }
            Location from = spawnAt.clone().add(0, 1.6, 0);
            if (visual != null && visual.isValid()) {
                if (visual instanceof Blaze b) b.setTarget(null);
                containOnTower(visual);
                from = visual.getEyeLocation();
                world.spawnParticle(Particle.FLAME, visual.getLocation().add(0, 1.0, 0), 10, 0.28, 0.45, 0.28, 0.02);
            } else {
                world.spawnParticle(Particle.FLAME, from, 10, 0.28, 0.45, 0.28, 0.02);
            }
            List<Block> targets = collectWheat(world);
            if (targets.isEmpty()) return;
            java.util.Collections.shuffle(targets, random);
            int burns = Math.min(BLAZE_BURNS_PER_SHOT, targets.size());
            for (int i = 0; i < burns; i++) {
                Block target = targets.get(i);
                Block crop = world.getBlockAt(target.getX(), builder.getCropY(), target.getZ());
                if (crop.getType() == Material.WHEAT || crop.getType().isAir() || crop.getType() == Material.FIRE) {
                    boolean wasWheat = crop.getType() == Material.WHEAT;
                    crop.setType(Material.AIR, false);
                    if (wasWheat) onCropDestroyed(world);
                }
                Location to = crop.getLocation().add(0.5, 0.5, 0.5);
                drawFireTrail(world, from, to);
                world.spawnParticle(Particle.FLAME, to, 18, 0.3, 0.3, 0.3, 0.02);
                world.spawnParticle(Particle.CAMPFIRE_COSY_SMOKE, to, 8, 0.2, 0.2, 0.2, 0.01);
            }
            playFarm(Sound.ENTITY_BLAZE_SHOOT, 0.7f, 1.2f);
            playFarm(Sound.BLOCK_FIRE_EXTINGUISH, 0.5f, 1.4f);
        }, 5L, HELPER_ACTION_PERIOD);
        return true;
    }

    private LivingEntity spawnBlazeVisual(World world, Location spawnAt) {
        try {
            Blaze blaze = world.spawn(spawnAt, Blaze.class, b -> {
                tagBlazeVisual(b);
                b.setAI(false);
                b.setAware(false);
                b.setGravity(false);
                b.setSilent(false);
            });
            if (blaze != null && blaze.isValid()) return blaze;
        } catch (Throwable t) {
            plugin.getLogger().warning("blaze spawn: " + t.getMessage());
        }
        try {
            ArmorStand stand = world.spawn(spawnAt, ArmorStand.class, s -> {
                tagBlazeVisual(s);
                s.setGravity(false);
                s.setInvisible(false);
                s.setMarker(false);
                s.setSmall(false);
                s.setArms(false);
                s.setBasePlate(false);
                try { s.setCollidable(false); } catch (Throwable ignored) {}
            });
            if (stand != null && stand.isValid()) return stand;
        } catch (Throwable t) {
            plugin.getLogger().warning("blaze stand: " + t.getMessage());
        }
        return null;
    }

    private void tagBlazeVisual(LivingEntity e) {
        e.addScoreboardTag("tc_farm_blaze");
        e.addScoreboardTag("tc_farm");
        e.customName(Component.text("🔥 ตัวพ่นไฟ", NamedTextColor.GOLD, TextDecoration.BOLD));
        e.setCustomNameVisible(true);
        e.setRemoveWhenFarAway(false);
        e.setPersistent(true);
        e.setInvulnerable(true);
    }

    private void allowHostileMobs(World world) {
        if (world == null) return;
        try {
            if (world.getDifficulty() == Difficulty.PEACEFUL) {
                world.setDifficulty(Difficulty.EASY);
                plugin.getLogger().info("Farm difficulty PEACEFUL → EASY (ให้พ่นไฟสปอนได้)");
            }
        } catch (Throwable ignored) {}
    }

    private void drawFireTrail(World world, Location from, Location to) {
        Vector delta = to.toVector().subtract(from.toVector());
        int steps = Math.max(5, (int) (delta.length() * 1.2));
        for (int i = 1; i <= steps; i++) {
            double t = i / (double) steps;
            Location p = from.clone().add(delta.clone().multiply(t));
            world.spawnParticle(Particle.FLAME, p, 1, 0.02, 0.02, 0.02, 0);
        }
    }

    // ─── Events (Java — เห็นผลแน่นอน) ─────────────────────────

    public boolean fireDisaster() {
        if (!ensureActive()) return false;
        World world = primaryWorld();
        int cropY = builder.getCropY();
        titleAll("ไฟไหม้!", "ปาขวดน้ำดับไฟ", NamedTextColor.GOLD);
        broadcast("§6§l🔥 ไฟไหม้นา! §7ใช้ Splash Water Bottle ดับไฟ");
        playFarm(Sound.BLOCK_FIRE_AMBIENT, 1.5f, 1f);

        List<Block> wheat = collectWheat(world);
        List<Block> targets = wheat.isEmpty() ? collectEmptyFarmlandTops(world) : wheat;
        int n = Math.min(14, Math.max(4, targets.size() / 8 + 4));
        for (int i = 0; i < n && !targets.isEmpty(); i++) {
            Block b = targets.remove(random.nextInt(targets.size()));
            Block at = b.getType() == Material.FARMLAND ? b.getRelative(0, 1, 0) : b;
            at.setType(Material.FIRE, false);
            world.spawnParticle(Particle.FLAME, at.getLocation().add(0.5, 0.3, 0.5), 12, 0.3, 0.2, 0.3, 0.02);
        }
        try { world.setGameRule(GameRule.DO_FIRE_TICK, true); } catch (Exception ignored) {}
        // ลามไฟไปข้าวใกล้ๆ อีก 4 วินาที
        spreadFireBriefly(world, 80);
        runFunctionQuiet("events/fire_disaster");
        return true;
    }

    private long lastCowSpawnMs;
    private long lastVillagerSpawnMs;

    public boolean cowEvent() {
        if (!ensureActive()) return false;
        World world = primaryWorld();
        // ไม่เล่นเสียงวัว — สปอนอย่างเดียว
        List<Block> wheat = new ArrayList<>(collectWheat(world));
        if (wheat.isEmpty()) return false;
        broadcast("§e§l🐄 วัวบุกนา!");
        Block plot = wheat.get(random.nextInt(wheat.size()));
        Location loc = new Location(world, plot.getX() + 0.5, builder.getFloorY() + 1.0, plot.getZ() + 0.5);
        Cow cow = world.spawn(loc, Cow.class, c -> {
            c.addScoreboardTag("tc_farm_cow");
            c.addScoreboardTag("tc_farm");
            c.customName(Component.text("วัว 0/" + COW_EAT_LIMIT, NamedTextColor.YELLOW));
            c.setCustomNameVisible(true);
            c.setRemoveWhenFarAway(false);
            c.setPersistent(true);
            c.setAware(false);
            c.setAI(false);
            c.setCollidable(false);
            c.setSilent(true);
            c.getPersistentDataContainer().set(keyActions, PersistentDataType.INTEGER, 0);
        });
        startCowBurst(world, cow);
        return true;
    }

    private void startCowBurst(World world, Cow cow) {
        AtomicInteger eaten = new AtomicInteger(0);
        Bukkit.getScheduler().runTaskTimer(plugin, task -> {
            if (!active || cow == null || !cow.isValid()) {
                task.cancel();
                return;
            }
            Location here = cow.getLocation();
            Block crop = findAdjacentWheat(world, here);
            if (crop == null) crop = nearestWheatNear(world, here, 4.5);
            if (crop == null) crop = nearestWheatNear(world, here, 64.0);
            if (crop == null || crop.getType() != Material.WHEAT) {
                world.spawnParticle(Particle.CLOUD, cow.getLocation().add(0, 1, 0), 12, 0.3, 0.4, 0.3, 0.02);
                cow.remove();
                task.cancel();
                return;
            }
            Location dest = crop.getLocation().add(0.5, 0, 0.5);
            double distSq = here.distanceSquared(dest);
            if (distSq > 2.6) {
                Vector step = dest.toVector().subtract(here.toVector());
                if (step.lengthSquared() > 1e-6) {
                    step.setY(0).normalize().multiply(Math.min(1.15, Math.sqrt(distSq)));
                    Location mid = here.clone().add(step);
                    mid.setY(builder.getFloorY() + 1.0);
                    if (isInsideFence(mid.getBlockX(), mid.getBlockZ())) {
                        cow.teleport(mid);
                    } else {
                        cow.teleport(dest);
                    }
                }
                if (cow.getLocation().distanceSquared(dest) > 2.25) return;
            } else {
                cow.teleport(dest);
            }
            if (crop.getType() == Material.WHEAT) {
                crop.setType(Material.AIR, false);
                onCropDestroyed(world);
            }
            int n = eaten.incrementAndGet();
            cow.customName(Component.text("วัว " + n + "/" + COW_EAT_LIMIT, NamedTextColor.YELLOW));
            world.spawnParticle(Particle.CRIT, crop.getLocation().add(0.5, 0.4, 0.5), 8, 0.2, 0.2, 0.2, 0.02);
            // ไม่เล่นเสียงวัว
            if (n >= COW_EAT_LIMIT) {
                world.spawnParticle(Particle.CLOUD, cow.getLocation().add(0, 1, 0), 12, 0.3, 0.4, 0.3, 0.02);
                cow.remove();
                task.cancel();
            }
        }, 2L, 5L);
    }

    /** ข้าวที่ติดกับตำแหน่งปัจจุบัน (4 ทิศ + มุม) */
    private Block findAdjacentWheat(World world, Location from) {
        int bx = from.getBlockX();
        int bz = from.getBlockZ();
        int cy = builder.getCropY();
        int[][] dirs = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}, {1, 1}, {1, -1}, {-1, 1}, {-1, -1}, {0, 0}};
        for (int[] d : dirs) {
            int x = bx + d[0];
            int z = bz + d[1];
            if (!isFarmPlot(x, z)) continue;
            Block crop = world.getBlockAt(x, cy, z);
            if (crop.getType() == Material.WHEAT) return crop;
        }
        return null;
    }

    public boolean villagerHelper() {
        if (!ensureActive()) return false;
        World world = primaryWorld();
        // ไม่เล่นเสียงชาวบ้าน — สปอนอย่างเดียว
        List<Block> empties = orderPlotsRowMajor(collectEmptyFarmlandTops(world));
        if (empties.isEmpty()) return false;
        broadcast("§a§l👨‍🌾 ชาวบ้านช่วยปลูก!");
        Block start = empties.get(0);
        List<Block> lane = new ArrayList<>(empties);
        Location loc = new Location(world, start.getX() + 0.5, builder.getFloorY() + 1.0, start.getZ() + 0.5);
        Villager vil = world.spawn(loc, Villager.class, v -> {
            v.addScoreboardTag("tc_farm_helper");
            v.addScoreboardTag("tc_farm");
            v.setProfession(Villager.Profession.NITWIT);
            v.customName(Component.text("ชาวนา 0/" + VILLAGER_PLANT_LIMIT, NamedTextColor.GREEN));
            v.setCustomNameVisible(true);
            v.setRemoveWhenFarAway(false);
            v.setPersistent(true);
            v.setInvulnerable(true);
            v.setAware(false);
            v.setAI(false);
            v.setCollidable(false);
            v.setSilent(true);
            v.getPersistentDataContainer().set(keyActions, PersistentDataType.INTEGER, 0);
        });
        startVillagerRowBurst(world, vil, lane);
        return true;
    }

    /** เรียงแปลงเป็นแถว: Z น้อย→มาก แล้ว X น้อย→มาก */
    private List<Block> orderPlotsRowMajor(List<Block> plots) {
        List<Block> ordered = new ArrayList<>(plots);
        ordered.sort((a, b) -> {
            int z = Integer.compare(a.getZ(), b.getZ());
            if (z != 0) return z;
            return Integer.compare(a.getX(), b.getX());
        });
        return ordered;
    }

    private void startVillagerRowBurst(World world, Villager vil, List<Block> lane) {
        AtomicInteger idx = new AtomicInteger(0);
        AtomicInteger planted = new AtomicInteger(0);
        Bukkit.getScheduler().runTaskTimer(plugin, task -> {
            if (!active || vil == null || !vil.isValid()) {
                task.cancel();
                return;
            }
            if (planted.get() >= VILLAGER_PLANT_LIMIT || idx.get() >= lane.size()) {
                world.spawnParticle(Particle.CLOUD, vil.getLocation().add(0, 1, 0), 12, 0.3, 0.4, 0.3, 0.02);
                vil.remove();
                task.cancel();
                return;
            }
            Block crop = null;
            while (idx.get() < lane.size()) {
                Block cand = lane.get(idx.getAndIncrement());
                if (!isFarmPlot(cand.getX(), cand.getZ())) continue;
                Block soil = world.getBlockAt(cand.getX(), builder.getFloorY(), cand.getZ());
                if (soil.getType() != Material.FARMLAND) continue;
                Block top = world.getBlockAt(cand.getX(), builder.getCropY(), cand.getZ());
                if (top.getType() == Material.WHEAT && top.getBlockData() instanceof Ageable a
                        && a.getAge() >= WHEAT_STAGE_FULL) continue;
                crop = top;
                break;
            }
            if (crop == null) {
                world.spawnParticle(Particle.CLOUD, vil.getLocation().add(0, 1, 0), 12, 0.3, 0.4, 0.3, 0.02);
                vil.remove();
                task.cancel();
                return;
            }
            Location dest = crop.getLocation().add(0.5, 0, 0.5);
            vil.teleport(dest);
            if (crop.getType() == Material.FIRE || crop.getType() == Material.SOUL_FIRE) {
                crop.setType(Material.AIR, false);
            }
            Block soil = world.getBlockAt(crop.getX(), builder.getFloorY(), crop.getZ());
            FarmBuilder.setFarmlandMoist(world, soil.getX(), soil.getY(), soil.getZ());
            plantWheatFull(crop);
            int n = planted.incrementAndGet();
            vil.customName(Component.text("ชาวนา " + n + "/" + VILLAGER_PLANT_LIMIT, NamedTextColor.GREEN));
            world.spawnParticle(Particle.HAPPY_VILLAGER, crop.getLocation().add(0.5, 0.4, 0.5), 8, 0.2, 0.2, 0.2, 0);
            // ไม่เล่นเสียงชาวบ้าน/ปลูกจากชาวนา
            if (n >= VILLAGER_PLANT_LIMIT) {
                world.spawnParticle(Particle.CLOUD, vil.getLocation().add(0, 1, 0), 12, 0.3, 0.4, 0.3, 0.02);
                vil.remove();
                task.cancel();
            }
        }, 2L, 4L);
    }

    private int countTagged(World world, String tag) {
        int n = 0;
        for (Entity e : world.getEntities()) {
            if (e.getScoreboardTags().contains(tag)) n++;
        }
        return n;
    }

    /** จุดสปอนสุ่มในรั้ว (ห่างขอบรั้ว 3 บล็อก · นอกบ่อกลาง) */
    private List<int[]> pickInsideFenceSpots(int count) {
        List<int[]> out = new ArrayList<>();
        int cx = builder.getCenterX();
        int cz = builder.getCenterZ();
        int limit = Math.max(4, builder.getHalf() - 4);
        int tries = 0;
        while (out.size() < count && tries++ < count * 40) {
            int x = cx + random.nextInt(limit * 2 + 1) - limit;
            int z = cz + random.nextInt(limit * 2 + 1) - limit;
            if (!isInsideFence(x, z)) continue;
            if (Math.hypot(x - cx, z - cz) < FarmBuilder.FARM_INNER + 1) continue;
            out.add(new int[]{x, z});
        }
        while (out.size() < count) {
            int i = out.size();
            out.add(new int[]{
                    clampInsideFenceX(cx + (i % 2 == 0 ? 8 : -8)),
                    clampInsideFenceZ(cz + (i % 3 == 0 ? 10 : -10))
            });
        }
        return out;
    }

    /** ในรั้ว (ไม่รวมเสารั้ว) */
    private boolean isInsideFence(int x, int z) {
        int h = builder.getHalf();
        return Math.abs(x - builder.getCenterX()) < h - 1 && Math.abs(z - builder.getCenterZ()) < h - 1;
    }

    private int clampInsideFenceX(int x) {
        int cx = builder.getCenterX();
        int lim = Math.max(1, builder.getHalf() - 3);
        return Math.max(cx - lim, Math.min(cx + lim, x));
    }

    private int clampInsideFenceZ(int z) {
        int cz = builder.getCenterZ();
        int lim = Math.max(1, builder.getHalf() - 3);
        return Math.max(cz - lim, Math.min(cz + lim, z));
    }

    /** ดันกลับเบาๆ ถ้ายื่นออกรั้วมาก — ไม่วาร์ปทุกติ๊ก */
    private void containInsideFence(LivingEntity mob) {
        int x = mob.getLocation().getBlockX();
        int z = mob.getLocation().getBlockZ();
        int h = builder.getHalf();
        int cx = builder.getCenterX();
        int cz = builder.getCenterZ();
        // ยอมให้อยู่ใกล้รั้ว — วาร์ปเฉพาะเมื่อหลุดออกนอกจริงๆ
        if (Math.abs(x - cx) < h && Math.abs(z - cz) < h) return;
        int nx = clampInsideFenceX(x);
        int nz = clampInsideFenceZ(z);
        Location back = new Location(mob.getWorld(), nx + 0.5, builder.getFloorY() + 1.0, nz + 0.5);
        mob.teleport(back);
        try {
            if (mob instanceof org.bukkit.entity.Mob m) m.getPathfinder().stopPathfinding();
        } catch (Throwable ignored) {}
    }

    /** คงสโนแมน/พ่นไฟไว้บนดาดฟ้าหอ — ไม่วาร์ปลงพื้น */
    private void containOnTower(LivingEntity mob) {
        if (mob == null || !mob.isValid()) return;
        Location top = builder.getTowerTop(mob.getWorld());
        if (top == null) return;
        Location loc = mob.getLocation();
        double dx = loc.getX() - top.getX();
        double dz = loc.getZ() - top.getZ();
        double roofR = Math.max(1.1, FarmBuilder.TOWER_R - 0.35);
        boolean offPad = (dx * dx + dz * dz) > roofR * roofR;
        boolean tooLow = loc.getY() < top.getY() - 0.4;
        boolean tooHigh = loc.getY() > top.getY() + 3.5;
        if (!offPad && !tooLow && !tooHigh) return;
        Location back = top.clone();
        back.setYaw(loc.getYaw());
        back.setPitch(loc.getPitch());
        mob.teleport(back);
        try {
            if (mob instanceof org.bukkit.entity.Mob m) m.getPathfinder().stopPathfinding();
        } catch (Throwable ignored) {}
    }

    /** ปลูกข้าวเต็มนาทันที (โตเต็มทุกช่องว่าง/ยังไม่เต็ม) */
    public boolean plantAllFull() {
        if (!ensureActive()) return false;
        World world = primaryWorld();
        int n = 0;
        for (Block soil : collectFarmland(world)) {
            Block crop = worldCropAbove(soil);
            if (crop.getType() == Material.FIRE) crop.setType(Material.AIR, false);
            if (crop.getType() == Material.WHEAT && crop.getBlockData() instanceof Ageable age
                    && age.getAge() >= WHEAT_STAGE_FULL) {
                continue;
            }
            if (!crop.getType().isAir() && crop.getType() != Material.WHEAT) continue;
            plantWheatFull(crop);
            n++;
        }
        titleAll("ปลูกเต็มนา!", "ข้าวโตเต็ม ×" + n, NamedTextColor.GREEN);
        broadcast("§a§l🌾 ปลูกข้าวเต็มทันที §f" + n + " ต้น");
        playFarm(Sound.ITEM_CROP_PLANT, 1.2f, 0.9f);
        return true;
    }

    public boolean wipe() {
        if (!ensureActive()) return false;
        World world = primaryWorld();
        titleAll("⚠ ล้างนา!", "ไฟไหม้ทั่วทั้งนา", NamedTextColor.DARK_RED);
        broadcast("§4§l🚨 WIPE — ไฟไหม้ทั่วนา!");
        Location mid = builder.getFarmSpawn() != null ? builder.getFarmSpawn() : world.getSpawnLocation();
        playFarm(Sound.BLOCK_BELL_USE, 2f, 0.7f);
        playFarm(Sound.BLOCK_BELL_RESONATE, 2f, 0.5f);
        int cropY = builder.getCropY();
        int lit = 0;
        for (Block b : collectWheat(world)) {
            b.setType(Material.FIRE, false);
            lit++;
        }
        for (Block soil : collectFarmland(world)) {
            Block top = soil.getRelative(0, 1, 0);
            if (top.getType().isAir()) {
                top.setType(Material.FIRE, false);
                lit++;
            }
        }
        try { world.setGameRule(GameRule.DO_FIRE_TICK, true); } catch (Exception ignored) {}
        spreadFireBriefly(world, 100);
        broadcast("§cจุดไฟ §e" + lit + " §cจุด");
        runFunctionQuiet("events/wipe");
        return true;
    }

    /** น้ำท่วมนา — คลื่นไหลจากฝั่งหนึ่งไปอีกฝั่ง แล้วหายทั้งแปลง (ไม่ไหลกลับ) */
    public boolean flood() {
        if (!ensureActive()) return false;
        World world = primaryWorld();
        titleAll("น้ำท่วมนา!", "คลื่นกำลังไหลไปอีกฝั่ง...", NamedTextColor.AQUA);
        broadcast("§b§l🌊 น้ำท่วมนา — คลื่นไหลข้ามนา!");
        Location mid = midLoc(world);
        playFarm(Sound.ENTITY_GENERIC_SPLASH, 1.8f, 0.55f);
        playFarm(Sound.BLOCK_WATER_AMBIENT, 1.5f, 0.7f);
        playFarm(Sound.ITEM_BUCKET_FILL, 1.2f, 0.6f);
        playFarm(Sound.ENTITY_PLAYER_SPLASH_HIGH_SPEED, 1.0f, 0.8f);
        playFarm(Sound.WEATHER_RAIN, 0.7f, 0.9f);

        int cropY = builder.getCropY();
        int cx = builder.getCenterX();
        int cz = builder.getCenterZ();
        int half = builder.getHalf() - 1;

        // คลื่นจาก -Z ไป +Z (ฝั่งหนึ่ง → อีกฝั่ง)
        Map<Integer, List<int[]>> waves = new TreeMap<>();
        for (int x = cx - half; x <= cx + half; x++) {
            for (int z = cz - half; z <= cz + half; z++) {
                if (!isFarmPlot(x, z)) continue;
                int waveIdx = (z - (cz - half));
                waves.computeIfAbsent(waveIdx, k -> new ArrayList<>()).add(new int[]{x, z});
            }
        }
        if (waves.isEmpty()) return false;

        List<Integer> order = new ArrayList<>(waves.keySet());
        List<Block> flooded = new ArrayList<>();
        AtomicInteger wave = new AtomicInteger(0);
        AtomicInteger extinguished = new AtomicInteger(0);

        if (floodTask != null) floodTask.cancel();
        floodTask = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            int wi = wave.getAndIncrement();
            if (wi >= order.size()) {
                if (floodTask != null) { floodTask.cancel(); floodTask = null; }
                try { world.setGameRule(GameRule.DO_FIRE_TICK, false); } catch (Exception ignored) {}
                broadcast("§bดับไฟ §e" + extinguished.get() + " §bจุด · น้ำจะไหลออกอีกฝั่งใน 3 วิ");
                // ลดน้ำต่อในทิศเดิม (จากฝั่งเริ่ม → ฝั่งปลาย) แล้วเคลียร์ที่เหลือ — ไม่ย้อนกลับ
                AtomicInteger drain = new AtomicInteger(0);
                Bukkit.getScheduler().runTaskTimer(plugin, drainTask -> {
                    int di = drain.getAndIncrement();
                    if (di >= order.size()) {
                        drainTask.cancel();
                        for (Block b : flooded) {
                            if (!b.getWorld().equals(world)) continue;
                            if (b.getType() != Material.WATER) continue;
                            boolean wasWheat = b.hasMetadata("fm_was_wheat");
                            b.removeMetadata("fm_was_wheat", plugin);
                            if (wasWheat) plantWheatFull(b);
                            else b.setType(Material.AIR, false);
                        }
                        flooded.clear();
                        broadcast("§7น้ำลดแล้ว — นาพร้อมปลูกต่อ");
                        playFarm(Sound.BLOCK_ROOTS_BREAK, 0.8f, 1.2f);
                        return;
                    }
                    int key = order.get(di);
                    for (int[] xz : waves.get(key)) {
                        Block crop = world.getBlockAt(xz[0], cropY, xz[1]);
                        if (crop.getType() != Material.WATER) continue;
                        boolean wasWheat = crop.hasMetadata("fm_was_wheat");
                        crop.removeMetadata("fm_was_wheat", plugin);
                        if (wasWheat) plantWheatFull(crop);
                        else crop.setType(Material.AIR, false);
                        flooded.remove(crop);
                    }
                    playFarm(Sound.BLOCK_WATER_AMBIENT, 0.35f, 1.5f);
                }, 60L, 3L);
                return;
            }

            int key = order.get(wi);
            for (int[] xz : waves.get(key)) {
                int x = xz[0], z = xz[1];
                Block crop = world.getBlockAt(x, cropY, z);
                Material t = crop.getType();
                // ดับไฟเฉพาะเมื่อคลื่นน้ำถึงช่องนี้
                if (t == Material.FIRE || t == Material.SOUL_FIRE || t.name().contains("FIRE")) {
                    crop.setType(Material.AIR, false);
                    extinguished.incrementAndGet();
                    t = Material.AIR;
                }
                if (t == Material.WHEAT || t.isAir() || t == Material.WATER) {
                    boolean wasWheat = t == Material.WHEAT || crop.hasMetadata("fm_was_wheat");
                    if (wasWheat) {
                        crop.setMetadata("fm_was_wheat", new org.bukkit.metadata.FixedMetadataValue(plugin, true));
                    }
                    crop.setType(Material.WATER, false);
                    if (!flooded.contains(crop)) flooded.add(crop);
                }
                world.spawnParticle(Particle.SPLASH, x + 0.5, cropY + 0.9, z + 0.5, 8, 0.25, 0.15, 0.25, 0.02);
            }
            if (wi % 2 == 0) {
                playFarm(Sound.ENTITY_GENERIC_SPLASH, 0.75f, 0.65f + wi * 0.015f);
                playFarm(Sound.BLOCK_WATER_AMBIENT, 0.55f, 0.9f);
            }
            if (wi % 5 == 0) {
                playFarm(Sound.ENTITY_PLAYER_SPLASH, 0.8f, 0.75f);
                playFarm(Sound.ITEM_BUCKET_EMPTY, 0.5f, 0.85f);
            }
        }, 5L, 4L);

        runFunctionQuiet("events/flood");
        return true;
    }

    /** มังกรพ่นไฟ — EnderDragon จริง + CIRCLING/velocity ให้ปีกกระพือ (ห้าม HOVER+teleport ทุกติ๊ก) */
    public boolean dragonBurn() {
        if (!ensureActive()) return false;
        World world = primaryWorld();
        removeDragon();
        titleAll("มังกรบุก!", "พ่นไฟเผาทั้งนา", NamedTextColor.DARK_PURPLE);
        broadcast("§5§l🐉 มังกรพ่นไฟ — บินเผาทั้งนา!");
        Location mid = midLoc(world);
        playFarm(Sound.ENTITY_ENDER_DRAGON_GROWL, 3f, 0.75f);
        playFarm(Sound.ENTITY_ENDER_DRAGON_AMBIENT, 2f, 0.9f);
        runFunctionQuiet("events/dragon");

        int half = builder.getHalf() - 1;
        int cx = builder.getCenterX();
        int cz = builder.getCenterZ();
        int cropY = builder.getCropY();
        final int maxTicks = Math.max(half * 2 + 1, 120);
        double flyY = cropY + 18;
        Location podium = new Location(world, cx + 0.5, flyY, cz + 0.5);

        Location spawn = new Location(world, cx - half - 10 + 0.5, flyY, cz + 0.5, -90f, 15f);

        EnderDragon dragon;
        try {
            dragon = world.spawn(spawn, EnderDragon.class, d -> {
                d.addScoreboardTag("tc_farm_dragon");
                d.addScoreboardTag("tc_farm");
                d.customName(Component.text("มังกรบุก", NamedTextColor.DARK_PURPLE, TextDecoration.BOLD));
                d.setCustomNameVisible(true);
                d.setRemoveWhenFarAway(false);
                d.setPersistent(true);
                d.setInvulnerable(true);
                d.setSilent(false);
                d.setGravity(false);
                d.setGlowing(false);
                // CIRCLING + AI = ฝั่ง client เล่นอนิเมชันปีกบิน (HOVER จะแข็งนิ่ง)
                try { d.setPodium(podium); } catch (Throwable ignored) {}
                try { d.setPhase(EnderDragon.Phase.CIRCLING); } catch (Throwable ignored) {}
                d.setAI(true);
                try { d.setAware(true); } catch (Throwable ignored) {}
            });
        } catch (Throwable t) {
            plugin.getLogger().warning("dragon spawn: " + t.getMessage());
            igniteAllPlots(world);
            return true;
        }
        activeDragon = dragon;
        activePhantom = null;

        AtomicInteger wave = new AtomicInteger(0);
        dragonTask = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            int w = wave.getAndIncrement();
            boolean done = w >= maxTicks || !active;
            if (done) {
                if (dragonTask != null) { dragonTask.cancel(); dragonTask = null; }
                igniteAllPlots(world);
                playFarm(Sound.ENTITY_ENDER_DRAGON_GROWL, 2.5f, 0.6f);
                Bukkit.getScheduler().runTaskLater(plugin, this::removeDragon, 30L);
                titleAll("นาถูกเผา!", "ใช้ขวดน้ำ / น้ำท่วม ดับไฟ", NamedTextColor.RED);
                return;
            }

            int x = cx - half + Math.min(w, half * 2);
            double bob = Math.sin(w * 0.28) * 3.2;
            Location waypoint = new Location(world, x + 0.5, flyY + bob, cz + 0.5);

            EnderDragon fly = activeDragon;
            if (fly == null || !fly.isValid()) {
                try {
                    activeDragon = world.spawn(waypoint, EnderDragon.class, d -> {
                        d.addScoreboardTag("tc_farm_dragon");
                        d.addScoreboardTag("tc_farm");
                        d.customName(Component.text("มังกรบุก", NamedTextColor.DARK_PURPLE, TextDecoration.BOLD));
                        d.setCustomNameVisible(true);
                        d.setRemoveWhenFarAway(false);
                        d.setPersistent(true);
                        d.setInvulnerable(true);
                        d.setGravity(false);
                        d.setGlowing(false);
                        try { d.setPodium(podium); } catch (Throwable ignored) {}
                        try { d.setPhase(EnderDragon.Phase.CIRCLING); } catch (Throwable ignored) {}
                        d.setAI(true);
                    });
                    fly = activeDragon;
                } catch (Throwable ignored) {}
            } else {
                // คง phase บินทุกติ๊ก — client อัปเดตปีกจาก CIRCLING + ความเร็ว
                try { fly.setPhase(EnderDragon.Phase.CIRCLING); } catch (Throwable ignored) {}
                try { fly.setPodium(podium); } catch (Throwable ignored) {}
                if (!fly.hasAI()) fly.setAI(true);
                try { fly.setGlowing(false); } catch (Throwable ignored) {}

                Location cur = fly.getLocation();
                Vector dir = waypoint.toVector().subtract(cur.toVector());
                double dist = dir.length();
                if (dist > 0.35) {
                    Vector vel = dir.normalize().multiply(Math.min(1.35, 0.55 + dist * 0.08));
                    fly.setVelocity(vel);
                    // EnderDragon โมเดลหันกลับกับ LivingEntity ปกติ → +180
                    float yaw = (float) Math.toDegrees(Math.atan2(-vel.getX(), vel.getZ())) + 180f;
                    fly.setRotation(yaw, 0f);
                }
                // หลุดเส้นทางมากค่อยดึงกลับ (ไม่ teleport ทุกติ๊ก — กันอนิเมชันค้าง)
                if (dist > 18) {
                    Location snap = waypoint.clone();
                    snap.setYaw((float) Math.toDegrees(Math.atan2(
                            -(waypoint.getX() - cur.getX()),
                            waypoint.getZ() - cur.getZ())) + 180f);
                    fly.teleport(snap);
                    try { fly.setPhase(EnderDragon.Phase.CIRCLING); } catch (Throwable ignored) {}
                }
            }

            Location cur = (fly != null && fly.isValid()) ? fly.getLocation() : waypoint;
            world.spawnParticle(Particle.DRAGON_BREATH, cur.clone().add(0, -2, 0), 40, 1.6, 1.0, 1.6, 0.03);
            world.spawnParticle(Particle.FLAME, cur.clone().add(0, -3.2, 0), 22, 1.1, 1.2, 1.1, 0.03);

            for (int z = cz - half; z <= cz + half; z++) {
                if (!isFarmPlot(x, z)) continue;
                Block crop = world.getBlockAt(x, cropY, z);
                if (crop.getType() == Material.WHEAT || crop.getType().isAir()
                        || crop.getType() == Material.FIRE || crop.getType() == Material.SHORT_GRASS) {
                    crop.setType(Material.FIRE, false);
                }
            }
            if (w % 3 == 0) {
                playFarm(Sound.ENTITY_ENDER_DRAGON_FLAP, 1.8f, 0.85f);
            }
            if (w % 10 == 0) {
                playFarm(Sound.ENTITY_ENDER_DRAGON_GROWL, 2.0f, 0.9f);
                playFarm(Sound.ENTITY_ENDER_DRAGON_AMBIENT, 1.2f, 0.8f);
            }
        }, 1L, 1L);

        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (dragonTask != null) { dragonTask.cancel(); dragonTask = null; }
            removeDragon();
        }, Math.max(240L, maxTicks + 60L));

        try { world.setGameRule(GameRule.DO_FIRE_TICK, true); } catch (Exception ignored) {}
        return true;
    }

    public boolean giveWater() {
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (primaryWorld() != null && p.getWorld().equals(primaryWorld())) {
                p.getInventory().addItem(splashWater(8));
                p.sendMessage("§9💧 ได้ Splash Water Bottle ×8");
            }
        }
        runFunctionQuiet("events/give_water");
        return true;
    }

    public boolean giveSnowballs() {
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (primaryWorld() != null && p.getWorld().equals(primaryWorld())) {
                p.getInventory().addItem(new ItemStack(Material.SNOWBALL, 16));
                p.sendMessage("§b❄ ได้ Snowball ×16 — ปาลงนาเพื่อปลูก");
            }
        }
        return true;
    }

    private void igniteAllPlots(World world) {
        int cropY = builder.getCropY();
        for (Block soil : collectFarmland(world)) {
            Block top = world.getBlockAt(soil.getX(), cropY, soil.getZ());
            if (top.getType() == Material.WHEAT || top.getType().isAir() || top.getType() == Material.FIRE) {
                top.setType(Material.FIRE, false);
            }
        }
    }

    private void spreadFireBriefly(World world, int ticks) {
        AtomicInteger left = new AtomicInteger(ticks);
        Bukkit.getScheduler().runTaskTimer(plugin, task -> {
            if (left.decrementAndGet() <= 0 || !active) {
                try { world.setGameRule(GameRule.DO_FIRE_TICK, false); } catch (Exception ignored) {}
                task.cancel();
                return;
            }
            if (left.get() % 10 != 0) return;
            List<Block> wheat = collectWheat(world);
            for (Block w : wheat) {
                if (random.nextFloat() > 0.25f) continue;
                if (hasAdjacentFire(w)) {
                    w.setType(Material.FIRE, false);
                    world.spawnParticle(Particle.FLAME, w.getLocation().add(0.5, 0.3, 0.5), 6, 0.2, 0.15, 0.2, 0.01);
                }
            }
        }, 10L, 5L);
    }

    private boolean hasAdjacentFire(Block b) {
        return b.getRelative(1, 0, 0).getType() == Material.FIRE
                || b.getRelative(-1, 0, 0).getType() == Material.FIRE
                || b.getRelative(0, 0, 1).getType() == Material.FIRE
                || b.getRelative(0, 0, -1).getType() == Material.FIRE;
    }

    private void farmTick() {
        if (!active) return;
        World world = primaryWorld();
        if (world == null) return;

        for (Player p : Bukkit.getOnlinePlayers()) {
            if (p.getWorld().equals(world)) {
                refillUnlimitedKit(p);
                if (!p.getAllowFlight()) enableFarmFlight(p);
            }
        }

        // รักษา farmland ไม่ให้พัง (ทุก ~2 วินาที)
        if (!cinematicBusy && world.getFullTime() % 40L < 4L) {
            maintainFarmland(world);
        }

        long now = world.getFullTime();
        // วัว/ชาวนา ใช้ burst teleport จาก event — ไม่ pathfind ใน tick
        if (now % 40L < 4L) {
            for (Entity e : new ArrayList<>(world.getEntities())) {
                if (e.getScoreboardTags().contains("tc_farm_cow") && e instanceof Cow cow) {
                    containInsideFence(cow);
                }
                if (e.getScoreboardTags().contains("tc_farm_helper") && e instanceof Villager vil) {
                    containInsideFence(vil);
                }
                if (e.getScoreboardTags().contains("tc_farm_snowman") && e instanceof LivingEntity sm) {
                    containOnTower(sm);
                }
                if (e.getScoreboardTags().contains("tc_farm_blaze") && e instanceof LivingEntity blaze) {
                    containOnTower(blaze);
                    if (blaze instanceof Blaze b) b.setTarget(null);
                }
            }
        }

        for (Entity e : world.getEntities()) {
            // ไม่ดับไฟทั้งแมพจาก AREA_EFFECT_CLOUD — ใช้ PotionSplashEvent เฉพาะจุดแทน
            if (e.getType().name().contains("AREA_EFFECT_CLOUD")) {
                Location loc = e.getLocation();
                if (isFarmPlot(loc.getBlockX(), loc.getBlockZ())
                        || Math.abs(loc.getBlockX() - builder.getCenterX()) < builder.getHalf() + 8) {
                    e.remove();
                }
                continue;
            }
            if (!(e instanceof org.bukkit.entity.Projectile proj)) continue;
            if (!(proj.getShooter() instanceof Player pl)) continue;
            String type = e.getType().name();
            if (!type.equals("POTION") && !type.contains("SNOWBALL")) continue;
            refillUnlimitedKit(pl);
        }

        // กันรั้วติดไฟ + ล็อกกลางวัน
        protectFenceFromFire(world);
        if (world.getFullTime() % 100L < 4L) {
            try {
                world.setGameRule(GameRule.DO_DAYLIGHT_CYCLE, false);
                world.setTime(1000L);
            } catch (Exception ignored) {}
        }

        checkWinProgress(world);
        if (world.getFullTime() % 10L < 4L) {
            updateProgressBar(world);
        }
    }

    private void ensureProgressBar() {
        if (progressBar != null) return;
        progressBar = Bukkit.createBossBar("§aFarm 0%", BarColor.GREEN, BarStyle.SOLID);
        progressBar.setProgress(0);
        progressBar.setVisible(true);
    }

    private void removeProgressBar() {
        if (progressBar == null) return;
        progressBar.removeAll();
        progressBar.setVisible(false);
        progressBar = null;
    }

    private void updateProgressBar(World world) {
        if (!active || world == null) return;
        ensureProgressBar();
        int total = 0;
        int planted = 0;
        int full = 0;
        for (Block soil : collectFarmland(world)) {
            total++;
            Block crop = worldCropAbove(soil);
            if (crop.getType() == Material.WHEAT) {
                planted++;
                if (isFullWheat(crop)) full++;
            }
        }
        double plantedPct = total <= 0 ? 0 : (double) planted / total;
        double fullPct = total <= 0 ? 0 : (double) full / total;
        // หลอดหลัก = โตเต็ม (เงื่อนไขชนะ) — กันค้าง 100% หลังวัวกิน/เสียหาย
        progressBar.setProgress(Math.max(0, Math.min(1.0, fullPct)));
        progressBar.setTitle("§a§lความคืบหน้า §f" + pctLabel(plantedPct)
                + "% §7· โตเต็ม §e" + pctLabel(fullPct) + "%");
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (p.getWorld().equals(world)) {
                progressBar.addPlayer(p);
            } else {
                progressBar.removePlayer(p);
            }
        }
    }

    /** แสดง 100 เฉพาะเมื่อครบจริง — กัน Math.round แล้วค้าง 100% หลังเสียแปลงนิดเดียว */
    private static int pctLabel(double ratio) {
        if (ratio >= 1.0 - 1e-9) return 100;
        if (ratio <= 0) return 0;
        return (int) Math.floor(ratio * 100.0);
    }

    private void suppressChatNoise(Player p) {
        if (p == null) return;
        try { p.sendActionBar(Component.empty()); } catch (Throwable ignored) {}
    }

    /** ดับไฟรัศมีจำกัดรอบจุดตกขวดน้ำ — ยกเลิก vanilla ที่ดับวงกว้าง */
    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = false)
    public void onWaterSplash(org.bukkit.event.entity.PotionSplashEvent event) {
        if (!active) return;
        if (!(event.getEntity().getShooter() instanceof Player player)) return;
        World world = event.getEntity().getWorld();
        if (world == null || primaryWorld() == null || !world.equals(primaryWorld())) return;
        if (!isFarmWaterBottle(event.getPotion().getItem())) return;
        // ยกเลิก vanilla ก่อนเสมอ — กันดับไฟทั้งวงกว้าง
        event.setCancelled(true);
        try { event.getAffectedEntities().clear(); } catch (Throwable ignored) {}
        Location hit = event.getEntity().getLocation();
        applyWaterExtinguish(player, world, hit, event.getEntity());
    }

    /**
     * จับตอนขวดชนบล็อก/เอนทิตี — ลบขวดทันทีแล้วดับเฉพาะ AABB รัศมีจำกัด
     * (กัน NMS ดับไฟวงใหญ่ก่อน/หลัง splash)
     */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = false)
    public void onWaterPotionHit(ProjectileHitEvent event) {
        if (!active) return;
        if (!(event.getEntity() instanceof org.bukkit.entity.ThrownPotion potion)) return;
        if (!(potion.getShooter() instanceof Player player)) return;
        World world = potion.getWorld();
        if (world == null || primaryWorld() == null || !world.equals(primaryWorld())) return;
        if (!isFarmWaterBottle(potion.getItem())) return;

        Location hit = event.getHitBlock() != null
                ? event.getHitBlock().getLocation().add(0.5, 1.0, 0.5)
                : (event.getHitEntity() != null
                    ? event.getHitEntity().getLocation()
                    : potion.getLocation());
        // snap ลงชั้นนาถ้าตกใกล้ crop
        int cropY = builder.getCropY();
        if (Math.abs(hit.getBlockY() - cropY) <= 6) {
            hit.setY(cropY + 0.5);
        }
        applyWaterExtinguish(player, world, hit, potion);
    }

    private boolean isFarmWaterBottle(ItemStack item) {
        if (item == null || item.getType() != Material.SPLASH_POTION) return false;
        if (item.getItemMeta() instanceof PotionMeta meta) {
            try {
                return meta.getBasePotionType() == PotionType.WATER;
            } catch (Throwable ignored) {
                return true;
            }
        }
        return true;
    }

    private void applyWaterExtinguish(Player player, World world, Location hit, Entity potionEntity) {
        if (potionEntity != null) {
            if (potionEntity.getScoreboardTags().contains("tc_water_done")) return;
            potionEntity.addScoreboardTag("tc_water_done");
            try { potionEntity.remove(); } catch (Throwable ignored) {}
        }
        // ลบ cloud วานิลลาที่อาจดับไฟกว้าง
        int clearR = WATER_EXTINGUISH_RADIUS + 2;
        for (Entity e : world.getNearbyEntities(hit, clearR, clearR, clearR)) {
            if (e.getType().name().contains("AREA_EFFECT_CLOUD")) e.remove();
        }
        Bukkit.getScheduler().runTask(plugin, () -> {
            for (Entity e : world.getNearbyEntities(hit, clearR, clearR, clearR)) {
                if (e.getType().name().contains("AREA_EFFECT_CLOUD")) e.remove();
            }
        });

        int extinguished = extinguishFireNear(world, hit, WATER_EXTINGUISH_RADIUS);
        playFarm(Sound.ENTITY_GENERIC_SPLASH, 1.0f, 1.15f);
        world.spawnParticle(Particle.SPLASH, hit, 30, 1.1, 0.4, 1.1, 0.06);
        if (extinguished > 0) {
            playFarm(Sound.BLOCK_FIRE_EXTINGUISH, 0.9f, 1.2f);
            world.spawnParticle(Particle.CLOUD, hit, 18, 1.1, 0.4, 1.1, 0.02);
        }
        refillUnlimitedKit(player);
    }

    /**
     * ดับไฟเฉพาะกล่อง 3D รอบจุดกระทบ — รัศมี XZ ≤ 4, Y ±2
     * ไม่สแกนทั้ง world / ทั้งนา
     */
    private int extinguishFireNear(World world, Location center, int radius) {
        int n = 0;
        if (world == null || center == null) return 0;
        int r = Math.max(3, Math.min(6, radius)); // บังคับช่วง 3–6
        int cx = center.getBlockX();
        int cy = center.getBlockY();
        int cz = center.getBlockZ();
        int cropY = builder.getCropY();
        // ศูนย์กลาง Y: ใช้จุดตก แต่ดึงเข้าใกล้ cropY ถ้าไกลเกิน
        if (Math.abs(cy - cropY) > 4) cy = cropY;
        int yMin = cy - 2;
        int yMax = cy + 2;
        int r2 = r * r;

        for (int dx = -r; dx <= r; dx++) {
            for (int dz = -r; dz <= r; dz++) {
                if (dx * dx + dz * dz > r2) continue; // วงกลมในรัศมี
                int x = cx + dx;
                int z = cz + dz;
                for (int y = yMin; y <= yMax; y++) {
                    Block b = world.getBlockAt(x, y, z);
                    Material type = b.getType();
                    if (type == Material.FIRE || type == Material.SOUL_FIRE) {
                        b.setType(Material.AIR, false);
                        world.spawnParticle(Particle.CLOUD, b.getLocation().add(0.5, 0.2, 0.5), 3, 0.1, 0.08, 0.1, 0.01);
                        n++;
                    }
                }
            }
        }
        return n;
    }

    /** กันรั้ว / เสาไม้ติดไฟ */
    private void protectFenceFromFire(World world) {
        int half = builder.getHalf();
        int cx = builder.getCenterX();
        int cz = builder.getCenterZ();
        int fy = builder.getFloorY();
        // สแกนขอบรั้วเท่านั้น
        for (int x = cx - half; x <= cx + half; x++) {
            clearFireOnFenceColumn(world, x, fy, cz - half);
            clearFireOnFenceColumn(world, x, fy, cz + half);
        }
        for (int z = cz - half; z <= cz + half; z++) {
            clearFireOnFenceColumn(world, cx - half, fy, z);
            clearFireOnFenceColumn(world, cx + half, fy, z);
        }
    }

    private void clearFireOnFenceColumn(World world, int x, int fy, int z) {
        for (int y = fy; y <= fy + 6; y++) {
            Block b = world.getBlockAt(x, y, z);
            Material m = b.getType();
            if (m == Material.FIRE || m == Material.SOUL_FIRE) {
                b.setType(Material.AIR, false);
            }
            // ถ้าไฟอยู่บนรั้วข้างๆ
            for (int dx = -1; dx <= 1; dx++) {
                for (int dz = -1; dz <= 1; dz++) {
                    if (dx == 0 && dz == 0) continue;
                    Block n = world.getBlockAt(x + dx, y, z + dz);
                    if ((n.getType() == Material.FIRE || n.getType() == Material.SOUL_FIRE)
                            && isFenceMaterial(world.getBlockAt(x, y, z).getType())) {
                        n.setType(Material.AIR, false);
                    }
                }
            }
        }
    }

    private boolean isFenceMaterial(Material m) {
        if (m == null || m.isAir()) return false;
        if (m == Material.OAK_FENCE || m == Material.OAK_FENCE_GATE
                || m == Material.SPRUCE_PLANKS || m == Material.STRIPPED_OAK_LOG
                || m == Material.COBBLESTONE || m == Material.STONE_BRICKS
                || m == Material.MOSSY_STONE_BRICKS || m == Material.STONE_BRICK_WALL
                || m == Material.LANTERN) return true;
        String n = m.name();
        return n.contains("FENCE") || n.contains("BRICK") || n.contains("_WALL");
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onBlockIgnite(org.bukkit.event.block.BlockIgniteEvent event) {
        if (!active) return;
        Block b = event.getBlock();
        if (primaryWorld() == null || !b.getWorld().equals(primaryWorld())) return;
        if (isFenceMaterial(b.getType()) || isNearFenceLine(b.getX(), b.getZ())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onBlockBurn(org.bukkit.event.block.BlockBurnEvent event) {
        if (!active) return;
        Block b = event.getBlock();
        if (primaryWorld() == null || !b.getWorld().equals(primaryWorld())) return;
        if (isFenceMaterial(b.getType()) || isNearFenceLine(b.getX(), b.getZ())) {
            event.setCancelled(true);
        }
    }

    private boolean isNearFenceLine(int x, int z) {
        int h = builder.getHalf();
        int cx = builder.getCenterX();
        int cz = builder.getCenterZ();
        return Math.abs(x - cx) == h || Math.abs(z - cz) == h
                || Math.abs(x - cx) == h - 1 || Math.abs(z - cz) == h - 1;
    }

    private void maintainFarmland(World world) {
        int half = builder.getHalf() - 1;
        int cx = builder.getCenterX();
        int cz = builder.getCenterZ();
        int fy = builder.getFloorY();
        for (int x = cx - half; x <= cx + half; x++) {
            for (int z = cz - half; z <= cz + half; z++) {
                if (!isFarmPlot(x, z)) continue;
                Block soil = world.getBlockAt(x, fy, z);
                if (soil.getType() == Material.DIRT || soil.getType() == Material.GRASS_BLOCK
                        || soil.getType() == Material.COARSE_DIRT || soil.getType() == Material.FARMLAND) {
                    FarmBuilder.setFarmlandMoist(world, x, fy, z);
                }
            }
        }
    }

    private boolean canActNow(Entity e, long now) {
        return canActNow(e, now, MOB_ACTION_INTERVAL_TICKS);
    }

    private boolean canActNow(Entity e, long now, int interval) {
        long last = e.getPersistentDataContainer().getOrDefault(keyLastAction, PersistentDataType.LONG, 0L);
        return now - last >= interval;
    }

    private void markActed(Entity e, long now) {
        e.getPersistentDataContainer().set(keyLastAction, PersistentDataType.LONG, now);
    }

    private void pathTo(LivingEntity mob, Location dest) {
        if (dest == null) return;
        try {
            if (mob instanceof org.bukkit.entity.Mob m) {
                m.getPathfinder().moveTo(dest, 1.35);
                return;
            }
        } catch (Throwable ignored) {}
        // fallback นุ่มๆ — ไม่กระตุกทุกติ๊ก
        Vector dir = dest.toVector().subtract(mob.getLocation().toVector());
        if (dir.lengthSquared() < 0.04) return;
        dir.setY(0);
        if (dir.lengthSquared() < 1.0e-4) return;
        dir.normalize().multiply(0.22);
        Vector cur = mob.getVelocity();
        mob.setVelocity(new Vector(
                cur.getX() * 0.4 + dir.getX() * 0.6,
                Math.max(cur.getY(), -0.1),
                cur.getZ() * 0.4 + dir.getZ() * 0.6
        ));
    }

    private Location findNearestCrop(LivingEntity mob, boolean seekWheat) {
        World world = mob.getWorld();
        Location best = null;
        double bestD = 22 * 22;
        int cx = mob.getLocation().getBlockX();
        int cz = mob.getLocation().getBlockZ();
        for (int x = cx - 14; x <= cx + 14; x++) {
            for (int z = cz - 14; z <= cz + 14; z++) {
                if (!isFarmPlot(x, z)) continue;
                Block crop = world.getBlockAt(x, builder.getCropY(), z);
                boolean match = seekWheat
                        ? crop.getType() == Material.WHEAT
                        : ((crop.getType().isAir() || crop.getType() == Material.FIRE || crop.getType() == Material.WHEAT)
                            && world.getBlockAt(x, builder.getFloorY(), z).getType() == Material.FARMLAND
                            && !(crop.getType() == Material.WHEAT && crop.getBlockData() instanceof Ageable a
                                && a.getAge() >= WHEAT_STAGE_FULL));
                if (!match) continue;
                double d = mob.getLocation().distanceSquared(crop.getLocation().add(0.5, 0, 0.5));
                if (d < bestD) {
                    bestD = d;
                    best = crop.getLocation().add(0.5, 0, 0.5);
                }
            }
        }
        return best;
    }

    private Block nearestWheatNear(World world, Location loc, double radius) {
        Block best = null;
        double bestD = radius * radius;
        int r = (int) Math.ceil(radius);
        for (int dx = -r; dx <= r; dx++) {
            for (int dz = -r; dz <= r; dz++) {
                int x = loc.getBlockX() + dx;
                int z = loc.getBlockZ() + dz;
                if (!isFarmPlot(x, z)) continue;
                Block crop = world.getBlockAt(x, builder.getCropY(), z);
                if (crop.getType() != Material.WHEAT) continue;
                double d = loc.distanceSquared(crop.getLocation().add(0.5, 0, 0.5));
                if (d < bestD) { bestD = d; best = crop; }
            }
        }
        return best;
    }

    private Block nearestEmptyNear(World world, Location loc, double radius) {
        Block best = null;
        double bestD = radius * radius;
        int r = (int) Math.ceil(radius);
        for (int dx = -r; dx <= r; dx++) {
            for (int dz = -r; dz <= r; dz++) {
                int x = loc.getBlockX() + dx;
                int z = loc.getBlockZ() + dz;
                if (!isFarmPlot(x, z)) continue;
                Block soil = world.getBlockAt(x, builder.getFloorY(), z);
                Block crop = world.getBlockAt(x, builder.getCropY(), z);
                if (soil.getType() != Material.FARMLAND) continue;
                boolean can = crop.getType().isAir() || crop.getType() == Material.FIRE
                        || (crop.getType() == Material.WHEAT && crop.getBlockData() instanceof Ageable a
                            && a.getAge() < WHEAT_STAGE_FULL);
                if (!can) continue;
                double d = loc.distanceSquared(crop.getLocation().add(0.5, 0, 0.5));
                if (d < bestD) { bestD = d; best = crop; }
            }
        }
        return best;
    }

    private int bumpActions(Entity e) {
        int n = e.getPersistentDataContainer().getOrDefault(keyActions, PersistentDataType.INTEGER, 0) + 1;
        e.getPersistentDataContainer().set(keyActions, PersistentDataType.INTEGER, n);
        return n;
    }

    private void checkWinProgress(World world) {
        if (winCompleting || cinematicBusy) return;
        double ratio = fullWheatRatio(world);
        int fullNow = countFullWheat(world);
        if (ratio >= WIN_RATIO - 1e-9) {
            if (!winArmed) {
                startWinCountdown(ratio);
            }
        } else if (winArmed && !winCompleting) {
            // เสียข้าวแม้ต้นเดียวระหว่างนับ → พังทันที (เดิมใช้ 0.97 ทำให้วัวกินแล้วนับต่อ)
            if (fullNow < winFullWheatBaseline) {
                cancelWinCountdown(true);
            }
        }
    }

    /** เรียกเมื่อข้าวถูกทำลาย (วัว / พ่นไฟ / ฯลฯ) */
    private void onCropDestroyed(World world) {
        World w = world != null ? world : primaryWorld();
        if (winArmed && !winCompleting) {
            checkWinProgress(w);
        }
        updateProgressBar(w);
    }

    private int countFullWheat(World world) {
        int full = 0;
        for (Block soil : collectFarmland(world)) {
            if (isFullWheat(worldCropAbove(soil))) full++;
        }
        return full;
    }

    private void startWinCountdown(double ratio) {
        winArmed = true;
        winCompleting = false;
        winTicksLeft = WIN_HOLD_SEC * 20;
        winSecondsLeft = WIN_HOLD_SEC;
        winSlowAccum = 0;
        winHudPulse = 0;
        lastDramaticSec = -1;
        winFullWheatBaseline = countFullWheat(primaryWorld());
        winDeltaAwarded = true;
        BridgeHttpServer.queueWinDelta(1);
        broadcastTitle("§a§l" + WIN_HOLD_SEC, "§aนาเต็ม 100%!", 5, 25, 5);
        broadcast("§a§lนาเต็ม 100%! §fนับถอยหลัง §e" + WIN_HOLD_SEC + "§f วิ · §e+1 Win");
        playFarm(Sound.BLOCK_NOTE_BLOCK_PLING, 1.4f);
        playFarm(Sound.BLOCK_BELL_USE, 1.0f);
        updateProgressBar(primaryWorld());
        if (winTask != null) winTask.cancel();
        winTask = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            if (!active || !winArmed) {
                if (winTask != null) { winTask.cancel(); winTask = null; }
                return;
            }
            if (winCompleting) return;
            World w = primaryWorld();
            if (w == null || countFullWheat(w) < winFullWheatBaseline) {
                cancelWinCountdown(true);
                return;
            }
            // อัปเดตหลอดระหว่างนับ (กันค้าง 100%)
            if (winHudPulse % 10 == 0) updateProgressBar(w);
            tickWinCountdown();
            tickWinTitle();
        }, 1L, 1L);
    }

    private void tickWinCountdown() {
        int secLeft = Math.max(0, (winTicksLeft + 19) / 20);
        winSecondsLeft = secLeft;
        // 3 วิสุดท้ายนับช้าลง
        if (secLeft <= 3 && winTicksLeft > 0) {
            winSlowAccum++;
            if (winSlowAccum < WIN_SLOW_TICKS_PER_SEC) return;
            winSlowAccum = 0;
            winTicksLeft = Math.max(0, (secLeft - 1) * 20);
        } else {
            winSlowAccum = 0;
            winTicksLeft--;
        }
        if (winTicksLeft > 0) return;
        onFarmWin();
    }

    private void tickWinTitle() {
        winHudPulse++;
        int sec = Math.max(0, (winTicksLeft + 19) / 20);
        if (sec <= 3) {
            if (winHudPulse % 8 == 0) {
                String color = sec <= 1 ? "§c§l" : (sec == 2 ? "§6§l" : "§e§l");
                broadcastTitle(color + sec, "", 0, 12, 4);
                float pitch = 1.15f + (3 - sec) * 0.35f;
                playFarm(Sound.BLOCK_NOTE_BLOCK_PLING, pitch);
            }
            if (sec != lastDramaticSec) {
                lastDramaticSec = sec;
                playFarm(Sound.BLOCK_BELL_USE, 0.85f + (3 - sec) * 0.2f);
                playFarm(Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 1.4f);
            }
            return;
        }
        if (winHudPulse % 20 != 0) return;
        broadcastTitle("§a§l" + sec, "", 0, 25, 5);
        playFarm(Sound.BLOCK_NOTE_BLOCK_PLING, 1.0f);
    }

    private double fullWheatRatio(World world) {
        int farmland = 0;
        int full = 0;
        for (Block soil : collectFarmland(world)) {
            farmland++;
            if (isFullWheat(worldCropAbove(soil))) full++;
        }
        return farmland <= 0 ? 0 : (double) full / farmland;
    }

    private boolean isFullWheat(Block crop) {
        if (crop == null || crop.getType() != Material.WHEAT) return false;
        if (crop.getBlockData() instanceof Ageable age) return age.getAge() >= WHEAT_STAGE_FULL;
        return false;
    }

    private void cancelWinCountdown(boolean fail) {
        if (winCompleting) return;
        boolean wasArmed = winArmed;
        winArmed = false;
        winSecondsLeft = 0;
        winTicksLeft = 0;
        winSlowAccum = 0;
        lastDramaticSec = -1;
        winFullWheatBaseline = 0;
        if (winTask != null) { winTask.cancel(); winTask = null; }
        updateProgressBar(primaryWorld());
        if (!fail || !wasArmed) return;
        if (winDeltaAwarded) {
            BridgeHttpServer.queueWinDelta(-1);
            winDeltaAwarded = false;
        }
        broadcastTitle("§c§lพัง", "§fยกเลิกนับถอยหลัง · -1 Win", 5, 28, 10);
        playFarm(Sound.ENTITY_WITHER_HURT, 0.7f, 0.8f);
        updateProgressBar(primaryWorld());
    }

    private void onFarmWin() {
        if (winCompleting) return;
        winCompleting = true;
        winArmed = false;
        winTicksLeft = 0;
        winSecondsLeft = 0;
        winDeltaAwarded = false;
        if (winTask != null) { winTask.cancel(); winTask = null; }

        World world = primaryWorld();
        spawnTowerFireworks(world);
        broadcastTitle("§a§lชนะ!", "§fนาเต็มแล้ว · รีเซ็ตแมพ", 5, 30, 10);
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (world != null) {
                clearTagged(world, "tc_farm_cow");
                clearTagged(world, "tc_farm_helper");
                clearTagged(world, "tc_farm_snowman");
                clearTagged(world, "tc_farm_blaze");
                clearTagged(world, "tc_farm_dragon");
                clearTagged(world, "tc_farm_fox");
                builder.clearFarmEntities(world);
                GameSessionService cages = plugin.getGameSessionService();
                Map<UUID, int[]> cageRemain = cages != null ? cages.snapshotCages() : Map.of();
                if (cages != null) cages.detachCagesWithoutRestore();
                builder.resetMapAfterWin(world);
                if (cages != null) cages.reapplyCages(cageRemain);
                for (Player p : Bukkit.getOnlinePlayers()) {
                    if (p.getWorld().equals(world)) giveFarmKit(p);
                }
                updateProgressBar(world);
            }
            winCompleting = false;
            cinematicBusy = false;
            broadcastTitle("§e§lเริ่มใหม่", "§fปลูกข้าวให้ครบ 100%", 5, 30, 10);
            if (world != null) {
                playFarm(Sound.BLOCK_NOTE_BLOCK_PLING, 1.0f, 1.2f);
            }
        }, 60L);
    }

    private void spawnTowerFireworks(World world) {
        Location top = builder.getTowerTop(world);
        if (top == null) top = midLoc(world).add(0, 10, 0);
        Location base = top.clone();
        for (int i = 0; i < 5; i++) {
            final int delay = i * 8;
            final Location at = base.clone().add((i % 2 == 0 ? 1 : -1) * (i * 0.4), i * 0.15, (i % 3 - 1) * 0.5);
            Bukkit.getScheduler().runTaskLater(plugin, () -> {
                try {
                    world.spawn(at, org.bukkit.entity.Firework.class, fw -> {
                        fw.addScoreboardTag("tc_farm");
                        var meta = fw.getFireworkMeta();
                        meta.setPower(1);
                        meta.addEffect(org.bukkit.FireworkEffect.builder()
                                .with(org.bukkit.FireworkEffect.Type.BALL_LARGE)
                                .withColor(org.bukkit.Color.LIME, org.bukkit.Color.AQUA, org.bukkit.Color.YELLOW)
                                .withFade(org.bukkit.Color.WHITE)
                                .flicker(true)
                                .trail(true)
                                .build());
                        fw.setFireworkMeta(meta);
                    });
                } catch (Throwable t) {
                    world.spawnParticle(Particle.FIREWORK, at, 40, 0.6, 0.8, 0.6, 0.08);
                    playFarm(Sound.ENTITY_FIREWORK_ROCKET_BLAST, 1.2f, 1.0f);
                }
            }, delay);
        }
        playFarm(Sound.ENTITY_FIREWORK_ROCKET_LAUNCH, 1.5f, 1.0f);
    }

    public boolean playWinAbundanceCutscene() {
        return playWinAbundanceCutscene(false);
    }

    public boolean playLoseKalpaCutscene() {
        return playLoseKalpaCutscene(false);
    }

    /** คัทซีนบวกวิน: รวงข้าวทองคำแห่งความอุดมสมบูรณ์ + จิ้งจอกยักษ์กระโดด */
    private boolean playWinAbundanceCutscene(boolean fromMatchWin) {
        World world = primaryWorld();
        if (world == null) return false;
        cinematicBusy = true;
        Location mid = midLoc(world);
        broadcastTitle("§6§lรวงข้าวทองคำแห่งความอุดมสมบูรณ์", "§eนาอุดมสมบูรณ์!", 8, 55, 12);
        playFarm(Sound.BLOCK_BELL_USE, 1.6f, 1.0f);
        playFarm(Sound.UI_TOAST_CHALLENGE_COMPLETE, 1.15f, 1.05f);
        playFarm(Sound.ENTITY_PLAYER_LEVELUP, 0.95f, 1.2f);
        spawnFarmParticle(world, mid.clone().add(0, 1.2, 0), 90, 1.6, 1.1, 1.6, 0.18, "TOTEM_OF_UNDYING", "TOTEM");
        world.spawnParticle(Particle.HAPPY_VILLAGER, mid.clone().add(0, 0.8, 0), 70, 2.2, 0.8, 2.2, 0);
        runFunctionQuiet("events/win");
        spawnGiantWinFox(world);
        growWheatGoldenWave(world);
        if (fromMatchWin) spawnTowerFireworks(world);
        if (!fromMatchWin) {
            Bukkit.getScheduler().runTaskLater(plugin, () -> cinematicBusy = false, 100L);
        }
        return true;
    }

    private void growWheatGoldenWave(World world) {
        int cx = builder.getCenterX();
        int cz = builder.getCenterZ();
        int cropY = builder.getCropY();
        int half = Math.max(4, builder.getHalf() - 1);
        Map<Integer, List<int[]>> rings = new TreeMap<>();
        for (int x = cx - half; x <= cx + half; x++) {
            for (int z = cz - half; z <= cz + half; z++) {
                if (!isFarmPlot(x, z)) continue;
                int ring = Math.max(Math.abs(x - cx), Math.abs(z - cz));
                rings.computeIfAbsent(ring, k -> new ArrayList<>()).add(new int[]{x, z});
            }
        }
        List<Integer> order = new ArrayList<>(rings.keySet());
        AtomicInteger wi = new AtomicInteger(0);
        Bukkit.getScheduler().runTaskTimer(plugin, task -> {
            int i = wi.getAndIncrement();
            if (!active || i >= order.size()) {
                task.cancel();
                return;
            }
            for (int[] xz : rings.get(order.get(i))) {
                Block crop = world.getBlockAt(xz[0], cropY, xz[1]);
                if (crop.getType() == Material.FIRE || crop.getType() == Material.SOUL_FIRE) {
                    crop.setType(Material.AIR, false);
                }
                if (crop.getType().isAir() || crop.getType() == Material.WHEAT) {
                    plantWheatFull(crop);
                    Location p = crop.getLocation().add(0.5, 0.45, 0.5);
                    world.spawnParticle(Particle.END_ROD, p, 6, 0.18, 0.28, 0.18, 0.015);
                    world.spawnParticle(Particle.HAPPY_VILLAGER, p, 3, 0.12, 0.16, 0.12, 0);
                }
            }
            if (i % 2 == 0) playFarm(Sound.BLOCK_AMETHYST_BLOCK_CHIME, 0.45f, 1.3f + i * 0.02f);
        }, 4L, 2L);
    }

    private void spawnGiantWinFox(World world) {
        int cx = builder.getCenterX();
        int cz = builder.getCenterZ();
        int half = Math.max(8, builder.getHalf() - 3);
        double y0 = builder.getFloorY() + 1.05;
        Location start = new Location(world, cx - half + 0.5, y0, cz + 0.5, -90f, 0f);
        Location end = new Location(world, cx + half + 0.5, y0, cz + 0.5, -90f, 0f);
        Fox fox;
        try {
            fox = world.spawn(start, Fox.class, f -> {
                f.addScoreboardTag("tc_farm_fox");
                f.addScoreboardTag("tc_farm");
                try { f.setFoxType(Fox.Type.RED); } catch (Throwable ignored) {}
                f.customName(Component.text("จิ้งจอกแห่งชัยชนะ", NamedTextColor.GOLD, TextDecoration.BOLD));
                f.setCustomNameVisible(true);
                f.setInvulnerable(true);
                f.setAI(false);
                f.setGravity(false);
                f.setCollidable(false);
                f.setRemoveWhenFarAway(false);
                f.setPersistent(true);
                f.setSilent(true);
                scaleEntity(f, WIN_FOX_SCALE);
            });
        } catch (Throwable t) {
            plugin.getLogger().warning("win fox: " + t.getMessage());
            return;
        }
        playFarm(Sound.ENTITY_FOX_AMBIENT, 1.3f, 0.7f);
        playFarm(Sound.ENTITY_FOX_SLEEP, 0.9f, 0.85f);
        final int hops = 48;
        AtomicInteger tick = new AtomicInteger(0);
        Bukkit.getScheduler().runTaskTimer(plugin, task -> {
            int t = tick.getAndIncrement();
            if (!active || fox == null || !fox.isValid() || t > hops) {
                task.cancel();
                if (fox != null && fox.isValid()) {
                    world.spawnParticle(Particle.CLOUD, fox.getLocation().add(0, 1.2, 0), 24, 0.6, 0.5, 0.6, 0.02);
                    fox.remove();
                }
                return;
            }
            double u = t / (double) hops;
            double x = start.getX() + (end.getX() - start.getX()) * u;
            double z = start.getZ() + (end.getZ() - start.getZ()) * u;
            double hop = Math.sin(u * Math.PI) * (FarmBuilder.TOWER_HEIGHT + 6.5);
            Location at = new Location(world, x, y0 + hop, z, -90f, u < 0.5 ? -18f : 12f);
            fox.teleport(at);
            world.spawnParticle(Particle.HAPPY_VILLAGER, at.clone().add(0, 1.1, 0), 6, 0.35, 0.4, 0.35, 0);
            world.spawnParticle(Particle.CLOUD, at.clone().add(0, 0.2, 0), 3, 0.25, 0.08, 0.25, 0.01);
            if (t % 8 == 0) playFarm(Sound.ENTITY_FOX_AMBIENT, 0.55f, 0.85f + (float) u * 0.4f);
            if (t == hops / 2) playFarm(Sound.ENTITY_FOX_SCREECH, 0.8f, 0.75f);
        }, 6L, 1L);
    }

    /** คัทซีนลบวิน: เพลิงกัลป์ล้างผืนนา */
    private boolean playLoseKalpaCutscene(boolean fromMatchLose) {
        World world = primaryWorld();
        if (world == null) return false;
        cinematicBusy = true;
        Location mid = midLoc(world);
        broadcastTitle("§4§lเพลิงกัลป์ล้างผืนนา", "§cนาถูกเผาเป็นเถ้าถ่าน", 6, 50, 14);
        playFarm(Sound.ENTITY_LIGHTNING_BOLT_THUNDER, 1.8f, 0.75f);
        playFarm(Sound.ENTITY_GENERIC_EXPLODE, 1.4f, 0.55f);
        playFarm(Sound.ENTITY_WITHER_HURT, 0.85f, 0.6f);
        try { world.strikeLightningEffect(mid.clone().add(0, 1, 0)); } catch (Throwable ignored) {}
        world.spawnParticle(Particle.FLAME, mid.clone().add(0, 0.6, 0), 80, 2.4, 0.7, 2.4, 0.04);
        spawnFarmParticle(world, mid.clone().add(0, 0.8, 0), 70, 2.2, 0.8, 2.2, 0.03, "LARGE_SMOKE", "CAMPFIRE_SIGNAL_SMOKE", "SMOKE");
        runFunctionQuiet("events/lose");
        burnWheatKalpaWave(world);
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            restoreFarmlandAfterKalpa(world);
            cinematicBusy = false;
            if (fromMatchLose) {
                broadcastTitle("§c§lพัง", "§fยกเลิกนับถอยหลัง · -1 Win", 5, 28, 10);
            }
        }, 90L);
        return true;
    }

    private void burnWheatKalpaWave(World world) {
        int cx = builder.getCenterX();
        int cz = builder.getCenterZ();
        int fy = builder.getFloorY();
        int cropY = builder.getCropY();
        int half = Math.max(4, builder.getHalf() - 1);
        Map<Integer, List<int[]>> rings = new TreeMap<>();
        for (int x = cx - half; x <= cx + half; x++) {
            for (int z = cz - half; z <= cz + half; z++) {
                if (!isFarmPlot(x, z)) continue;
                int ring = Math.max(Math.abs(x - cx), Math.abs(z - cz));
                rings.computeIfAbsent(ring, k -> new ArrayList<>()).add(new int[]{x, z});
            }
        }
        List<Integer> order = new ArrayList<>(rings.keySet());
        AtomicInteger wi = new AtomicInteger(0);
        try { world.setGameRule(GameRule.DO_FIRE_TICK, true); } catch (Exception ignored) {}
        Bukkit.getScheduler().runTaskTimer(plugin, task -> {
            int i = wi.getAndIncrement();
            if (!active || i >= order.size()) {
                task.cancel();
                return;
            }
            for (int[] xz : rings.get(order.get(i))) {
                Block soil = world.getBlockAt(xz[0], fy, xz[1]);
                Block crop = world.getBlockAt(xz[0], cropY, xz[1]);
                crop.setType(((xz[0] + xz[1]) & 1) == 0 ? Material.FIRE : Material.AIR, false);
                soil.setType(((xz[0] * 3 + xz[1]) % 5 == 0) ? Material.COAL_BLOCK : Material.COARSE_DIRT, false);
                Location p = crop.getLocation().add(0.5, 0.45, 0.5);
                world.spawnParticle(Particle.FLAME, p, 8, 0.2, 0.22, 0.2, 0.015);
                spawnFarmParticle(world, p, 5, 0.18, 0.2, 0.18, 0.01, "LARGE_SMOKE", "CAMPFIRE_COSY_SMOKE", "SMOKE");
            }
            if (i % 2 == 0) {
                playFarm(Sound.BLOCK_FIRE_AMBIENT, 0.7f, 0.8f);
                playFarm(Sound.ENTITY_GENERIC_EXPLODE, 0.35f, 0.45f);
            }
            if (i == 2) {
                try { world.strikeLightningEffect(midLoc(world).add(3, 0, -2)); } catch (Throwable ignored) {}
            }
        }, 2L, 2L);
    }

    private void restoreFarmlandAfterKalpa(World world) {
        if (world == null) return;
        try { world.setGameRule(GameRule.DO_FIRE_TICK, false); } catch (Exception ignored) {}
        int fy = builder.getFloorY();
        int cropY = builder.getCropY();
        for (int x = builder.getCenterX() - builder.getHalf(); x <= builder.getCenterX() + builder.getHalf(); x++) {
            for (int z = builder.getCenterZ() - builder.getHalf(); z <= builder.getCenterZ() + builder.getHalf(); z++) {
                if (!isFarmPlot(x, z)) continue;
                Block soil = world.getBlockAt(x, fy, z);
                Block crop = world.getBlockAt(x, cropY, z);
                if (crop.getType() == Material.FIRE || crop.getType() == Material.SOUL_FIRE
                        || crop.getType() == Material.COAL_BLOCK) {
                    crop.setType(Material.AIR, false);
                }
                if (soil.getType() == Material.COARSE_DIRT || soil.getType() == Material.COAL_BLOCK
                        || soil.getType() == Material.DIRT || soil.getType() == Material.FARMLAND) {
                    FarmBuilder.setFarmlandMoist(world, x, fy, z);
                }
            }
        }
        updateProgressBar(world);
    }

    private void scaleEntity(LivingEntity e, double scale) {
        if (e == null) return;
        try {
            var attr = e.getAttribute(Attribute.GENERIC_SCALE);
            if (attr != null) attr.setBaseValue(scale);
        } catch (Throwable ignored) {}
    }

    private void spawnFarmParticle(World world, Location loc, int count, double ox, double oy, double oz, double extra, String... names) {
        if (world == null || loc == null) return;
        for (String n : names) {
            try {
                world.spawnParticle(Particle.valueOf(n), loc, count, ox, oy, oz, extra);
                return;
            } catch (Throwable ignored) {}
        }
        try { world.spawnParticle(Particle.END_ROD, loc, Math.max(4, count / 2), ox, oy, oz, extra); } catch (Throwable ignored) {}
    }

    private void broadcastTitle(String title, String sub, int fadeIn, int stay, int fadeOut) {
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (plugin.isFarmMode() || FarmBuilder.isFarmWorld(p.getWorld())) {
                if (plugin.getGameSessionService() != null && plugin.getGameSessionService().isCaged(p)) continue;
                p.sendTitle(title, sub == null ? "" : sub, fadeIn, stay, fadeOut);
            }
        }
    }

    /** เล่นเสียงให้ผู้เล่นในโลกฟาร์มทุกคน — ที่ตำแหน่งผู้เล่นเอง (ได้ยินชัดไม่ว่าอยู่ไกลแค่ไหน) */
    private static final float SFX_VOL_SCALE = 0.38f;
    private static final float SFX_VOL_MIN = 0.18f;
    private static final float SFX_VOL_MAX = 0.48f;

    private void playFarm(Sound sound, float pitch) {
        playFarm(sound, 1f, pitch);
    }

    private void playFarm(Sound sound, float volume, float pitch) {
        // ลดระดับเสียงรวม — ไม่ดังหนวกหู
        float vol = Math.max(SFX_VOL_MIN, Math.min(SFX_VOL_MAX, volume * SFX_VOL_SCALE));
        float pit = pitch;
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!(plugin.isFarmMode() || FarmBuilder.isFarmWorld(p.getWorld()))) continue;
            p.playSound(p.getLocation(), sound, SoundCategory.MASTER, vol, pit);
        }
    }

    // ─── helpers ──────────────────────────────────────────────

    private boolean ensureActive() {
        if (active && builder.isBuilt()) return true;
        World w = primaryWorld();
        if (w == null) return false;
        start(w);
        return true;
    }

    private List<Block> collectWheat(World world) {
        List<Block> list = new ArrayList<>();
        int cropY = builder.getCropY();
        int cx = builder.getCenterX();
        int cz = builder.getCenterZ();
        int half = builder.getHalf() - 1;
        for (int x = cx - half; x <= cx + half; x++) {
            for (int z = cz - half; z <= cz + half; z++) {
                if (!isFarmPlot(x, z)) continue;
                Block b = world.getBlockAt(x, cropY, z);
                if (b.getType() == Material.WHEAT) list.add(b);
            }
        }
        return list;
    }

    private List<Block> collectFarmland(World world) {
        List<Block> list = new ArrayList<>();
        int fy = builder.getFloorY();
        int cx = builder.getCenterX();
        int cz = builder.getCenterZ();
        int half = builder.getHalf() - 1;
        for (int x = cx - half; x <= cx + half; x++) {
            for (int z = cz - half; z <= cz + half; z++) {
                if (!isFarmPlot(x, z)) continue;
                Block b = world.getBlockAt(x, fy, z);
                if (b.getType() == Material.FARMLAND) list.add(b);
            }
        }
        return list;
    }

    private List<Block> collectEmptyFarmlandTops(World world) {
        List<Block> list = new ArrayList<>();
        for (Block soil : collectFarmland(world)) {
            Block top = soil.getRelative(0, 1, 0);
            if (top.getType().isAir() || top.getType() == Material.FIRE) list.add(top);
        }
        return list;
    }

    private void clearTagged(World world, String tag) {
        for (Entity e : new ArrayList<>(world.getEntities())) {
            if (e.getScoreboardTags().contains(tag)) e.remove();
        }
    }

    private void removeDragon() {
        if (dragonTask != null) {
            try { dragonTask.cancel(); } catch (Exception ignored) {}
            dragonTask = null;
        }
        if (activePhantom != null) {
            try { activePhantom.remove(); } catch (Exception ignored) {}
            activePhantom = null;
        }
        if (activeDragon != null) {
            try { activeDragon.remove(); } catch (Exception ignored) {}
            activeDragon = null;
        }
        World w = primaryWorld();
        if (w != null) clearTagged(w, "tc_farm_dragon");
    }

    private Location groundLoc(World world, int x, int y, int z) {
        return new Location(world, x + 0.5, y, z + 0.5);
    }

    private Location midLoc(World world) {
        if (builder.getFarmSpawn() != null) return builder.getFarmSpawn().clone();
        return new Location(world, builder.getCenterX() + 0.5, builder.getCropY() + 1, builder.getCenterZ() + 0.5);
    }

    private void titleAll(String main, String sub, NamedTextColor color) {
        Title title = Title.title(
                Component.text(main, color, TextDecoration.BOLD),
                Component.text(sub, NamedTextColor.WHITE),
                Title.Times.times(Duration.ofMillis(100), Duration.ofSeconds(3), Duration.ofMillis(400))
        );
        for (Player p : Bukkit.getOnlinePlayers()) p.showTitle(title);
    }

    private void broadcast(String msg) {
        // ไม่ยิงเข้าแชทมุมซ้าย — ลด UI รก (เก็บใน log)
        plugin.getLogger().info(msg.replaceAll("§.", ""));
    }

    public boolean runFunction(String path) {
        String fn = path.startsWith("tokcontrol_farm:") ? path : "tokcontrol_farm:" + path;
        return runConsole("function " + fn);
    }

    private void runFunctionQuiet(String path) {
        try { runFunction(path); } catch (Exception ignored) {}
    }

    public String statusJson() {
        World w = primaryWorld();
        int wheat = w != null ? collectWheat(w).size() : 0;
        return "{"
                + "\"ok\":true,"
                + "\"active\":" + active + ","
                + "\"built\":" + builder.isBuilt() + ","
                + "\"floorY\":" + builder.getFloorY() + ","
                + "\"cropY\":" + builder.getCropY() + ","
                + "\"wheat\":" + wheat + ","
                + "\"center\":[" + builder.getCenterX() + "," + builder.getCenterZ() + "],"
                + "\"half\":" + builder.getHalf()
                + "}";
    }

    private void placeOriginMarker(World world) {
        if (world == null) return;
        Location loc = new Location(world, builder.getCenterX() + 0.5, builder.getCropY(), builder.getCenterZ() + 0.5);
        world.getEntities().stream()
                .filter(e -> e.getScoreboardTags().contains("tc_farm_origin"))
                .forEach(Entity::remove);
        Marker marker = (Marker) world.spawnEntity(loc, EntityType.MARKER);
        marker.addScoreboardTag("tc_farm_origin");
        marker.addScoreboardTag("tc_farm");
    }

    private boolean runConsole(String cmd) {
        try {
            return Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd);
        } catch (Exception e) {
            plugin.getLogger().warning("Farm cmd failed: " + cmd + " — " + e.getMessage());
            return false;
        }
    }

    private World primaryWorld() {
        if (builder.getFarmSpawn() != null && builder.getFarmSpawn().getWorld() != null) {
            return builder.getFarmSpawn().getWorld();
        }
        return Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0);
    }

    public void installDatapack(World world) {
        if (world == null) return;
        Path dest = world.getWorldFolder().toPath().resolve("datapacks").resolve("tokcontrol_farm");
        try {
            Files.createDirectories(dest);
            Path jarPath;
            try {
                jarPath = Path.of(plugin.getClass().getProtectionDomain().getCodeSource().getLocation().toURI());
            } catch (Exception e) {
                return;
            }
            try (JarFile jar = new JarFile(jarPath.toFile())) {
                Enumeration<JarEntry> entries = jar.entries();
                String prefix = "datapacks/tokcontrol_farm/";
                while (entries.hasMoreElements()) {
                    JarEntry entry = entries.nextElement();
                    if (entry.isDirectory()) continue;
                    String name = entry.getName();
                    if (!name.startsWith(prefix)) continue;
                    Path out = dest.resolve(name.substring(prefix.length()));
                    Files.createDirectories(out.getParent());
                    try (InputStream in = jar.getInputStream(entry); OutputStream os = Files.newOutputStream(out)) {
                        in.transferTo(os);
                    }
                }
            }
        } catch (Exception e) {
            plugin.getLogger().warning("installDatapack: " + e.getMessage());
        }
    }
}
