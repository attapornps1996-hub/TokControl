package com.tokcontrol.minecraft;

import org.bukkit.Bukkit;
import org.bukkit.Color;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.attribute.Attribute;
import org.bukkit.block.Block;
import org.bukkit.entity.Allay;
import org.bukkit.entity.Drowned;
import org.bukkit.entity.Entity;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.FishHook;
import org.bukkit.entity.Item;
import org.bukkit.entity.ItemDisplay;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.entity.TextDisplay;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerBucketEmptyEvent;
import org.bukkit.event.player.PlayerBucketFillEvent;
import org.bukkit.event.player.PlayerFishEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.event.player.PlayerRecipeDiscoverEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.inventory.EntityEquipment;
import org.bukkit.inventory.ItemStack;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.scoreboard.Criteria;
import org.bukkit.scoreboard.DisplaySlot;
import org.bukkit.scoreboard.Objective;
import org.bukkit.scoreboard.Score;
import org.bukkit.scoreboard.Scoreboard;
import org.bukkit.util.Vector;
import org.bukkit.entity.AbstractArrow;
import org.bukkit.entity.Trident;
import io.papermc.paper.scoreboard.numbers.NumberFormat;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

/**
 * Fish Control — ดึงอัตโนมัติ · HUD มุมจอ · ช่วยตก 10วิ · ชนะ/พัง countdown
 */
public final class FishControlService implements Listener {

    public static final int DEFAULT_GOAL = 35;
    public static final int WIN_COUNTDOWN_SEC = 15;
    public static final int AUTO_FISH_SEC = 10;
    public static final int GOLEM_HELP_SEC = 20;
    public static final int AUTO_FISH_MAX_SEC = 600;
    public static final int FISHING_WALL_SEC = 15;
    /** กำแพงสแต็กได้สูงสุด (วินาที) */
    public static final int FISHING_WALL_MAX_SEC = 300;
    /** Max fish counted per successful reel after Multi Catch upgrades. */
    public static final int CATCH_YIELD_MAX = 10;

    private final TokControlPlugin plugin;
    private final Random random = new Random();

    private int goal = DEFAULT_GOAL;
    private int caught = 0;
    private int zombiesAlive = 0;
    private boolean winActive;
    private int winTicksLeft;
    private int winSlowAccum;
    private int hudPulse;
    private int lastDramaticSec = -1;
    private boolean winDeltaAwarded;
    private BukkitTask tickTask;
    private BukkitTask hudTask;
    private final List<UUID> scenicFish = new ArrayList<>();
    private final List<UUID> helpers = new ArrayList<>();
    private final Map<UUID, Long> golemUntil = new HashMap<>();
    private final List<UUID> trackedZombies = new ArrayList<>();
    private long lastCatchMs;
    private int bossBarClearCooldown;

    /** ช่วยตกถึงเวลา (epoch ms) ต่อผู้เล่น */
    private final Map<UUID, Long> autoFishUntil = new HashMap<>();
    /** ชาวบ้านช่วยตก */
    private final List<UUID> helperVillagers = new ArrayList<>();
    /** HUD มุมขวาบน (scoreboard sidebar — ไม่มีหลอด bossbar) */

    /** Multi-catch upgrade: fish per reel (1 = normal). Stacks +1 per gift until round win/reset. */
    private int catchYield = 1;

    /** Temporary fishing-block wall around harbor */
    private long fishingBlockedUntil;
    private BukkitTask fishingWallTask;
    private final List<WallSavedBlock> fishingWallBlocks = new ArrayList<>();
    private int lastWallAnnounceSec = -1;

    /** อนิเมชัน ±WIN (Drowned / Allay) */
    private final List<UUID> spectacleEntities = new ArrayList<>();
    private final List<Location> spectacleFireBlocks = new ArrayList<>();
    private final List<WallSavedBlock> spectacleBlockRestore = new ArrayList<>();
    private BukkitTask spectacleTask;
    private long spectacleUntilMs;

    private static final class WallSavedBlock {
        final World world;
        final int x, y, z;
        final Material material;
        final String data;

        WallSavedBlock(Block b) {
            world = b.getWorld();
            x = b.getX();
            y = b.getY();
            z = b.getZ();
            material = b.getType();
            data = b.getBlockData().getAsString();
        }

        void restore() {
            if (world == null) return;
            Block b = world.getBlockAt(x, y, z);
            try {
                b.setBlockData(Bukkit.createBlockData(data), false);
            } catch (Exception e) {
                b.setType(material, false);
            }
        }
    }

    public FishControlService(TokControlPlugin plugin) {
        this.plugin = plugin;
        Bukkit.getPluginManager().registerEvents(this, plugin);
        tickTask = Bukkit.getScheduler().runTaskTimer(plugin, this::tick, 20L, 20L);
        // HUD ทุก 4 tick + นับชนะทุก tick (แยกใน tickHud)
        hudTask = Bukkit.getScheduler().runTaskTimer(plugin, this::tickHud, 1L, 1L);
    }

    public void shutdown() {
        if (tickTask != null) tickTask.cancel();
        if (hudTask != null) hudTask.cancel();
        releaseFishingWall();
        clearSpectacle();
        clearAllHud();
        clearScenicFish();
        clearHelperVillagers();
        autoFishUntil.clear();
        catchYield = 1;
    }

    public boolean isFishingBlocked() {
        return System.currentTimeMillis() < fishingBlockedUntil;
    }

    public int fishingWallSecondsLeft() {
        return (int) Math.max(0, (fishingBlockedUntil - System.currentTimeMillis() + 999) / 1000);
    }

    /**
     * กำแพงท่าเรือ — ส่งซ้ำยิ่งบวกเวลา (15+15+15…) ไม่รีเซ็ตของเดิม
     */
    public boolean startFishingWall(int seconds) {
        World world = resolveWorld();
        if (world == null) return false;
        FishPierBuilder pier = plugin.getFishPierBuilder();
        if (pier == null || !pier.isBuilt()) return false;

        int addSec = Math.max(3, Math.min(60, seconds <= 0 ? FISHING_WALL_SEC : seconds));
        boolean alreadyUp = isFishingBlocked() && !fishingWallBlocks.isEmpty();

        if (!alreadyUp) {
            // สร้างกำแพงครั้งแรกเท่านั้น — ไม่รีลีสของเดิมเวลาสแต็ก
            if (!fishingWallBlocks.isEmpty()) {
                for (int i = fishingWallBlocks.size() - 1; i >= 0; i--) {
                    try { fishingWallBlocks.get(i).restore(); } catch (Exception ignored) {}
                }
                fishingWallBlocks.clear();
            }

            int cx = pier.getCenterX();
            int cz = pier.getCenterZ();
            int half = pier.getSquareHalf();
            int deckY = pier.getDeckY();
            int wallH = 4;

            Material[] palette = {
                    Material.PRISMARINE_BRICKS, Material.DARK_PRISMARINE, Material.SEA_LANTERN,
                    Material.PRISMARINE, Material.QUARTZ_PILLAR
            };

            for (int x = cx - half - 1; x <= cx + half + 1; x++) {
                for (int z = cz - half - 1; z <= cz + half + FishPierBuilder.PIER_LENGTH + 3; z++) {
                    boolean onSquareRing = (Math.abs(x - cx) == half + 1 || Math.abs(z - cz) == half + 1)
                            && Math.abs(x - cx) <= half + 1 && Math.abs(z - cz) <= half + 1;
                    boolean onPierSides = z > cz + half
                            && z <= cz + half + FishPierBuilder.PIER_LENGTH + 2
                            && (Math.abs(x - cx) == FishPierBuilder.PIER_WIDTH + 2);
                    boolean onPierTip = z == cz + half + FishPierBuilder.PIER_LENGTH + 3
                            && Math.abs(x - cx) <= FishPierBuilder.PIER_WIDTH + 2;
                    if (!onSquareRing && !onPierSides && !onPierTip) continue;

                    for (int y = deckY + 1; y <= deckY + wallH; y++) {
                        Block b = world.getBlockAt(x, y, z);
                        if (b.getType() == Material.BEDROCK) continue;
                        fishingWallBlocks.add(new WallSavedBlock(b));
                        Material mat = palette[Math.floorMod(x + y + z, palette.length)];
                        if (y == deckY + wallH) mat = Material.SEA_LANTERN;
                        else if ((x + z + y) % 5 == 0) mat = Material.PRISMARINE_BRICKS;
                        b.setType(mat, false);
                    }
                }
            }
        }

        long now = System.currentTimeMillis();
        long base = (fishingBlockedUntil > now) ? fishingBlockedUntil : now;
        long until = base + addSec * 1000L;
        long maxUntil = now + FISHING_WALL_MAX_SEC * 1000L;
        if (until > maxUntil) until = maxUntil;
        fishingBlockedUntil = until;

        if (fishingWallTask != null) {
            try { fishingWallTask.cancel(); } catch (Exception ignored) {}
            fishingWallTask = null;
        }
        int totalSec = fishingWallSecondsLeft();
        fishingWallTask = Bukkit.getScheduler().runTaskLater(plugin, this::releaseFishingWall, Math.max(1L, totalSec * 20L));
        lastWallAnnounceSec = -1;

        broadcastTitle("§c§lกำแพง +" + addSec + "วิ", "§fรวม §e" + totalSec + "§f วิ · ตกปลาไม่ได้", 5, 40, 10);
        actionBarAll("§c§l🧱 กำแพง §f+" + addSec + "§c วิ §7· รวม §f" + totalSec + "§c วิ");
        playAll(Sound.BLOCK_ANVIL_PLACE, 0.7f);
        playAll(Sound.BLOCK_BEACON_DEACTIVATE, 0.8f);
        updateScreenHud();
        return true;
    }

    public void releaseFishingWall() {
        if (fishingWallTask != null) {
            try { fishingWallTask.cancel(); } catch (Exception ignored) {}
            fishingWallTask = null;
        }
        boolean wasActive = fishingBlockedUntil > 0 || !fishingWallBlocks.isEmpty();
        fishingBlockedUntil = 0;
        lastWallAnnounceSec = -1;
        for (int i = fishingWallBlocks.size() - 1; i >= 0; i--) {
            try { fishingWallBlocks.get(i).restore(); } catch (Exception ignored) {}
        }
        fishingWallBlocks.clear();
        if (wasActive) {
            broadcastTitle("§a§lเปิดแล้ว", "§fตกปลาได้ตามปกติ", 5, 30, 8);
            actionBarAll("§aกำแพงลงแล้ว — ตกปลาต่อได้");
            playAll(Sound.BLOCK_BEACON_ACTIVATE, 1.2f);
            updateScreenHud();
        }
    }

    public int getGoal() { return goal; }
    public int getCaught() { return caught; }
    public int getRemaining() { return Math.max(0, goal - caught); }

    /** สถานะสำหรับ OBS overlay / panel (ผ่าน /health) */
    public String statusJson() {
        return "{"
                + "\"ok\":true,"
                + "\"mode\":\"fish\","
                + "\"goal\":" + goal + ","
                + "\"caught\":" + caught + ","
                + "\"remaining\":" + getRemaining() + ","
                + "\"zombies\":" + getZombiesAlive() + ","
                + "\"winActive\":" + winActive + ","
                + "\"winSeconds\":" + Math.max(0, (int) Math.ceil(winTicksLeft / 20.0)) + ","
                + "\"wallActive\":" + isFishingBlocked() + ","
                + "\"wallSeconds\":" + fishingWallSecondsLeft() + ","
                + "\"multiActive\":" + (catchYield > 1) + ","
                + "\"multiMult\":" + getCatchYield()
                + "}";
    }
    public int getZombiesAlive() { return Math.max(0, zombiesAlive); }

    public void resetRound(World world) {
        goal = DEFAULT_GOAL;
        caught = 0;
        winActive = false;
        winTicksLeft = 0;
        winSlowAccum = 0;
        lastDramaticSec = -1;
        winDeltaAwarded = false;
        autoFishUntil.clear();
        catchYield = 1;
        releaseFishingWall();
        clearTrackedZombies();
        clearGolems();
        clearSpectacle();
        if (world != null) {
            applyWorldRules(world);
            spawnScenicFish(world);
            // ไม่เสกโกเลมตอนเริ่ม — รอทริกเกอร์ของขวัญ
        }
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (FishPierBuilder.isFishWorld(p.getWorld()) || plugin.isFishMode()) {
                clearLegacyQuotaBars(p);
                clearPlayerHudScoreboard(p);
                plugin.giveFishKit(p);
            }
        }
        updateScreenHud();
        zombiesAlive = 0;
        actionBarAll("§bเริ่มรอบใหม่ · ต้องตก §e" + goal + " §bตัว");
    }

    public void onPierBuilt(World world) {
        applyWorldRules(world);
        resetRound(world);
    }

    public void applyWorldRules(World world) {
        if (world == null) return;
        try {
            world.setGameRule(org.bukkit.GameRule.ANNOUNCE_ADVANCEMENTS, false);
            world.setGameRule(org.bukkit.GameRule.DO_DAYLIGHT_CYCLE, false);
            world.setGameRule(org.bukkit.GameRule.DO_WEATHER_CYCLE, false);
            world.setGameRule(org.bukkit.GameRule.KEEP_INVENTORY, true);
            world.setGameRule(org.bukkit.GameRule.DO_MOB_LOOT, false);
            world.setGameRule(org.bukkit.GameRule.DO_ENTITY_DROPS, false);
            world.setGameRule(org.bukkit.GameRule.DO_TILE_DROPS, false);
        } catch (Exception ignored) {}
        world.setTime(18000L); // กลางคืนตลอด
        world.setStorm(false);
    }

    public void setGoal(int g) {
        goal = Math.max(0, Math.min(999, g));
        if (caught > goal) caught = goal;
        maybeCancelWinOnGoalChange();
    }

    public void addGoal(int amount) {
        setGoal(goal + Math.max(1, amount));
        broadcast("§6เป้าหมาย +§e" + amount + " §6→ ต้องตก §e" + goal + " §6(เหลือ " + getRemaining() + ")");
        actionBarAll("§6🐡 เหลือ " + getRemaining() + " / " + goal);
    }

    public void subGoal(int amount) {
        setGoal(goal - Math.max(1, amount));
        broadcast("§aเป้าหมาย -§e" + amount + " §a→ ต้องตก §e" + goal + " §a(เหลือ " + getRemaining() + ")");
        actionBarAll("§a🐡 เหลือ " + getRemaining() + " / " + goal);
        checkWinStart();
    }

    /** ของขวัญบวกวิน — Allay + ลำแสงมุมแพ + Allay ตัวเล็ก */
    public void giftPlusWin(int amount) {
        int n = Math.max(1, Math.min(99, amount <= 0 ? 1 : amount));
        BridgeHttpServer.queueWinDelta(n);
        playWinSpectacle(n);
        plugin.getLogger().info("Fish Control: gift plus win → pendingWinDelta +" + n);
    }

    /** ของขวัญลบวิน — Drowned ปา Trident + ฟ้าผ่า + ไฟไหม้หอ */
    public void giftMinusWin(int amount) {
        int n = Math.max(1, Math.min(99, amount <= 0 ? 1 : amount));
        BridgeHttpServer.queueWinDelta(-n);
        playLoseSpectacle(n, "§fของขวัญลบวิน");
        plugin.getLogger().info("Fish Control: gift minus win → pendingWinDelta -" + n);
    }

    /** ถ้ากำลังนับชนะ แล้วเหลือ > 0 → พัง / ยกเลิกนับ */
    private void maybeCancelWinOnGoalChange() {
        if (winActive && getRemaining() > 0) {
            cancelWinCountdown();
        }
    }

    public void cancelWinCountdown() {
        if (!winActive) return;
        winActive = false;
        winTicksLeft = 0;
        winSlowAccum = 0;
        lastDramaticSec = -1;
        if (winDeltaAwarded) {
            BridgeHttpServer.queueWinDelta(-1);
            winDeltaAwarded = false;
        }
        // ไม่เล่นอนิเมชัน Drowned — อนิเมชันใช้ตอนของขวัญลบวินเท่านั้น
        broadcastTitle("§c§lพัง", "§fยกเลิกนับถอยหลัง", 5, 35, 12);
        playAll(Sound.ENTITY_GENERIC_EXPLODE, 0.9f);
        playAll(Sound.ENTITY_WITHER_HURT, 0.85f);
        actionBarAll("§cพัง! ยกเลิกนับถอยหลัง · เหลือ " + getRemaining());
    }

    /** ช่วยตก — สแต็กเวลา: ส่งซ้ำยิ่งบวกวิ (10+10+10…) */
    public void startAutoFishHelp(int seconds) {
        int addSec = Math.max(1, Math.min(300, seconds <= 0 ? AUTO_FISH_SEC : seconds));
        long now = System.currentTimeMillis();
        int shown = 0;
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!plugin.isFishMode() && !FishPierBuilder.isFishWorld(p.getWorld())) continue;
            Long cur = autoFishUntil.get(p.getUniqueId());
            long base = (cur != null && cur > now) ? cur : now;
            long until = base + addSec * 1000L;
            long maxUntil = now + AUTO_FISH_MAX_SEC * 1000L;
            if (until > maxUntil) until = maxUntil;
            autoFishUntil.put(p.getUniqueId(), until);
            shown = (int) Math.max(0, (until - now + 999) / 1000);
            p.playSound(p.getLocation(), Sound.BLOCK_BEACON_ACTIVATE, 0.55f, 1.4f);
        }
        // ไม่สแปมแชท — โชว์บน action bar สั้น ๆ
        actionBarAll("§d⚡ ช่วยตก §f+" + addSec + "§d วิ §7· รวม §f" + shown + "§d วิ");
    }

    /**
     * Upgrade catch yield by +{@code steps} (default 1).
     * Lasts until the round is won / reset. Example: 1 → gift → 2 → gift → 3.
     */
    public void upgradeCatchYield(int steps) {
        int add = Math.max(1, Math.min(20, steps <= 0 ? 1 : steps));
        int before = getCatchYield();
        catchYield = Math.min(CATCH_YIELD_MAX, before + add);
        broadcastTitle("§a§lx" + catchYield + "/ครั้ง", "§f+" + (catchYield - before) + " จนจบรอบ", 5, 40, 10);
        actionBarAll("§a§lx" + catchYield + "/ครั้ง");
        playAll(Sound.ENTITY_PLAYER_LEVELUP, 1.25f);
        updateScreenHud();
    }

    /** ลดอัพเกรดตก −steps (ต่ำสุด x1) */
    public void downgradeCatchYield(int steps) {
        int sub = Math.max(1, Math.min(20, steps <= 0 ? 1 : steps));
        int before = getCatchYield();
        catchYield = Math.max(1, before - sub);
        if (catchYield < before) {
            broadcastTitle("§c§lx" + catchYield + "/ครั้ง", "§f-" + (before - catchYield) + " จนจบรอบ", 5, 40, 10);
            playAll(Sound.BLOCK_NOTE_BLOCK_BASS, 0.85f);
        }
        actionBarAll(catchYield > 1 ? "§a§lx" + catchYield + "/ครั้ง" : "§7x1/ครั้ง");
        updateScreenHud();
    }

    public int getCatchYield() {
        return Math.max(1, catchYield);
    }

    /** @deprecated use {@link #getCatchYield()} */
    public int getMultiCatchMult() {
        return getCatchYield();
    }

    public boolean isMultiCatchActive() {
        return catchYield > 1;
    }

    public int multiCatchSecondsLeft() {
        return 0;
    }

    public boolean isAutoFish(Player player) {
        if (player == null) return false;
        Long until = autoFishUntil.get(player.getUniqueId());
        return until != null && until > System.currentTimeMillis();
    }

    private int autoFishSecondsLeft(Player player) {
        Long until = autoFishUntil.get(player.getUniqueId());
        if (until == null) return 0;
        return (int) Math.max(0, (until - System.currentTimeMillis() + 999) / 1000);
    }

    private void registerCatch(Player player) {
        if (winActive) return;
        long now = System.currentTimeMillis();
        if (now - lastCatchMs < 500) return;
        lastCatchMs = now;
        int yield = getCatchYield();
        caught = Math.min(goal, caught + yield);
        if (player != null) {
            float pitch = yield > 1 ? 1.55f : 1.3f;
            player.playSound(player.getLocation(), Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 0.5f, pitch);
            if (yield > 1) {
                player.getWorld().spawnParticle(org.bukkit.Particle.HAPPY_VILLAGER,
                        player.getLocation().add(0, 1.2, 0), 10, 0.4, 0.3, 0.4, 0.02);
            }
        }
        checkWinStart();
        updateScreenHud();
    }

    private void checkWinStart() {
        if (winActive) return;
        if (getRemaining() > 0) return;
        winActive = true;
        winTicksLeft = WIN_COUNTDOWN_SEC * 20;
        winSlowAccum = 0;
        lastDramaticSec = -1;
        // บวกวินทันทีตอนเริ่มนับ
        BridgeHttpServer.queueWinDelta(1);
        winDeltaAwarded = true;
        plugin.getLogger().info("Fish Control: win countdown start → pendingWinDelta +1");
        // ไม่เล่นอนิเมชัน Allay — อนิเมชันใช้ตอนของขวัญบวกวินเท่านั้น
        broadcastTitle("§a§l" + WIN_COUNTDOWN_SEC, "§aครบเป้าหมาย!", 5, 25, 5);
        playAll(Sound.BLOCK_NOTE_BLOCK_PLING, 1.4f);
        playAll(Sound.BLOCK_BELL_USE, 1.0f);
    }

    private void tick() {
        if (!plugin.isFishMode()) return;

        long now = System.currentTimeMillis();
        autoFishUntil.entrySet().removeIf(e -> e.getValue() <= now);

        // ล็อกกลางคืนตลอด (กันปลั๊กอิน/คำสั่งอื่นเปลี่ยนเวลา)
        World w = resolveWorld();
        if (w != null) {
            try {
                w.setGameRule(org.bukkit.GameRule.DO_DAYLIGHT_CYCLE, false);
            } catch (Exception ignored) {}
            long t = w.getTime();
            if (t < 14000L || t > 22000L) {
                w.setTime(18000L);
            }
            if (w.hasStorm()) w.setStorm(false);
        }

        refreshZombieCount();
        maintainScenicFish();
        tickGolems(now);
        tickAutoFishCast();
        tickWaterRescue();
        tickWallAnnounce();
    }

    private void tickWaterRescue() {
        FishPierBuilder pier = plugin.getFishPierBuilder();
        if (pier == null || !pier.isBuilt()) return;
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!FishPierBuilder.isFishWorld(p.getWorld()) && !plugin.isFishMode()) continue;
            pier.rescueFromWater(p);
        }
    }

    /** Big visible wall countdown every second. */
    private void tickWallAnnounce() {
        if (!isFishingBlocked()) return;
        int sec = fishingWallSecondsLeft();
        if (sec == lastWallAnnounceSec) return;
        lastWallAnnounceSec = sec;
        String color = sec <= 3 ? "§c§l" : (sec <= 7 ? "§6§l" : "§e§l");
        broadcastTitle(color + "กำแพง " + sec, "§fตกปลาไม่ได้", 0, 22, 4);
        actionBarAll("§c🧱 §lกำแพง §f" + sec + "§c วิ");
        if (sec <= 5) playAll(Sound.BLOCK_NOTE_BLOCK_PLING, 1.0f + (5 - sec) * 0.12f);
        updateScreenHud();
    }

    private void tickWinCountdown() {
        if (!winActive) return;
        int secLeft = Math.max(0, (winTicksLeft + 19) / 20);
        if (secLeft <= 3 && winTicksLeft > 0) {
            winSlowAccum++;
            if (winSlowAccum < 36) return;
            winSlowAccum = 0;
            winTicksLeft = Math.max(0, (secLeft - 1) * 20);
        } else {
            winSlowAccum = 0;
            winTicksLeft--;
        }
        if (winTicksLeft > 0) return;
        completeWin();
    }

    private void tickWinTitle() {
        if (!winActive) return;
        // ระหว่างอนิเมชัน +1 WIN อย่าทับ title
        if (System.currentTimeMillis() < spectacleUntilMs) return;
        int sec = Math.max(0, (winTicksLeft + 19) / 20);
        if (sec <= 3) {
            if (hudPulse % 8 == 0) {
                String color = sec <= 1 ? "§c§l" : (sec == 2 ? "§6§l" : "§e§l");
                broadcastTitle(color + sec, "", 0, 12, 4);
                float pitch = 1.15f + (3 - sec) * 0.35f + (hudPulse % 16 == 0 ? 0.15f : 0f);
                playAll(Sound.BLOCK_NOTE_BLOCK_PLING, pitch);
                if (hudPulse % 16 == 0) playAll(Sound.BLOCK_NOTE_BLOCK_HAT, pitch + 0.2f);
                if (sec <= 1) playAll(Sound.BLOCK_NOTE_BLOCK_BASS, 0.55f);
            }
            if (sec != lastDramaticSec) {
                lastDramaticSec = sec;
                playAll(Sound.BLOCK_BELL_USE, 0.85f + (3 - sec) * 0.2f);
                playAll(Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 1.4f);
            }
            return;
        }
        if (hudPulse % 20 != 0) return;
        broadcastTitle("§a§l" + sec, "", 0, 25, 5);
        playAll(Sound.BLOCK_NOTE_BLOCK_PLING, 1.0f);
    }

    /** โกเลมช่วยตี 20วิ แล้วหาย · วาร์ปเฉพาะจมน้ำ */
    private void tickGolems(long now) {
        helpers.removeIf(id -> {
            Entity e = Bukkit.getEntity(id);
            Long until = golemUntil.get(id);
            if (e == null || e.isDead()) {
                golemUntil.remove(id);
                return true;
            }
            if (until != null && until <= now) {
                e.getWorld().spawnParticle(org.bukkit.Particle.POOF, e.getLocation().add(0, 1, 0), 8, 0.3, 0.5, 0.3, 0.02);
                e.remove();
                golemUntil.remove(id);
                return true;
            }
            if (e instanceof org.bukkit.entity.IronGolem golem) {
                golem.setSilent(true);
                Location loc = golem.getLocation();
                if (loc.getBlock().isLiquid() || loc.clone().add(0, -1, 0).getBlock().isLiquid()) {
                    Location dry = randomPierDeckSpot(golem.getWorld());
                    if (dry != null) golem.teleport(dry);
                }
            }
            return false;
        });
    }

    /** โยนเบ็ดอัตโนมัติตอนช่วยตก */
    private void tickAutoFishCast() {
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!isAutoFish(p)) continue;
            if (p.getInventory().getItemInMainHand().getType() != Material.FISHING_ROD) {
                // สลับไปเบ็ดช่อง 0
                ItemStack rod = p.getInventory().getItem(0);
                if (rod != null && rod.getType() == Material.FISHING_ROD) {
                    p.getInventory().setHeldItemSlot(0);
                }
            }
            if (hasActiveHook(p)) continue;
            if (p.getInventory().getItemInMainHand().getType() != Material.FISHING_ROD) continue;
            try {
                p.launchProjectile(FishHook.class);
                p.swingMainHand();
            } catch (Exception ignored) {}
        }
    }

    private boolean hasActiveHook(Player player) {
        for (Entity e : player.getWorld().getEntitiesByClass(FishHook.class)) {
            if (e instanceof FishHook hook && player.equals(hook.getShooter())) return true;
        }
        return false;
    }

    private void completeWin() {
        winActive = false;
        winTicksLeft = 0;
        winSlowAccum = 0;
        lastDramaticSec = -1;
        winDeltaAwarded = false; // บวกไปแล้วตอนเริ่มนับ
        broadcastTitle("§a§lชนะ!", "§eเริ่มรอบใหม่", 10, 50, 15);
        broadcast("§a§l🎉 ชนะ! §fรีเซ็ตเป้าหมาย §e" + DEFAULT_GOAL);
        playAll(Sound.UI_TOAST_CHALLENGE_COMPLETE, 1.2f);
        playAll(Sound.ENTITY_PLAYER_LEVELUP, 0.9f);
        World w = resolveWorld();
        // รีเซ็ตเบา ๆ — ไม่สร้างท่าเรือใหม่ทั้งแมพ (กันค้าง)
        goal = DEFAULT_GOAL;
        caught = 0;
        autoFishUntil.clear();
        catchYield = 1;
        clearTrackedZombies();
        if (w != null) {
            maintainScenicFish();
        }
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (FishPierBuilder.isFishWorld(p.getWorld()) || plugin.isFishMode()) {
                plugin.giveFishKit(p);
            }
        }
        updateScreenHud();
    }

    private boolean isFishProtectedWorld(World world) {
        if (world == null) return false;
        return plugin.isFishMode() || FishPierBuilder.isFishWorld(world);
    }

    /** ผู้เล่นปกติ — ห้ามทุบ/วางบล็อกแมพตกปลา (โหมดแอดมินตกแต่งยกเว้น) */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onPlayerBreak(BlockBreakEvent event) {
        if (!isFishProtectedWorld(event.getBlock().getWorld())) return;
        if (plugin.isAdminDecorateMode(event.getPlayer())) return;
        event.setCancelled(true);
        event.setDropItems(false);
        event.setExpToDrop(0);
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onPlayerPlace(BlockPlaceEvent event) {
        if (!isFishProtectedWorld(event.getBlock().getWorld())) return;
        if (plugin.isAdminDecorateMode(event.getPlayer())) return;
        event.setCancelled(true);
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onBucketEmpty(PlayerBucketEmptyEvent event) {
        if (!isFishProtectedWorld(event.getPlayer().getWorld())) return;
        if (plugin.isAdminDecorateMode(event.getPlayer())) return;
        event.setCancelled(true);
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onBucketFill(PlayerBucketFillEvent event) {
        if (!isFishProtectedWorld(event.getPlayer().getWorld())) return;
        if (plugin.isAdminDecorateMode(event.getPlayer())) return;
        event.setCancelled(true);
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onFish(PlayerFishEvent event) {
        if (!plugin.isFishMode() && !FishPierBuilder.isFishWorld(event.getPlayer().getWorld())) return;
        Player player = event.getPlayer();

        if (isFishingBlocked()) {
            event.setCancelled(true);
            if (event.getHook() != null && event.getHook().isValid()) {
                event.getHook().remove();
            }
            return;
        }

        PlayerFishEvent.State state = event.getState();
        boolean boost = isAutoFish(player);

        // เกี่ยวซอมบี้/โกเลม/ม็อบอื่น — ไม่นับคะแนนปลา และไม่ลบตัว
        if (state == PlayerFishEvent.State.CAUGHT_ENTITY) {
            event.setExpToDrop(0);
            Entity hooked = event.getCaught();
            if (hooked != null && !isCountableFishCatch(hooked)) {
                return;
            }
            if (hooked != null) hooked.remove();
            stripFishFromInventory(player);
            return;
        }

        // ไม่ให้ไอเทมปลาเข้ากระเป๋า — นับคะแนนเฉพาะตกปลาจริง
        if (state == PlayerFishEvent.State.CAUGHT_FISH) {
            event.setExpToDrop(0);
            if (event.getCaught() != null) {
                event.getCaught().remove();
            }
            if (!boost) registerCatch(player);
            stripFishFromInventory(player);
            return;
        }

        // ช่วยตก 10วิ: ปาเบ็ดลงไปได้ปลาทันที
        if (boost && (state == PlayerFishEvent.State.FISHING
                || state == PlayerFishEvent.State.IN_GROUND
                || state == PlayerFishEvent.State.BITE
                || state == PlayerFishEvent.State.REEL_IN)) {
            FishHook hook = event.getHook();
            Bukkit.getScheduler().runTaskLater(plugin, () -> forceCatch(player, hook), 2L);
            return;
        }

        // ปกติ: กัดแล้วดึงอัตโนมัติ (ไม่ใส่ของในกระเป๋า)
        if (state == PlayerFishEvent.State.BITE) {
            FishHook hook = event.getHook();
            Bukkit.getScheduler().runTaskLater(plugin, () -> forceCatch(player, hook), 2L);
        }
    }

    private void forceCatch(Player player, FishHook hook) {
        if (!player.isOnline() || winActive) return;
        if (!isAutoFish(player) && hook != null) {
            // normal path shouldn't call without boost except BITE — allow either
        }
        // ถ้าเบ็ดเกี่ยวม็อบอยู่ อย่านับเป็นปลา
        if (hook != null && hook.isValid()) {
            Entity hooked = hook.getHookedEntity();
            if (hooked != null && !isCountableFishCatch(hooked)) {
                hook.remove();
                return;
            }
        }
        Location loc = hook != null && hook.isValid() ? hook.getLocation() : player.getEyeLocation();
        if (hook != null && hook.isValid()) hook.remove();
        // ไม่ใส่ปลาในกระเป๋า
        player.getWorld().spawnParticle(org.bukkit.Particle.FISHING, loc, 12, 0.3, 0.2, 0.3, 0.02);
        player.getWorld().playSound(loc, Sound.ENTITY_FISHING_BOBBER_RETRIEVE, 1f, 1.15f);
        player.getWorld().playSound(loc, Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 0.5f, 1.4f);
        registerCatch(player);
        stripFishFromInventory(player);
    }

    /** จริงๆ เป็นปลา/ไอเทมปลา — ไม่ใช่ซอมบี้ โกเลม ชาวบ้าน ฯลฯ */
    private boolean isCountableFishCatch(Entity entity) {
        if (entity == null) return false;
        if (entity instanceof Item item) {
            Material t = item.getItemStack() != null ? item.getItemStack().getType() : Material.AIR;
            return t == Material.COD || t == Material.SALMON || t == Material.TROPICAL_FISH
                    || t == Material.PUFFERFISH || t == Material.COOKED_COD || t == Material.COOKED_SALMON;
        }
        EntityType t = entity.getType();
        return t == EntityType.COD || t == EntityType.SALMON
                || t == EntityType.TROPICAL_FISH || t == EntityType.PUFFERFISH;
    }

    private void stripFishFromInventory(Player player) {
        stripRawFishKeepTokens(player);
    }

    /** ชาวบ้านเกิดห่างจากท่า แล้วเดินมาตก — จำนวนตามที่ส่ง */
    public void spawnVillagerHelp() {
        spawnVillagerHelp(1);
    }

    public void spawnVillagerHelp(int amount) {
        World world = resolveWorld();
        if (world == null) return;
        int n = Math.max(1, Math.min(20, amount <= 0 ? 1 : amount));
        FishPierBuilder pier = plugin.getFishPierBuilder();
        int deckY = pier != null ? pier.getDeckY() : 64;
        Location bay = pier != null && pier.getPierSpawn() != null
                ? pier.getPierSpawn().clone()
                : randomPierDeckSpot(world);
        if (bay == null) return;

        Location destBase = bay.clone();
        destBase.setY(deckY + 1.0);
        ensureStandable(destBase, deckY);

        Location startBase = bay.clone().add(0, 0, -7);
        startBase.setY(deckY + 1.0);
        ensureStandable(startBase, deckY);

        world.playSound(startBase, Sound.ENTITY_VILLAGER_YES, 1f, 1.1f);
        actionBarAll("§eชาวบ้านช่วยตก §f×" + n + " §7· เดินมาท่าเรือ");

        for (int i = 0; i < n; i++) {
            final int idx = i;
            Bukkit.getScheduler().runTaskLater(plugin, () -> {
                if (world == null) return;
                double lane = (idx - (n - 1) / 2.0) * 1.35;
                Location start = startBase.clone().add(lane, 0, (idx % 2) * 0.4);
                ensureStandable(start, deckY);
                Location dest = destBase.clone().add(lane * 0.85, 0, -0.4);
                ensureStandable(dest, deckY);

                org.bukkit.entity.Villager v;
                try {
                    v = (org.bukkit.entity.Villager) world.spawnEntity(start, EntityType.VILLAGER);
                } catch (Exception ex) {
                    return;
                }
                v.setCustomName("§e§lชาวประมง");
                v.setCustomNameVisible(true);
                v.setAI(true);
                v.setSilent(false);
                v.setInvulnerable(true);
                v.setRemoveWhenFarAway(false);
                v.setCollidable(true);
                v.getEquipment().setItemInMainHand(new ItemStack(Material.FISHING_ROD));
                try { v.setProfession(org.bukkit.entity.Villager.Profession.FISHERMAN); } catch (Exception ignored) {}
                helperVillagers.add(v.getUniqueId());
                final UUID vid = v.getUniqueId();

                try {
                    v.getPathfinder().moveTo(dest, 1.25);
                } catch (Exception ex) {
                    v.teleport(dest);
                }

                Bukkit.getScheduler().runTaskLater(plugin, () -> {
                    Entity e = Bukkit.getEntity(vid);
                    if (!(e instanceof org.bukkit.entity.Villager vil) || !vil.isValid()) return;
                    try { vil.getPathfinder().moveTo(dest, 1.3); } catch (Exception ignored) {}
                }, 25L);

                Bukkit.getScheduler().runTaskLater(plugin, () -> {
                    Entity e = Bukkit.getEntity(vid);
                    if (!(e instanceof org.bukkit.entity.Villager vil) || !vil.isValid()) return;
                    if (vil.getLocation().distanceSquared(dest) > 4.0) {
                        vil.teleport(dest);
                    }
                    try {
                        FishHook hook = vil.launchProjectile(FishHook.class);
                        Bukkit.getScheduler().runTaskLater(plugin, () -> {
                            if (hook != null && hook.isValid()) hook.remove();
                        }, 18L);
                    } catch (Exception ignored) {}
                    world.playSound(vil.getLocation(), Sound.ENTITY_FISHING_BOBBER_THROW, 0.9f, 1.15f);
                    world.spawnParticle(Particle.SPLASH, dest.clone().add(0, 0.2, 1.2), 12, 0.4, 0.1, 0.4, 0.02);
                }, 48L);

                Bukkit.getScheduler().runTaskLater(plugin, () -> {
                    Entity e = Bukkit.getEntity(vid);
                    if (e != null && e.isValid()) {
                        world.playSound(e.getLocation(), Sound.ENTITY_FISHING_BOBBER_RETRIEVE, 1f, 1.2f);
                        world.spawnParticle(Particle.HAPPY_VILLAGER, e.getLocation().add(0, 1.2, 0), 10, 0.3, 0.4, 0.3, 0);
                    }
                    registerCatch(null);
                    actionBarAll("§aชาวบ้านตกได้ · เหลือ " + getRemaining());
                    removeHelperVillager(vid);
                }, 62L);
            }, i * 6L);
        }
    }

    private void removeHelperVillager(UUID id) {
        if (id == null) return;
        Entity e = Bukkit.getEntity(id);
        if (e != null) e.remove();
        helperVillagers.remove(id);
    }

    private void ensureStandable(Location loc, int deckY) {
        if (loc == null || loc.getWorld() == null) return;
        loc.setY(deckY + 1.0);
        Material floor = loc.getWorld().getBlockAt(loc.getBlockX(), deckY, loc.getBlockZ()).getType();
        if (!floor.name().contains("PLANKS") && floor != Material.GRASS_BLOCK && floor != Material.MOSS_BLOCK) {
            loc.getWorld().getBlockAt(loc.getBlockX(), deckY, loc.getBlockZ()).setType(Material.SPRUCE_PLANKS);
        }
        loc.getBlock().setType(Material.AIR);
        loc.clone().add(0, 1, 0).getBlock().setType(Material.AIR);
        loc.clone().add(0, 2, 0).getBlock().setType(Material.AIR);
    }

    private void clearHelperVillagers() {
        for (UUID id : helperVillagers) {
            Entity e = Bukkit.getEntity(id);
            if (e != null) e.remove();
        }
        helperVillagers.clear();
    }

    /* ===================== Minimal HUD (no sidebar score numbers) ===================== */

    private void tickHud() {
        if (!plugin.isFishMode()) return;
        hudPulse++;
        tickWinCountdown();
        tickWinTitle();

        // Refresh HUD every 20 ticks — avoid scoreboard thrash stutter
        if (hudPulse % 20 != 0) return;
        removeLegacyFloatingHud();
        updateScreenHud();
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (FishPierBuilder.isFishWorld(p.getWorld()) || plugin.isFishMode()) {
                clearLegacyQuotaBars(p);
                stripRawFishKeepTokens(p);
            }
        }
    }

    private void updateScreenHud() {
        int left = getRemaining();
        int wallSec = isFishingBlocked() ? fishingWallSecondsLeft() : 0;
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!(plugin.isFishMode() || FishPierBuilder.isFishWorld(p.getWorld()))) {
                clearPlayerHudScoreboard(p);
                continue;
            }
            applySidebarHud(p, left, wallSec);
        }
        removeLegacyBossHud();
    }

    private void applySidebarHud(Player p, int left, int wallSec) {
        try {
            Scoreboard board = p.getScoreboard();
            if (board == null || board == Bukkit.getScoreboardManager().getMainScoreboard()
                    || board.getObjective("fc_hud") == null) {
                board = Bukkit.getScoreboardManager().getNewScoreboard();
                p.setScoreboard(board);
            }
            Objective obj = board.getObjective("fc_hud");
            if (obj == null) {
                obj = board.registerNewObjective("fc_hud", Criteria.DUMMY, "§bตกปลา");
                obj.setDisplaySlot(DisplaySlot.SIDEBAR);
            } else {
                obj.setDisplayName(wallSec > 0 ? "§c§lกำแพง " + wallSec + "วิ" : "§bตกปลา");
                if (obj.getDisplaySlot() != DisplaySlot.SIDEBAR) {
                    obj.setDisplaySlot(DisplaySlot.SIDEBAR);
                }
            }
            for (String entry : new ArrayList<>(board.getEntries())) {
                board.resetScores(entry);
            }

            // เหลือแค่จำนวนปลา (+ แสดง xN ในชื่อเมื่ออัพเกรด)
            int multi = getCatchYield();
            obj.setDisplayName(multi > 1 ? ("§a§lx" + multi + "/ครั้ง") : "§bปลา");
            setBlankScore(obj, "§f§l" + left + " §7/ §f" + goal, 1);
            if (wallSec > 0) {
                obj.setDisplayName("§c§lกำแพง " + wallSec + "วิ");
            }
        } catch (Exception ignored) {}
    }

    private void setBlankScore(Objective obj, String line, int scoreValue) {
        Score score = obj.getScore(line);
        score.setScore(scoreValue);
        try {
            score.numberFormat(NumberFormat.blank());
        } catch (Throwable ignored) {
            // Older API fallback — still better with fewer lines
        }
    }

    private void clearPlayerHudScoreboard(Player p) {
        try {
            Scoreboard board = p.getScoreboard();
            if (board != null) {
                Objective obj = board.getObjective("fc_hud");
                if (obj != null) obj.unregister();
            }
            p.setScoreboard(Bukkit.getScoreboardManager().getMainScoreboard());
        } catch (Exception ignored) {}
    }

    private void stripRawFishKeepTokens(Player player) {
        if (player == null) return;
        Material[] fish = {
                Material.COD, Material.SALMON, Material.TROPICAL_FISH, Material.PUFFERFISH,
                Material.COOKED_COD, Material.COOKED_SALMON
        };
        for (ItemStack stack : player.getInventory().getContents()) {
            if (stack == null) continue;
            for (Material m : fish) {
                if (stack.getType() == m) {
                    stack.setAmount(0);
                    break;
                }
            }
        }
    }

    private void removeLegacyBossHud() {
        try {
            org.bukkit.NamespacedKey key = new org.bukkit.NamespacedKey(plugin, "fc_screen_hud");
            org.bukkit.boss.KeyedBossBar bar = Bukkit.getBossBar(key);
            if (bar != null) {
                bar.removeAll();
                bar.setVisible(false);
                Bukkit.removeBossBar(key);
            }
        } catch (Exception ignored) {}
    }

    /** Remove legacy TextDisplay/ItemDisplay HUD entities */
    private void removeLegacyFloatingHud() {
        World w = resolveWorld();
        if (w == null) return;
        for (Entity e : w.getEntitiesByClass(TextDisplay.class)) {
            e.remove();
        }
        for (Entity e : w.getEntitiesByClass(ItemDisplay.class)) {
            ItemStack stack = ((ItemDisplay) e).getItemStack();
            if (stack != null && (stack.getType() == Material.PUFFERFISH || stack.getType() == Material.ZOMBIE_HEAD)) {
                e.remove();
            }
        }
    }

    private void clearLegacyQuotaBars(Player p) {
        try {
            org.bukkit.boss.KeyedBossBar keyed = Bukkit.getBossBar(org.bukkit.NamespacedKey.minecraft("fc_quota"));
            if (keyed != null) {
                keyed.removePlayer(p);
                keyed.setVisible(false);
                Bukkit.removeBossBar(org.bukkit.NamespacedKey.minecraft("fc_quota"));
            }
        } catch (Exception ignored) {}
        Iterator<org.bukkit.boss.KeyedBossBar> it = Bukkit.getBossBars();
        while (it.hasNext()) {
            org.bukkit.boss.KeyedBossBar bar = it.next();
            String key = bar.getKey() != null ? bar.getKey().getKey() : "";
            String t = bar.getTitle();
            boolean fishUi = "fc_quota".equals(key) || "fc_screen_hud".equals(key)
                    || (t != null && (t.contains("เป้าหมาย") || t.contains("ตกปลา") || t.contains("ต้องตก")
                    || t.contains("🎣") || t.contains("🐡") || t.contains("เหลือ")));
            if (fishUi) {
                bar.removePlayer(p);
                try {
                    bar.setVisible(false);
                    Bukkit.removeBossBar(bar.getKey());
                } catch (Exception ignored) {}
            }
        }
    }

    private void clearAllHud() {
        removeLegacyFloatingHud();
        removeLegacyBossHud();
        for (Player p : Bukkit.getOnlinePlayers()) {
            clearPlayerHudScoreboard(p);
            clearLegacyQuotaBars(p);
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent e) {
        autoFishUntil.remove(e.getPlayer().getUniqueId());
        clearPlayerHudScoreboard(e.getPlayer());
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent e) {
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (plugin.isFishMode()) {
                clearLegacyQuotaBars(e.getPlayer());
                updateScreenHud();
            }
        }, 20L);
    }

    /* ===================== ฉาก / มอนสเตอร์ ===================== */

    public void spawnScenicFish(World world) {
        clearScenicFish();
        if (world == null) return;
        Location center = plugin.getFishPierBuilder() != null && plugin.getFishPierBuilder().getPierSpawn() != null
                ? plugin.getFishPierBuilder().getPierSpawn().clone()
                : world.getSpawnLocation().clone();
        int waterY = plugin.getFishPierBuilder() != null
                ? plugin.getFishPierBuilder().findWaterSurfaceY(world, center.getBlockX(), center.getBlockZ())
                : center.getBlockY() - 2;
        int count = 3 + random.nextInt(2);
        for (int i = 0; i < count; i++) {
            double angle = (Math.PI * 2 * i) / count;
            double r = 6 + random.nextDouble() * 10;
            Location loc = new Location(world,
                    center.getX() + Math.cos(angle) * r,
                    waterY - 2 - random.nextDouble() * 2,
                    center.getZ() + Math.sin(angle) * r);
            EntityType type = switch (random.nextInt(3)) {
                case 0 -> EntityType.COD;
                case 1 -> EntityType.SALMON;
                default -> EntityType.TROPICAL_FISH;
            };
            Entity e = world.spawnEntity(loc, type);
            e.setPersistent(true);
            e.setInvulnerable(true);
            e.setSilent(true);
            e.setCustomName("§bฉาก");
            e.setCustomNameVisible(false);
            scenicFish.add(e.getUniqueId());
        }
    }

    private void maintainScenicFish() {
        scenicFish.removeIf(id -> {
            Entity e = Bukkit.getEntity(id);
            return e == null || e.isDead();
        });
        if (scenicFish.size() < 3) {
            World w = resolveWorld();
            if (w != null && scenicFish.isEmpty()) spawnScenicFish(w);
        }
    }

    private void clearScenicFish() {
        for (UUID id : scenicFish) {
            Entity e = Bukkit.getEntity(id);
            if (e != null) e.remove();
        }
        scenicFish.clear();
    }

    public int spawnZombies(int count) {
        World world = resolveWorld();
        if (world == null) return 0;
        int n = Math.max(1, Math.min(30, count));
        int done = 0;
        for (int i = 0; i < n; i++) {
            Location loc = randomPierDeckSpot(world);
            if (loc == null) loc = spawnAroundPier(world);
            if (loc == null) continue;
            // กันเสกในน้ำ
            if (loc.getBlock().isLiquid() || loc.clone().add(0, -1, 0).getBlock().isLiquid()) {
                Location dry = randomPierDeckSpot(world);
                if (dry != null) loc = dry;
            }
            loc.getBlock().setType(Material.AIR);
            loc.clone().add(0, 1, 0).getBlock().setType(Material.AIR);
            // เกิดบนแพเท่านั้น — สลับซอมบี้ปกติ / ซอมบี้ทะเล (drowned บนแพ)
            boolean sea = random.nextBoolean();
            Entity e = world.spawnEntity(loc, sea ? EntityType.DROWNED : EntityType.ZOMBIE);
            e.setCustomName(sea ? "§cซอมบี้ทะเล" : "§cซอมบี้");
            e.setCustomNameVisible(true);
            e.setSilent(false);
            e.setPersistent(true);
            if (e instanceof org.bukkit.entity.LivingEntity living) {
                living.setRemoveWhenFarAway(false);
                living.getEquipment().clear();
                living.setCanPickupItems(false);
                living.addPotionEffect(new org.bukkit.potion.PotionEffect(
                        org.bukkit.potion.PotionEffectType.FIRE_RESISTANCE, 20 * 60 * 30, 0, false, false));
            }
            if (e instanceof org.bukkit.entity.Zombie z && !(e instanceof org.bukkit.entity.Drowned)) {
                try { z.setShouldBurnInDay(false); } catch (Exception ignored) {}
            }
            trackedZombies.add(e.getUniqueId());
            done++;
        }
        refreshZombieCount();
        actionBarAll("§c⚠ เสกซอมบี้ §e" + done + " §cตัว");
        return done;
    }

    /** จุดสุ่มบนพื้นไม้ของท่าเรือ */
    private Location randomPierDeckSpot(World world) {
        FishPierBuilder pier = plugin.getFishPierBuilder();
        Location base = spawnAroundPier(world);
        int deckY = pier != null && pier.getDeckY() > 0 ? pier.getDeckY() : base.getBlockY() - 1;
        int cx = base.getBlockX();
        int cz = base.getBlockZ();
        if (pier != null && pier.getPierSpawn() != null) {
            cx = pier.getCenterX();
            cz = pier.getCenterZ();
            deckY = pier.getDeckY();
        }
        for (int attempt = 0; attempt < 24; attempt++) {
            double ang = random.nextDouble() * Math.PI * 2;
            double r = 4 + random.nextDouble() * 12;
            int x = cx + (int) Math.round(Math.cos(ang) * r);
            int z = cz + (int) Math.round(Math.sin(ang) * r);
            Material floor = world.getBlockAt(x, deckY, z).getType();
            if (!floor.name().contains("PLANKS") && floor != Material.GRASS_BLOCK && floor != Material.MOSS_BLOCK) {
                continue;
            }
            if (!world.getBlockAt(x, deckY + 1, z).getType().isAir()
                    && world.getBlockAt(x, deckY + 1, z).getType().isSolid()) {
                continue;
            }
            if (world.getBlockAt(x, deckY + 1, z).getType() == Material.BARRIER) continue;
            if (world.getBlockAt(x, deckY + 1, z).getType() == Material.OAK_FENCE) continue;
            return new Location(world, x + 0.5, deckY + 1.0, z + 0.5);
        }
        return new Location(world, base.getX(), deckY + 1.0, base.getZ());
    }

    public void ensureGolem(World world) {
        // ไม่เสกโกเลมถาวร — ใช้ทริกเกอร์ช่วยตี 20วิ เท่านั้น
        helpers.removeIf(id -> {
            Entity e = Bukkit.getEntity(id);
            return e == null || e.isDead();
        });
    }

    public void clearGolems() {
        for (UUID id : new ArrayList<>(helpers)) {
            Entity e = Bukkit.getEntity(id);
            if (e != null) e.remove();
        }
        helpers.clear();
        golemUntil.clear();
        actionBarAll("§7เคลียร์โกเลมแล้ว");
    }

    public org.bukkit.entity.IronGolem spawnGolem(World world) {
        spawnGolems(world, 1);
        return null;
    }

    /** เสกโกเลมช่วยตีตามจำนวนที่กำหนด */
    public int spawnGolems(World world, int count) {
        if (world == null) world = resolveWorld();
        if (world == null) return 0;
        int n = Math.max(1, Math.min(20, count));
        int done = 0;
        for (int i = 0; i < n; i++) {
            Location loc = randomPierDeckSpot(world);
            if (loc == null) {
                FishPierBuilder pier = plugin.getFishPierBuilder();
                if (pier != null && pier.getPierSpawn() != null) {
                    loc = pier.getPierSpawn().clone();
                    loc.setY(pier.getDeckY() + 1.0);
                } else {
                    continue;
                }
            }
            if (loc.getBlock().isLiquid() || loc.clone().add(0, -1, 0).getBlock().isLiquid()) {
                Location retry = randomPierDeckSpot(world);
                if (retry != null) loc = retry;
            }
            loc.getBlock().setType(Material.AIR);
            loc.clone().add(0, 1, 0).getBlock().setType(Material.AIR);
            org.bukkit.entity.IronGolem golem = (org.bukkit.entity.IronGolem) world.spawnEntity(loc, EntityType.IRON_GOLEM);
            golem.setCustomName("§a§lผู้พิทักษ์");
            golem.setCustomNameVisible(false);
            golem.setPlayerCreated(true);
            golem.setSilent(true);
            helpers.add(golem.getUniqueId());
            golemUntil.put(golem.getUniqueId(), System.currentTimeMillis() + GOLEM_HELP_SEC * 1000L);
            done++;
        }
        if (done > 0) {
            actionBarAll("§aโกเลมช่วยตี §f" + done + "§a ตัว · §f" + GOLEM_HELP_SEC + "§a วิ");
        }
        return done;
    }

    private void refreshZombieCount() {
        trackedZombies.removeIf(id -> {
            Entity e = Bukkit.getEntity(id);
            return e == null || e.isDead();
        });
        zombiesAlive = trackedZombies.size();
    }

    private void clearTrackedZombies() {
        for (UUID id : trackedZombies) {
            Entity e = Bukkit.getEntity(id);
            if (e != null) e.remove();
        }
        trackedZombies.clear();
        zombiesAlive = 0;
    }

    @EventHandler
    public void onEntityDeath(EntityDeathEvent e) {
        if (!plugin.isFishMode() && !FishPierBuilder.isFishWorld(e.getEntity().getWorld())) return;
        // ไม่ให้ของดรอป / XP
        e.getDrops().clear();
        e.setDroppedExp(0);
        UUID id = e.getEntity().getUniqueId();
        if (trackedZombies.remove(id)) refreshZombieCount();
        helpers.remove(id);
    }

    @EventHandler
    public void onPlayerDeath(PlayerDeathEvent e) {
        Player player = e.getEntity();
        if (!plugin.isFishMode() && !FishPierBuilder.isFishWorld(player.getWorld())) return;
        e.getDrops().clear();
        e.setDroppedExp(0);
        e.setKeepInventory(true);
        BridgeHttpServer.queueWinDelta(-1);
        // ไม่เล่นอนิเมชัน — ใช้ตอนของขวัญลบวินเท่านั้น
        actionBarAll("§c☠ " + player.getName() + " · -1 Win");
        playAll(Sound.ENTITY_WITHER_HURT, 0.7f);
        plugin.getLogger().info("Fish Control: player death → pendingWinDelta -1");
    }

    /** Soft respawn — no map rebuild / no inventory wipe / no title spam. */
    @EventHandler(priority = EventPriority.HIGHEST)
    public void onPlayerRespawn(PlayerRespawnEvent e) {
        Player player = e.getPlayer();
        if (!plugin.isFishMode() && !FishPierBuilder.isFishWorld(player.getWorld())) return;
        FishPierBuilder pier = plugin.getFishPierBuilder();
        if (pier != null && pier.getPierSpawn() != null) {
            e.setRespawnLocation(pier.getPierSpawn().clone());
        }
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (!player.isOnline()) return;
            if (pier != null) {
                pier.softTeleport(player);
                pier.restoreKit(player, false);
            }
        }, 2L);
    }

    @EventHandler
    public void onRecipeDiscover(PlayerRecipeDiscoverEvent e) {
        if (!plugin.isFishMode() && !FishPierBuilder.isFishWorld(e.getPlayer().getWorld())) return;
        e.setCancelled(true);
    }

    private Location spawnAroundPier(World world) {
        if (plugin.getFishPierBuilder() != null && plugin.getFishPierBuilder().getPierSpawn() != null) {
            return plugin.getFishPierBuilder().getPierSpawn().clone();
        }
        return world.getSpawnLocation().clone();
    }

    private World resolveWorld() {
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (FishPierBuilder.isFishWorld(p.getWorld())) return p.getWorld();
        }
        return Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0);
    }

    private void broadcast(String msg) {
        // ไม่ยิงเข้าแชทมุมซ้าย — ใช้ title/action bar แทน
        plugin.getLogger().info(msg.replaceAll("§.", ""));
    }

    private void broadcastTitle(String title, String sub, int fadeIn, int stay, int fadeOut) {
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (plugin.isFishMode() || FishPierBuilder.isFishWorld(p.getWorld())) {
                p.sendTitle(title, sub == null ? "" : sub, fadeIn, stay, fadeOut);
            }
        }
    }

    private void actionBarAll(String msg) {
        // ไม่ใช้ action bar — ลด UI รกทั้งแมพ
    }

    private void playAll(Sound sound, float pitch) {
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (plugin.isFishMode() || FishPierBuilder.isFishWorld(p.getWorld())) {
                p.playSound(p.getLocation(), sound, 1f, pitch);
            }
        }
    }

    /* ===================== ±WIN spectacles ===================== */

    private void clearSpectacle() {
        if (spectacleTask != null) {
            try { spectacleTask.cancel(); } catch (Exception ignored) {}
            spectacleTask = null;
        }
        spectacleUntilMs = 0;
        for (UUID id : spectacleEntities) {
            Entity e = Bukkit.getEntity(id);
            if (e != null) e.remove();
        }
        spectacleEntities.clear();
        for (Location loc : spectacleFireBlocks) {
            if (loc == null || loc.getWorld() == null) continue;
            try {
                Block b = loc.getBlock();
                if (b.getType() == Material.FIRE || b.getType() == Material.SOUL_FIRE) {
                    b.setType(Material.AIR, false);
                }
            } catch (Exception ignored) {}
        }
        spectacleFireBlocks.clear();
        for (WallSavedBlock saved : spectacleBlockRestore) {
            try { saved.restore(); } catch (Exception ignored) {}
        }
        spectacleBlockRestore.clear();
    }

    private void scaleGiant(LivingEntity e, double scale) {
        try {
            var attr = e.getAttribute(Attribute.GENERIC_SCALE);
            if (attr != null) attr.setBaseValue(scale);
        } catch (Exception ignored) {}
    }

    private void lockSpectacleMob(LivingEntity e) {
        e.setAI(false);
        e.setSilent(true);
        e.setInvulnerable(true);
        e.setGravity(false);
        e.setRemoveWhenFarAway(false);
        e.setCollidable(false);
        e.setPersistent(true);
        e.setCustomName(" ");
        e.setCustomNameVisible(false);
    }

    private float yawToward(Location from, Location to) {
        double dx = to.getX() - from.getX();
        double dz = to.getZ() - from.getZ();
        return (float) Math.toDegrees(Math.atan2(-dx, dz));
    }

    private Vector safePerp(Vector dir) {
        Vector n = dir.clone().normalize();
        Vector perp = n.clone().crossProduct(new Vector(0, 1, 0));
        if (perp.lengthSquared() < 1.0e-6) {
            perp = n.clone().crossProduct(new Vector(1, 0, 0));
        }
        if (perp.lengthSquared() < 1.0e-6) return new Vector(1, 0, 0);
        return perp.normalize();
    }

    /** ลำแสงนิ่งจากมุมแพ → Allay (บางพอดี ไม่มีเอฟเฟกต์พุ่งค่อยๆ) */
    private void spawnBeam(World world, Location from, Location to, Particle.DustOptions dust) {
        if (world == null || from == null || to == null) return;
        Vector delta = to.toVector().subtract(from.toVector());
        double len = delta.length();
        if (len < 0.2) return;
        Vector perp = safePerp(delta.clone().multiply(1.0 / len));
        // บาง: เส้นกลาง + คู่ข้างเล็กน้อย — ไม่ใช้ END_ROD (พุ่งเอง)
        double[] side = { 0, 0.12, -0.12 };
        Particle.DustOptions line = dust != null
                ? new Particle.DustOptions(dust.getColor(), 1.15f)
                : new Particle.DustOptions(Color.fromRGB(100, 210, 255), 1.15f);
        Particle.DustOptions core = new Particle.DustOptions(Color.fromRGB(230, 250, 255), 0.85f);
        int steps = (int) Math.min(48, Math.max(18, len * 2.0));
        for (double s : side) {
            Vector shift = perp.clone().multiply(s);
            Location a = from.clone().add(shift);
            Location b = to.clone().add(shift.clone().multiply(0.2));
            Vector step = b.toVector().subtract(a.toVector()).multiply(1.0 / steps);
            for (int i = 0; i <= steps; i++) {
                Location p = a.clone().add(step.clone().multiply(i));
                world.spawnParticle(Particle.DUST, p, 1, 0, 0, 0, 0, line);
                if (s == 0 && i % 2 == 0) {
                    world.spawnParticle(Particle.DUST, p, 1, 0, 0, 0, 0, core);
                }
            }
        }
    }

    private Location[] deckCornerBeacons(World world, double cx, double cz, double deckY, int half) {
        double y = deckY + 3.4;
        return new Location[] {
                new Location(world, cx - half, y, cz - half),
                new Location(world, cx + half, y, cz - half),
                new Location(world, cx - half, y, cz + half),
                new Location(world, cx + half, y, cz + half)
        };
    }

    /** ฝนประกายสีฟ้าทั่วแพ (ช่วง Allay ตัวเล็กวนหอ) */
    private void spawnBluePierRain(World world, double cx, double cz, double deckY, int half,
                                   Particle.DustOptions blue, Particle.DustOptions soft, Particle.DustOptions cyan) {
        double rainMinX = cx - half - 1;
        double rainMaxX = cx + half + 1;
        double rainMinZ = cz - half - 1;
        double rainMaxZ = cz + half + FishPierBuilder.PIER_LENGTH + 3;
        double rainW = Math.max(4, rainMaxX - rainMinX);
        double rainD = Math.max(4, rainMaxZ - rainMinZ);
        double rainTopY = deckY + 22;
        for (int i = 0; i < 34; i++) {
            double x = rainMinX + random.nextDouble() * rainW;
            double z = rainMinZ + random.nextDouble() * rainD;
            double y = deckY + 2 + random.nextDouble() * (rainTopY - deckY - 2);
            Location p = new Location(world, x, y, z);
            world.spawnParticle(Particle.DUST, p, 1, 0.05, 0.05, 0.05, 0, blue);
            if (i % 2 == 0) {
                world.spawnParticle(Particle.END_ROD, p, 1, 0.02, 0.45, 0.02, 0.05);
            }
            if (i % 4 == 0) {
                world.spawnParticle(Particle.DUST, p, 1, 0.08, 0.08, 0.08, 0, soft);
            }
        }
        for (int i = 0; i < 14; i++) {
            double x = rainMinX + random.nextDouble() * rainW;
            double z = rainMinZ + random.nextDouble() * rainD;
            double midY = deckY + 4 + random.nextDouble() * 8;
            world.spawnParticle(Particle.DUST, new Location(world, x, midY, z), 2, 0.2, 0.5, 0.2, 0, cyan);
            world.spawnParticle(Particle.FIREWORK, new Location(world, x, deckY + 1.3, z), 1, 0.15, 0.2, 0.15, 0.01);
        }
    }

    /** จุดฟ้าผ่าสุ่มรอบตำแหน่ง + รอบแพ */
    private void strikeAround(World world, Location center, double radius) {
        if (world == null || center == null) return;
        try {
            Location at = center.clone().add(
                    (random.nextDouble() - 0.5) * radius * 2,
                    0,
                    (random.nextDouble() - 0.5) * radius * 2);
            world.strikeLightningEffect(at);
            playAll(Sound.ENTITY_LIGHTNING_BOLT_IMPACT, 0.75f);
        } catch (Exception ignored) {}
    }

    private void strikePierRing(World world, int cx, int cz, double deckY, int half) {
        if (world == null) return;
        double ang = random.nextDouble() * Math.PI * 2;
        double r = half * (0.55 + random.nextDouble() * 0.55);
        Location at = new Location(world, cx + 0.5 + Math.cos(ang) * r, deckY + 1, cz + 0.5 + Math.sin(ang) * r);
        try {
            world.strikeLightningEffect(at);
            playAll(Sound.ENTITY_LIGHTNING_BOLT_THUNDER, 0.55f);
        } catch (Exception ignored) {}
    }

    /** ไฟไหม้ทีละชั้นจากล่าง → บน (level 0 = ฐานหอ) */
    private void igniteLighthouseLevel(World world, int cx, int cz, int deckY, int levelFromBottom) {
        int h = FishPierBuilder.LIGHTHOUSE_H;
        int y = deckY + 1 + Math.max(0, Math.min(h + 1, levelFromBottom));
        for (int dx = -2; dx <= 2; dx++) {
            for (int dz = -2; dz <= 2; dz++) {
                if (Math.abs(dx) + Math.abs(dz) > 3) continue;
                Block solid = world.getBlockAt(cx + dx, y, cz + dz);
                Block airSpot = solid;
                if (!solid.getType().isAir()) {
                    airSpot = solid.getRelative(0, 1, 0);
                }
                if (airSpot.getType().isAir()) {
                    airSpot.setType(Material.FIRE, false);
                    spectacleFireBlocks.add(airSpot.getLocation().clone());
                } else if (solid.getType().isAir()) {
                    solid.setType(Material.FIRE, false);
                    spectacleFireBlocks.add(solid.getLocation().clone());
                }
            }
        }
        playAll(Sound.ITEM_FIRECHARGE_USE, 0.7f);
        world.spawnParticle(Particle.FLAME,
                new Location(world, cx + 0.5, y + 0.5, cz + 0.5), 20, 1.0, 0.4, 1.0, 0.02);
    }

    /** ระเบิดยอดหอแรงๆ + เศษไฟพุ่งลงน้ำ แล้วลบบล็อก (คืนหลังอนิเมชัน) */
    private void explodeLighthouseTop(World world, int cx, int cz, int deckY) {
        int h = FishPierBuilder.LIGHTHOUSE_H;
        Location boom = new Location(world, cx + 0.5, deckY + h + 1.5, cz + 0.5);
        double waterY = deckY - 1;
        try {
            world.spawnParticle(Particle.EXPLOSION, boom, 8, 0.9, 0.9, 0.9, 0);
            world.spawnParticle(Particle.EXPLOSION_EMITTER, boom, 2, 0.2, 0.2, 0.2, 0);
            world.spawnParticle(Particle.FLASH, boom, 2, 0.1, 0.1, 0.1, 0);
            world.spawnParticle(Particle.FLAME, boom, 90, 1.6, 1.6, 1.6, 0.14);
            world.spawnParticle(Particle.LAVA, boom, 40, 1.2, 0.8, 1.2, 0.2);
            world.spawnParticle(Particle.CAMPFIRE_SIGNAL_SMOKE, boom, 35, 1.2, 1.2, 1.2, 0.03);
            playAll(Sound.ENTITY_GENERIC_EXPLODE, 1.55f);
            playAll(Sound.ENTITY_GENERIC_EXPLODE, 1.2f);
            playAll(Sound.ENTITY_LIGHTNING_BOLT_IMPACT, 1.15f);
        } catch (Exception ignored) {}

        // เศษไฟพุ่งลงน้ำ (ทิศทะเล +Z)
        for (int i = 0; i < 48; i++) {
            double vx = (random.nextDouble() - 0.5) * 1.4;
            double vz = 0.35 + random.nextDouble() * 1.6;
            double vy = -0.55 - random.nextDouble() * 1.1;
            try {
                world.spawnParticle(Particle.FLAME, boom, 0, vx, vy, vz, 0.55);
                if (i % 2 == 0) {
                    world.spawnParticle(Particle.LAVA, boom, 0, vx * 0.8, vy, vz * 0.9, 0.4);
                }
                if (i % 3 == 0) {
                    world.spawnParticle(Particle.SMOKE, boom, 0, vx * 0.6, vy * 0.7, vz * 0.7, 0.35);
                }
            } catch (Exception ignored) {}
        }
        for (int i = 0; i < 20; i++) {
            Location splash = new Location(world,
                    cx + 0.5 + (random.nextDouble() - 0.5) * 10,
                    waterY + 0.3,
                    cz + 0.5 + 4 + random.nextDouble() * 14);
            world.spawnParticle(Particle.SPLASH, splash, 10, 0.35, 0.15, 0.35, 0.02);
            world.spawnParticle(Particle.BUBBLE_POP, splash, 4, 0.25, 0.1, 0.25, 0.01);
            if (i % 4 == 0) {
                world.spawnParticle(Particle.FLAME, splash.clone().add(0, 0.4, 0), 6, 0.2, 0.15, 0.2, 0.01);
            }
        }
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (world == null) return;
            for (int i = 0; i < 24; i++) {
                double vx = (random.nextDouble() - 0.5) * 1.2;
                double vz = 0.4 + random.nextDouble() * 1.4;
                double vy = -0.7 - random.nextDouble() * 0.9;
                try {
                    world.spawnParticle(Particle.FLAME, boom, 0, vx, vy, vz, 0.5);
                    world.spawnParticle(Particle.LAVA, boom, 0, vx * 0.7, vy, vz * 0.8, 0.35);
                } catch (Exception ignored) {}
            }
        }, 4L);

        for (int y = deckY + h - 1; y <= deckY + h + 3; y++) {
            for (int dx = -2; dx <= 2; dx++) {
                for (int dz = -2; dz <= 2; dz++) {
                    Block b = world.getBlockAt(cx + dx, y, cz + dz);
                    Material t = b.getType();
                    if (t.isAir() || t == Material.FIRE || t == Material.SOUL_FIRE) continue;
                    spectacleBlockRestore.add(new WallSavedBlock(b));
                    b.setType(Material.AIR, false);
                }
            }
        }
        for (int i = spectacleFireBlocks.size() - 1; i >= 0; i--) {
            Location loc = spectacleFireBlocks.get(i);
            if (loc.getBlockY() >= deckY + h - 1) {
                try {
                    Block b = loc.getBlock();
                    if (b.getType() == Material.FIRE || b.getType() == Material.SOUL_FIRE) {
                        b.setType(Material.AIR, false);
                    }
                } catch (Exception ignored) {}
                spectacleFireBlocks.remove(i);
            }
        }
    }

    /** ขึ้น title หลังอนิเมชันจบ — เช่น +10 WIN / -10 WIN */
    private void showWinTitleDeferred(boolean plus, int amount, long delayTicks) {
        int n = Math.max(1, amount);
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            if (plus) {
                broadcastTitle("§a§l+" + n + " WIN", "", 8, 55, 18);
                actionBarAll("§a✦ +" + n + " WIN");
                playAll(Sound.UI_TOAST_CHALLENGE_COMPLETE, 1.15f);
                playAll(Sound.ENTITY_PLAYER_LEVELUP, 1.05f);
            } else {
                broadcastTitle("§c§l-" + n + " WIN", "", 8, 55, 18);
                actionBarAll("§c☠ -" + n + " WIN");
                playAll(Sound.ENTITY_WITHER_SPAWN, 0.55f);
            }
        }, Math.max(1L, delayTicks));
    }

    /**
     * ลบวิน — Drowned + ฟ้าผ่ารอบตัว/แพ → ปา Trident → ไฟไหม้ล่าง→บน → -N WIN → ยอดหอระเบิดหาย
     */
    private void playLoseSpectacle(int amount, String subtitle) {
        clearSpectacle();
        int n = Math.max(1, amount);
        World world = resolveWorld();
        FishPierBuilder pier = plugin.getFishPierBuilder();
        if (world == null) {
            showWinTitleDeferred(false, n, 5);
            return;
        }

        final int cx = pier != null && pier.isBuilt() ? pier.getCenterX() : world.getSpawnLocation().getBlockX();
        final int cz = pier != null && pier.isBuilt() ? pier.getCenterZ() : world.getSpawnLocation().getBlockZ();
        final int deckYi = pier != null && pier.isBuilt() ? pier.getDeckY() : world.getSpawnLocation().getBlockY();
        final double deckY = deckYi;
        final int half = pier != null && pier.isBuilt() ? pier.getSquareHalf() : FishPierBuilder.SQUARE_HALF;
        Location towerHit = pier != null && pier.isBuilt()
                ? pier.getLighthouseTop()
                : new Location(world, cx + 0.5, deckY + 14, cz + 0.5);
        if (towerHit == null) {
            towerHit = new Location(world, cx + 0.5, deckY + 14, cz + 0.5);
        }
        final Location towerFinal = towerHit.clone();

        Location base = pier != null ? pier.getSeaSpectacleSpot() : null;
        if (base == null) {
            base = new Location(world, cx + 0.5, deckY - 1, cz + FishPierBuilder.SQUARE_HALF + FishPierBuilder.PIER_LENGTH + 10);
        }
        float faceYaw = yawToward(base, towerFinal);
        Location spawnLoc = base.clone();
        spawnLoc.setYaw(faceYaw);
        spawnLoc.setPitch(-12f);

        final UUID[] drownedId = { null };
        final UUID[] tridentId = { null };
        try {
            Drowned drowned = world.spawn(spawnLoc, Drowned.class, d -> {
                lockSpectacleMob(d);
                scaleGiant(d, 3.4);
                d.setAdult();
                d.setSwimming(false);
            });
            EntityEquipment eq = drowned.getEquipment();
            if (eq != null) {
                eq.setItemInMainHand(new ItemStack(Material.TRIDENT));
                eq.setItemInMainHandDropChance(0f);
                eq.setItemInOffHand(new ItemStack(Material.AIR));
                eq.setHelmet(null);
                eq.setChestplate(null);
                eq.setLeggings(null);
                eq.setBoots(null);
            }
            drowned.teleport(spawnLoc);
            drownedId[0] = drowned.getUniqueId();
            spectacleEntities.add(drowned.getUniqueId());
        } catch (Exception ex) {
            plugin.getLogger().warning("Lose spectacle spawn failed: " + ex.getMessage());
        }

        playAll(Sound.ENTITY_DROWNED_AMBIENT, 1.0f);
        playAll(Sound.ENTITY_LIGHTNING_BOLT_THUNDER, 0.9f);

        // aim+storm → throw → hit → fire climb → title → top boom → cleanup
        final int aimTicks = 36;
        final int throwTicks = 22;
        final int fireLevels = FishPierBuilder.LIGHTHOUSE_H + 1;
        final int fireTicks = fireLevels * 3;
        final int afterTitleTicks = 10;
        final int boomHoldTicks = 16;
        final int totalTicks = aimTicks + throwTicks + fireTicks + afterTitleTicks + boomHoldTicks;
        spectacleUntilMs = System.currentTimeMillis() + (totalTicks * 2L * 50L) + 2000L;
        final long titleAt = (aimTicks + throwTicks + fireTicks) * 2L;
        showWinTitleDeferred(false, n, titleAt);

        Location baseFinal = base.clone();
        Location throwFrom = base.clone().add(0, 2.4, 0);

        spectacleTask = Bukkit.getScheduler().runTaskTimer(plugin, new Runnable() {
            int ticks;
            boolean thrown;
            boolean hit;
            int lastFireLevel = -1;
            boolean topBlown;

            @Override
            public void run() {
                ticks++;
                if (ticks > totalTicks) {
                    clearSpectacle();
                    return;
                }

                Entity drownedEnt = drownedId[0] != null ? Bukkit.getEntity(drownedId[0]) : null;
                if (drownedEnt instanceof LivingEntity living && ticks <= aimTicks + throwTicks) {
                    double swayX = Math.sin(ticks * 0.2) * 0.35;
                    double swayZ = Math.cos(ticks * 0.16) * 0.25;
                    Location loc = baseFinal.clone().add(swayX, Math.sin(ticks * 0.25) * 0.15, swayZ);
                    loc.setYaw(yawToward(loc, towerFinal));
                    loc.setPitch(-18f);
                    living.teleport(loc);
                    world.spawnParticle(Particle.BUBBLE_COLUMN_UP, loc.clone().add(0, 0.4, 0), 4, 0.5, 0.3, 0.5, 0.02);
                    world.spawnParticle(Particle.SMOKE, loc.clone().add(0, 2.0, 0), 3, 0.4, 0.6, 0.4, 0.01);
                    world.spawnParticle(Particle.ELECTRIC_SPARK, loc.clone().add(0, 2.4, 0), 8, 1.2, 1.8, 1.2, 0.05);
                }

                // ฟ้าผ่ารอบ Drowned + รอบแพ ก่อนปา Trident
                if (ticks <= aimTicks && ticks % 5 == 0) {
                    Location stormCenter = drownedEnt != null
                            ? drownedEnt.getLocation().clone()
                            : baseFinal.clone();
                    strikeAround(world, stormCenter, 4.5);
                    strikePierRing(world, cx, cz, deckY, half);
                    if (ticks % 10 == 0) {
                        playAll(Sound.ENTITY_LIGHTNING_BOLT_THUNDER, 0.85f);
                    }
                }

                // ปา Trident ไปหอคอย
                if (!thrown && ticks >= aimTicks) {
                    thrown = true;
                    playAll(Sound.ITEM_TRIDENT_THROW, 1.15f);
                    playAll(Sound.ENTITY_DROWNED_AMBIENT, 1.05f);
                    try {
                        if (drownedEnt instanceof LivingEntity living) {
                            EntityEquipment eq = living.getEquipment();
                            if (eq != null) eq.setItemInMainHand(new ItemStack(Material.AIR));
                        }
                        Location from = drownedEnt != null
                                ? drownedEnt.getLocation().clone().add(0, 2.2, 0)
                                : throwFrom.clone();
                        Trident trident = world.spawn(from, Trident.class, t -> {
                            t.setGravity(false);
                            t.setSilent(true);
                            t.setInvulnerable(true);
                            t.setPickupStatus(AbstractArrow.PickupStatus.DISALLOWED);
                            t.setPersistent(true);
                        });
                        tridentId[0] = trident.getUniqueId();
                        spectacleEntities.add(trident.getUniqueId());
                    } catch (Exception ex) {
                        plugin.getLogger().warning("Trident spawn failed: " + ex.getMessage());
                    }
                }

                if (thrown && !hit && ticks <= aimTicks + throwTicks) {
                    Entity tri = tridentId[0] != null ? Bukkit.getEntity(tridentId[0]) : null;
                    if (tri != null) {
                        double u = (ticks - aimTicks) / (double) throwTicks;
                        u = Math.min(1.0, Math.max(0.0, u));
                        u = u * u * (3 - 2 * u);
                        Location from = throwFrom.clone();
                        if (drownedEnt != null) from = drownedEnt.getLocation().clone().add(0, 2.2, 0);
                        Location next = from.clone().add(
                                (towerFinal.getX() - from.getX()) * u,
                                (towerFinal.getY() - from.getY()) * u,
                                (towerFinal.getZ() - from.getZ()) * u);
                        next.setYaw(yawToward(from, towerFinal));
                        next.setPitch(-25f);
                        tri.teleport(next);
                        world.spawnParticle(Particle.CRIT, next, 4, 0.08, 0.08, 0.08, 0.01);
                        world.spawnParticle(Particle.ELECTRIC_SPARK, next, 2, 0.05, 0.05, 0.05, 0);
                    }
                }

                // ปักหอ + ฟ้าผ่าที่หอ
                if (!hit && ticks >= aimTicks + throwTicks) {
                    hit = true;
                    Entity tri = tridentId[0] != null ? Bukkit.getEntity(tridentId[0]) : null;
                    if (tri != null) {
                        Location stuck = towerFinal.clone();
                        stuck.setYaw(yawToward(baseFinal, towerFinal));
                        stuck.setPitch(70f);
                        tri.teleport(stuck);
                    }
                    try {
                        world.strikeLightningEffect(towerFinal.clone());
                        playAll(Sound.ENTITY_LIGHTNING_BOLT_THUNDER, 1.2f);
                        playAll(Sound.ENTITY_LIGHTNING_BOLT_IMPACT, 1.1f);
                        world.spawnParticle(Particle.EXPLOSION, towerFinal, 2, 0.2, 0.2, 0.2, 0);
                        world.spawnParticle(Particle.FLASH, towerFinal, 1, 0, 0, 0, 0);
                    } catch (Exception ignored) {}
                }

                // ไฟไหม้จากล่างสุดของหอ → บนสุด
                if (hit) {
                    int fireElapsed = ticks - (aimTicks + throwTicks);
                    if (fireElapsed >= 0 && fireElapsed < fireTicks) {
                        int level = fireElapsed / 3;
                        if (level != lastFireLevel && level < fireLevels) {
                            lastFireLevel = level;
                            igniteLighthouseLevel(world, cx, cz, deckYi, level);
                        }
                        world.spawnParticle(Particle.FLAME, towerFinal, 10, 1.0, 1.2, 1.0, 0.02);
                        world.spawnParticle(Particle.CAMPFIRE_COSY_SMOKE,
                                new Location(world, cx + 0.5, deckY + 2 + lastFireLevel, cz + 0.5),
                                4, 0.6, 0.4, 0.6, 0.01);
                        if (ticks % 8 == 0) playAll(Sound.BLOCK_FIRE_AMBIENT, 0.9f);
                    }
                }

                // หลังโชว์ -WIN → ยอดหอระเบิดแล้วหายไป
                int boomAt = aimTicks + throwTicks + fireTicks + afterTitleTicks;
                if (!topBlown && ticks >= boomAt) {
                    topBlown = true;
                    Entity tri = tridentId[0] != null ? Bukkit.getEntity(tridentId[0]) : null;
                    if (tri != null) {
                        tri.remove();
                        spectacleEntities.remove(tridentId[0]);
                        tridentId[0] = null;
                    }
                    explodeLighthouseTop(world, cx, cz, deckYi);
                }
            }
        }, 1L, 2L);
    }

    /**
     * บวกวิน — Allay บินเข้าหอ → ลำแสงหนา 4 มุม → ระเบิด Allay ตัวเล็ก + ฝนฟ้าทั่วแพ → +N WIN → บินหาย
     */
    private void playWinSpectacle(int amount) {
        clearSpectacle();
        int n = Math.max(1, amount);
        World world = resolveWorld();
        FishPierBuilder pier = plugin.getFishPierBuilder();
        if (world == null) {
            showWinTitleDeferred(true, n, 5);
            return;
        }

        final double cx;
        final double cz;
        final double deckY;
        final Location landSpot;
        final int half;
        if (pier != null && pier.isBuilt()) {
            cx = pier.getCenterX() + 0.5;
            cz = pier.getCenterZ() + 0.5;
            deckY = pier.getDeckY();
            half = pier.getSquareHalf();
            landSpot = pier.getLighthouseTop();
        } else {
            Location sp = world.getSpawnLocation();
            cx = sp.getX();
            cz = sp.getZ();
            deckY = sp.getY();
            half = 14;
            landSpot = sp.clone().add(0, 14, 0);
        }
        if (landSpot == null) {
            showWinTitleDeferred(true, n, 5);
            return;
        }

        final double orbitR = half + 3.5;
        final double flyY = deckY + 9;
        final Location[] corners = deckCornerBeacons(world, cx, cz, deckY, half);
        final Location landFinal = landSpot.clone();
        Location pierTipLook = new Location(world, cx, deckY + 1, cz + half + FishPierBuilder.PIER_LENGTH + 2);
        landFinal.setYaw(yawToward(landFinal, pierTipLook));
        landFinal.setPitch(8f);

        Location start = new Location(world, cx + orbitR, flyY, cz, 0f, 0f);
        final UUID[] allayId = { null };
        final List<UUID> miniIds = new ArrayList<>();
        try {
            Allay allay = world.spawn(start, Allay.class, a -> {
                lockSpectacleMob(a);
                scaleGiant(a, 5.8);
                a.setCanDuplicate(false);
                a.setGravity(false);
            });
            allayId[0] = allay.getUniqueId();
            spectacleEntities.add(allay.getUniqueId());
        } catch (Exception ex) {
            plugin.getLogger().warning("Win spectacle spawn failed: " + ex.getMessage());
        }

        playAll(Sound.ENTITY_ALLAY_AMBIENT_WITH_ITEM, 1.15f);
        playAll(Sound.BLOCK_AMETHYST_BLOCK_CHIME, 1.2f);

        final int approachTicks = 36;
        final int beamTicks = 26;
        final int orbitTicks = 44;
        final int fleeTicks = 28;
        final int totalTicks = approachTicks + beamTicks + orbitTicks + fleeTicks;
        final int miniCount = 14;
        spectacleUntilMs = System.currentTimeMillis() + (totalTicks * 2L * 50L) + 1500L;
        showWinTitleDeferred(true, n, (approachTicks + beamTicks + orbitTicks - 6L) * 2L);

        Particle.DustOptions blue = new Particle.DustOptions(Color.fromRGB(80, 190, 255), 1.55f);
        Particle.DustOptions cyan = new Particle.DustOptions(Color.fromRGB(160, 240, 255), 1.2f);
        Particle.DustOptions soft = new Particle.DustOptions(Color.fromRGB(200, 250, 255), 0.95f);
        Particle.DustOptions gold = new Particle.DustOptions(Color.fromRGB(255, 230, 120), 1.35f);

        spectacleTask = Bukkit.getScheduler().runTaskTimer(plugin, new Runnable() {
            int ticks;
            boolean burst;

            @Override
            public void run() {
                ticks++;
                if (ticks > totalTicks) {
                    clearSpectacle();
                    return;
                }

                Entity big = allayId[0] != null ? Bukkit.getEntity(allayId[0]) : null;

                if (ticks <= approachTicks && big != null) {
                    double u = ticks / (double) approachTicks;
                    u = u * u * (3 - 2 * u);
                    double ang = Math.PI * 1.6 * (1.0 - u);
                    Location from = new Location(world,
                            cx + Math.cos(ang) * orbitR,
                            flyY + Math.sin(ang * 2) * 1.2,
                            cz + Math.sin(ang) * orbitR);
                    Location next = from.clone().add(
                            (landFinal.getX() - from.getX()) * u,
                            (landFinal.getY() - from.getY()) * u,
                            (landFinal.getZ() - from.getZ()) * u);
                    if (u > 0.85) next = landFinal.clone();
                    next.setYaw(yawToward(next, landFinal));
                    next.setPitch(6f);
                    big.teleport(next);
                    world.spawnParticle(Particle.END_ROD, next.clone().add(0, 0.4, 0), 5, 0.3, 0.3, 0.3, 0.01);
                    world.spawnParticle(Particle.SOUL_FIRE_FLAME, next, 3, 0.25, 0.25, 0.25, 0.01);
                }

                // ลำแสงนิ่ง 4 มุม → Allay (ไม่ใช้ END_ROD ที่พุ่ง)
                if (ticks > approachTicks && ticks <= approachTicks + beamTicks && big != null) {
                    big.teleport(landFinal);
                    Location focus = landFinal.clone().add(0, 0.6, 0);
                    for (Location corner : corners) {
                        spawnBeam(world, corner, focus, blue);
                        world.spawnParticle(Particle.GLOW, corner, 3, 0.12, 0.12, 0.12, 0);
                    }
                    world.spawnParticle(Particle.DUST, focus, 6, 0.25, 0.3, 0.25, 0, gold);
                    if (ticks % 8 == 0) {
                        playAll(Sound.BLOCK_BEACON_AMBIENT, 0.7f);
                    }
                }

                if (!burst && ticks >= approachTicks + beamTicks) {
                    burst = true;
                    playAll(Sound.ENTITY_GENERIC_EXPLODE, 0.75f);
                    playAll(Sound.ENTITY_ALLAY_AMBIENT_WITHOUT_ITEM, 1.3f);
                    playAll(Sound.ENTITY_FIREWORK_ROCKET_BLAST, 1.05f);
                    world.spawnParticle(Particle.FLASH, landFinal, 1, 0, 0, 0, 0);
                    world.spawnParticle(Particle.EXPLOSION, landFinal, 3, 0.4, 0.4, 0.4, 0);
                    world.spawnParticle(Particle.END_ROD, landFinal, 55, 1.0, 1.0, 1.0, 0.18);
                    world.spawnParticle(Particle.FIREWORK, landFinal, 30, 0.8, 0.8, 0.8, 0.08);
                    if (big != null) {
                        big.remove();
                        spectacleEntities.remove(allayId[0]);
                        allayId[0] = null;
                    }
                    for (int i = 0; i < miniCount; i++) {
                        double ang = (Math.PI * 2 * i) / miniCount;
                        Location spawnAt = landFinal.clone().add(Math.cos(ang) * 1.2, 0.4, Math.sin(ang) * 1.2);
                        try {
                            Allay mini = world.spawn(spawnAt, Allay.class, a -> {
                                lockSpectacleMob(a);
                                scaleGiant(a, 0.55);
                                a.setCanDuplicate(false);
                                a.setGravity(false);
                            });
                            miniIds.add(mini.getUniqueId());
                            spectacleEntities.add(mini.getUniqueId());
                        } catch (Exception ignored) {}
                    }
                }

                int phaseStart = approachTicks + beamTicks;
                // Allay ตัวเล็กวนหอ + ฝนฟ้าทั่วแพ
                if (burst && ticks <= phaseStart + orbitTicks) {
                    spawnBluePierRain(world, cx, cz, deckY, half, blue, soft, cyan);
                    double t = (ticks - phaseStart) / (double) orbitTicks;
                    double radius = 3.2 + Math.sin(t * Math.PI) * 0.6;
                    for (int i = 0; i < miniIds.size(); i++) {
                        Entity e = Bukkit.getEntity(miniIds.get(i));
                        if (e == null) continue;
                        double ang = t * Math.PI * 4 + (Math.PI * 2 * i) / Math.max(1, miniIds.size());
                        double y = landFinal.getY() + Math.sin(ang * 2 + i) * 1.1 + 0.3;
                        Location next = new Location(world,
                                landFinal.getX() + Math.cos(ang) * radius,
                                y,
                                landFinal.getZ() + Math.sin(ang) * radius);
                        Location ahead = new Location(world,
                                landFinal.getX() + Math.cos(ang + 0.4) * radius,
                                y,
                                landFinal.getZ() + Math.sin(ang + 0.4) * radius);
                        next.setYaw(yawToward(next, ahead));
                        next.setPitch(-10f);
                        e.teleport(next);
                        world.spawnParticle(Particle.DUST, next, 1, 0.05, 0.05, 0.05, 0, blue);
                    }
                    if (ticks % 10 == 0) playAll(Sound.ENTITY_ALLAY_AMBIENT_WITH_ITEM, 1.1f);
                    if (ticks % 15 == 0) playAll(Sound.BLOCK_AMETHYST_BLOCK_CHIME, 1.05f);
                }

                if (burst && ticks > phaseStart + orbitTicks) {
                    double u = (ticks - phaseStart - orbitTicks) / (double) fleeTicks;
                    u = Math.min(1.0, Math.max(0.0, u));
                    double radius = 3.4 + u * 10.0;
                    for (int i = 0; i < miniIds.size(); i++) {
                        Entity e = Bukkit.getEntity(miniIds.get(i));
                        if (e == null) continue;
                        double ang = (Math.PI * 2 * i) / Math.max(1, miniIds.size()) + u * 2.5;
                        Location next = new Location(world,
                                landFinal.getX() + Math.cos(ang) * radius,
                                landFinal.getY() + 1.5 + u * 8.0,
                                landFinal.getZ() + Math.sin(ang) * radius);
                        next.setYaw(yawToward(landFinal, next));
                        next.setPitch(-30f);
                        e.teleport(next);
                        world.spawnParticle(Particle.END_ROD, next, 2, 0.1, 0.1, 0.1, 0.01);
                        if (u > 0.85) {
                            e.remove();
                            spectacleEntities.remove(miniIds.get(i));
                        }
                    }
                }
            }
        }, 1L, 2L);
    }
}
