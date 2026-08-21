package com.tokcontrol.minecraft;

import org.bukkit.Bukkit;
import org.bukkit.Color;
import org.bukkit.FireworkEffect;
import org.bukkit.GameMode;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.Sound;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.entity.EnderDragon;
import org.bukkit.entity.Entity;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Firework;
import org.bukkit.entity.Player;
import org.bukkit.entity.SmallFireball;
import org.bukkit.entity.Snowball;
import org.bukkit.entity.Villager;
import org.bukkit.inventory.EntityEquipment;
import org.bukkit.inventory.ItemStack;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockDamageEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.EntityExplodeEvent;
import org.bukkit.event.entity.ProjectileHitEvent;
import org.bukkit.event.entity.ProjectileLaunchEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.meta.FireworkMeta;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.util.Vector;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

public final class GameSessionService implements Listener {

    private final TokControlPlugin plugin;
    private final PathZoneService pathZone;
    private final Random random = new Random();

    private int winTicksLeft;
    private int winTotalTicks;
    private boolean winActive;
    /** หลังชนะ — กันเริ่มนับใหม่ / ขึ้นพัง ระหว่างฉลอง+รีเซ็ต */
    private int winLockoutTicks;
    /** ช่วง 3 วิสุดท้าย — นับช้า + ลุ้น */
    private int winSlowAccum;
    private int lastDramaticSec = -1;
    private int fillCheckCooldown;
    private int hudPulse;

    private final Map<UUID, GlassCage> cages = new HashMap<>();
    private BukkitTask lavaTask;
    private BukkitTask villagerTask;
    private BukkitTask animTask;
    private final List<Villager> helperVillagers = new ArrayList<>();
    private final List<Entity> animEntities = new ArrayList<>();
    /** บวกวินเติมแมพแล้ว — กันนับ WIN ซ้ำตอนชนะแมพ */
    private boolean suppressNextMapWinDelta;

    private static final class SavedBlock {
        final int x, y, z;
        final Material type;

        SavedBlock(Block b) {
            this.x = b.getX();
            this.y = b.getY();
            this.z = b.getZ();
            this.type = b.getType();
        }
    }

    private static final int CAGE_MIN_HALF = 2;
    private static final int CAGE_MAX_HALF = 24;

    private static final class GlassCage {
        int ticksLeft;
        World world;
        int ox, oy, oz;
        int half = CAGE_MIN_HALF;
        float yaw, pitch;
        final List<SavedBlock> previous = new ArrayList<>();
        final Set<String> protectedKeys = new HashSet<>();
    }

    private String blockKey(int x, int y, int z) {
        return x + "," + y + "," + z;
    }

    private boolean isCageGlass(Block block) {
        if (block == null) return false;
        String key = blockKey(block.getX(), block.getY(), block.getZ());
        for (GlassCage cage : cages.values()) {
            if (cage.protectedKeys.contains(key)) return true;
        }
        return false;
    }

    public GameSessionService(TokControlPlugin plugin, PathZoneService pathZone) {
        this.plugin = plugin;
        this.pathZone = pathZone;
        Bukkit.getScheduler().runTaskTimer(plugin, this::tick, 1L, 1L);
    }

    public void startWinCountdown(int seconds) {
        if (winActive || winLockoutTicks > 0) return;
        int sec = Math.max(3, Math.min(120, seconds));
        winTicksLeft = sec * 20;
        winTotalTicks = winTicksLeft;
        winActive = true;
        winSlowAccum = 0;
        lastDramaticSec = -1;
        broadcastTitle("§a§l" + sec, "§aแมพเต็ม", 5, 25, 5);
        playAll(Sound.BLOCK_NOTE_BLOCK_PLING, 1.4f);
        playAll(Sound.BLOCK_BELL_USE, 1.0f);
    }

    public void cancelWinCountdown(String reason) {
        if (!winActive) return;
        if (winLockoutTicks > 0) return; // ช่วงฉลองชนะ — ไม่ขึ้นพัง
        winActive = false;
        winTicksLeft = 0;
        if (reason != null && reason.contains("พัง")) {
            flashDestroyAnim();
        }
    }

    public void flashDestroyAnim() {
        broadcastTitle("§c§lพัง", "", 5, 35, 12);
        playAll(Sound.ENTITY_GENERIC_EXPLODE, 0.9f);
        playAll(Sound.ENTITY_WITHER_BREAK_BLOCK, 0.7f);
    }

    public void flashAddTimeAnim(int seconds) {
        broadcastTitle("§6§l+" + seconds, "", 5, 25, 8);
        playAll(Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 1.3f);
        playAll(Sound.BLOCK_NOTE_BLOCK_CHIME, 1.5f);
    }

    public void stunPlayer(int seconds) {
        Player target = resolveAnyPlayer();
        if (target == null) return;
        int sec = Math.max(1, seconds);
        applyGlassCage(target, sec * 20);
        broadcastCageFx(target, "§6§l" + sec, "§6ห้องขัง", Sound.BLOCK_GLASS_PLACE, 0.8f);
        playCageSound(target, Sound.BLOCK_NOTE_BLOCK_BASS, 0.6f);
    }

    public void addStun(int seconds) {
        Player target = resolveAnyPlayer();
        if (target == null) return;
        GlassCage cage = cages.get(target.getUniqueId());
        if (cage == null) {
            stunPlayer(seconds);
            return;
        }
        int add = Math.max(1, seconds);
        cage.ticksLeft += add * 20;
        flashAddTimeAnim(add);
        int left = Math.max(1, (cage.ticksLeft + 19) / 20);
        broadcastCageFx(target, "§6§l" + left, "§e+" + add + " วิ", Sound.ENTITY_EXPERIENCE_ORB_PICKUP, 1.3f);
    }

    public void reduceStun(int seconds) {
        Player target = resolveAnyPlayer();
        if (target == null) return;
        GlassCage cage = cages.get(target.getUniqueId());
        if (cage == null) {
            return;
        }
        int sub = Math.max(1, seconds);
        cage.ticksLeft = Math.max(0, cage.ticksLeft - sub * 20);
        if (cage.ticksLeft <= 0) {
            releaseGlassCage(target.getUniqueId());
            return;
        }
        int left = Math.max(1, (cage.ticksLeft + 19) / 20);
        broadcastCageFx(target, "§e§l" + left, "§f-" + sub + " วิ", Sound.BLOCK_NOTE_BLOCK_BASS, 0.8f);
    }

    private void broadcastCageFx(Player target, String title, String sub, Sound sound, float pitch) {
        World w = target.getWorld();
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!p.getWorld().equals(w)) continue;
            p.sendTitle(title, sub == null ? "" : sub, 5, 25, 10);
            p.playSound(p.getLocation(), sound, 1f, pitch);
        }
    }

    private void playCageSound(Player target, Sound sound, float pitch) {
        World w = target.getWorld();
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!p.getWorld().equals(w)) continue;
            p.playSound(p.getLocation(), sound, 1f, pitch);
        }
    }

    private Player resolveAnyPlayer() {
        Player target = plugin.resolveStreamer();
        if (target == null && !Bukkit.getOnlinePlayers().isEmpty()) {
            target = Bukkit.getOnlinePlayers().iterator().next();
        }
        return target;
    }

    private void applyGlassCage(Player player, int ticks) {
        applyGlassCage(player, ticks, CAGE_MIN_HALF);
    }

    private void applyGlassCage(Player player, int ticks, int half) {
        UUID id = player.getUniqueId();
        releaseGlassCage(id);

        GlassCage cage = new GlassCage();
        cage.ticksLeft = ticks;
        cage.world = player.getWorld();
        cage.ox = player.getLocation().getBlockX();
        cage.oy = player.getLocation().getBlockY();
        cage.oz = player.getLocation().getBlockZ();
        cage.yaw = player.getLocation().getYaw();
        cage.pitch = player.getLocation().getPitch();
        cage.half = Math.max(CAGE_MIN_HALF, Math.min(cageMaxHalf(cage.world), half));
        cages.put(id, cage);
        placeCageBlocks(cage);
        player.teleport(new Location(cage.world, cage.ox + 0.5, cage.oy, cage.oz + 0.5,
                cage.yaw, cage.pitch));
        plugin.enablePlayerFlight(player);
    }

    private int cageMaxHalf(World world) {
        if (world != null && FarmBuilder.isFarmWorld(world) && plugin.getFarmBuilder() != null
                && plugin.getFarmBuilder().isBuilt()) {
            return Math.max(CAGE_MIN_HALF, plugin.getFarmBuilder().getHalf() - 2);
        }
        if (plugin.getArenaBuilder() != null) {
            return Math.max(CAGE_MIN_HALF, plugin.getArenaBuilder().getCurrentExpandLevel() - 1);
        }
        return CAGE_MAX_HALF;
    }

    private void placeCageBlocks(GlassCage cage) {
        if (cage == null || cage.world == null) return;
        cage.previous.clear();
        cage.protectedKeys.clear();
        int h = Math.max(1, cage.half);
        int px = cage.ox;
        int py = cage.oy;
        int pz = cage.oz;
        for (int x = px - h; x <= px + h; x++) {
            for (int z = pz - h; z <= pz + h; z++) {
                for (int y = py - 1; y <= py + 3; y++) {
                    boolean floor = y == py - 1 && Math.abs(x - px) < h && Math.abs(z - pz) < h;
                    boolean ceiling = y == py + 3 && Math.abs(x - px) < h && Math.abs(z - pz) < h;
                    boolean wallRing = (Math.abs(x - px) == h || Math.abs(z - pz) == h)
                            && y >= py && y <= py + 2;
                    if (!floor && !ceiling && !wallRing) continue;
                    Block block = cage.world.getBlockAt(x, y, z);
                    if (block.getType() == Material.BEDROCK) continue;
                    cage.previous.add(new SavedBlock(block));
                    cage.protectedKeys.add(blockKey(x, y, z));
                    block.setType(Material.BLUE_STAINED_GLASS, false);
                }
            }
        }
    }

    private void restoreCageBlocks(GlassCage cage) {
        if (cage == null || cage.world == null) return;
        for (int i = cage.previous.size() - 1; i >= 0; i--) {
            SavedBlock s = cage.previous.get(i);
            Block b = cage.world.getBlockAt(s.x, s.y, s.z);
            Material cur = b.getType();
            if (cur == Material.GLASS || cur == Material.BLUE_STAINED_GLASS || cur.isAir()) {
                b.setType(s.type, false);
            }
        }
        cage.previous.clear();
        cage.protectedKeys.clear();
    }

    private void releaseGlassCage(UUID id) {
        GlassCage cage = cages.remove(id);
        if (cage == null) return;
        restoreCageBlocks(cage);
        Player p = Bukkit.getPlayer(id);
        if (p != null) {
            plugin.enablePlayerFlight(p);
        }
    }

    public void releaseCagesOutside(int cx, int cz, int keepHalf) {
        if (cages.isEmpty()) return;
        for (UUID id : new ArrayList<>(cages.keySet())) {
            GlassCage cage = cages.get(id);
            if (cage == null) continue;
            int cheb = Math.max(Math.abs(cage.ox - cx), Math.abs(cage.oz - cz));
            if (cheb <= keepHalf) continue;
            cages.remove(id);
            Player p = Bukkit.getPlayer(id);
            if (p != null) plugin.enablePlayerFlight(p);
        }
    }

    public boolean isCageProtected(int x, int y, int z) {
        String key = blockKey(x, y, z);
        for (GlassCage cage : cages.values()) {
            if (cage != null && cage.protectedKeys.contains(key)) return true;
        }
        return false;
    }

    public boolean isCaged(Player player) {
        return player != null && cages.containsKey(player.getUniqueId());
    }

    public boolean isInsideActiveCage(int x, int z) {
        for (GlassCage cage : cages.values()) {
            if (cage == null) continue;
            if (Math.abs(x - cage.ox) <= cage.half && Math.abs(z - cage.oz) <= cage.half) return true;
        }
        return false;
    }

    public Map<UUID, int[]> snapshotCages() {
        Map<UUID, int[]> out = new HashMap<>();
        for (Map.Entry<UUID, GlassCage> e : cages.entrySet()) {
            GlassCage c = e.getValue();
            if (c != null && c.ticksLeft > 0) {
                out.put(e.getKey(), new int[]{c.ticksLeft, c.half});
            }
        }
        return out;
    }

    public void detachCagesWithoutRestore() {
        cages.clear();
    }

    public void reapplyCages(Map<UUID, int[]> remain) {
        reapplyCages(remain, 0);
    }

    public void reapplyCages(Map<UUID, int[]> remain, int extraHalf) {
        if (remain == null || remain.isEmpty()) return;
        for (Map.Entry<UUID, int[]> e : remain.entrySet()) {
            Player p = Bukkit.getPlayer(e.getKey());
            int[] v = e.getValue();
            int ticks = v != null && v.length > 0 ? v[0] : 0;
            int half = (v != null && v.length > 1 ? v[1] : CAGE_MIN_HALF) + extraHalf;
            if (p == null || !p.isOnline() || ticks <= 0) continue;
            applyGlassCage(p, ticks, half);
        }
    }

    /** ลาวาเต็มทั้งแมพทุกช่อง จากบนลงล่าง แล้วเคลียร์ */
    public void startLavaMelt() {
        if (lavaTask != null) {
            lavaTask.cancel();
            lavaTask = null;
        }
        ArenaState state = plugin.getArenaState();
        World world = state.getWorld();
        if (world == null) return;
        ArenaBuilder arena = plugin.getArenaBuilder();
        final int[] y = { state.getFloorY() + state.getLayerHeight() };
        final int floorY = state.getFloorY();
        broadcastTitle("§6§lลาวา", "§cเต็มแมพ จากบนลงล่าง", 5, 30, 10);
        playAll(Sound.ITEM_BUCKET_EMPTY_LAVA, 0.9f);
        lavaTask = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            if (y[0] <= floorY) {
                arena.resetBedrockMap(world);
                playAll(Sound.BLOCK_LAVA_EXTINGUISH, 1.1f);
                if (lavaTask != null) {
                    lavaTask.cancel();
                    lavaTask = null;
                }
                return;
            }
            int level = arena.getCurrentExpandLevel();
            int cx = state.getCenterX();
            int cz = state.getCenterZ();
            int yy = y[0];
            for (int x = cx - level; x <= cx + level; x++) {
                for (int z = cz - level; z <= cz + level; z++) {
                    Block b = world.getBlockAt(x, yy, z);
                    if (b.getType() == Material.BEDROCK) continue;
                    // เต็มทุกช่อง รวมอากาศ
                    b.setType(Material.LAVA, false);
                    final int fx = x, fz = z, fy = yy;
                    Bukkit.getScheduler().runTaskLater(plugin, () -> {
                        Block nb = world.getBlockAt(fx, fy, fz);
                        if (nb.getType() == Material.LAVA) nb.setType(Material.AIR, false);
                    }, 10L);
                }
            }
            playAll(Sound.BLOCK_LAVA_EXTINGUISH, 0.7f);
            y[0]--;
        }, 4L, 6L);
    }

    /** ชาวบ้านช่วยต่อ — เต็มทั้งแมพทันที */
    public void startVillagerHelp() {
        stopVillagerHelp();
        ArenaState state = plugin.getArenaState();
        World world = state.getWorld();
        if (world == null) return;
        ArenaBuilder arena = plugin.getArenaBuilder();
        Location spawn = arena.spawnLocation(world);
        for (int i = 0; i < 2; i++) {
            Location at = spawn.clone().add((i % 2) * 2 - 1, 0, 0);
            Villager v = (Villager) world.spawnEntity(at, EntityType.VILLAGER);
            v.setCustomName("§aช่างช่วยต่อ");
            v.setCustomNameVisible(true);
            v.setInvulnerable(true);
            v.setSilent(true);
            v.setAI(false);
            v.setCollidable(false);
            helperVillagers.add(v);
        }
        playAll(Sound.ENTITY_VILLAGER_YES, 1.2f);
        broadcastTitle("§a§lเต็ม!", "§fช่วยต่อทันที", 5, 25, 8);
        arena.fillAllPlayInstant(world);
        playAll(Sound.ENTITY_PLAYER_LEVELUP, 1.1f);
        playAll(Sound.BLOCK_ANVIL_LAND, 0.6f);
        fillCheckCooldown = 0;
        Bukkit.getScheduler().runTaskLater(plugin, this::stopVillagerHelp, 40L);
    }

    /** ช่วยต่อ 1 ชั้น */
    public void helpFillOneLayer() {
        World world = plugin.getArenaState().getWorld();
        if (world == null) return;
        int n = plugin.getArenaBuilder().fillOneLayer(world);
        broadcastTitle("§a§l+1 ชั้น", n > 0 ? "§fเติม " + n + " บล็อก" : "§7เต็มแล้ว", 5, 25, 8);
        playAll(Sound.BLOCK_NOTE_BLOCK_CHIME, 1.3f);
        fillCheckCooldown = 0;
    }

    /** ช่วยต่อ 1 แถว */
    public void helpFillTenRows() {
        World world = plugin.getArenaState().getWorld();
        if (world == null) return;
        int n = plugin.getArenaBuilder().fillTenRows(world);
        broadcastTitle("§a§l+1 แถว", n > 0 ? "§fเติม " + n + " บล็อก" : "§7เต็มแล้ว", 5, 25, 8);
        playAll(Sound.BLOCK_NOTE_BLOCK_PLING, 1.35f);
        fillCheckCooldown = 0;
    }

    private int[] findRandomEmptyCell(ArenaBuilder arena, ArenaState state, World world) {
        int level = arena.getCurrentExpandLevel();
        int floorY = state.getFloorY();
        int height = state.getLayerHeight();
        int cx = state.getCenterX();
        int cz = state.getCenterZ();
        List<int[]> empty = new ArrayList<>();
        for (int x = cx - level; x <= cx + level; x++) {
            for (int z = cz - level; z <= cz + level; z++) {
                for (int y = floorY + 1; y <= floorY + height; y++) {
                    if (world.getBlockAt(x, y, z).getType().isAir()) {
                        empty.add(new int[]{x, y, z});
                        break;
                    }
                }
            }
        }
        if (empty.isEmpty()) return null;
        return empty.get(random.nextInt(empty.size()));
    }

    public void stopVillagerHelp() {
        if (villagerTask != null) {
            villagerTask.cancel();
            villagerTask = null;
        }
        for (Villager v : helperVillagers) {
            if (v != null && !v.isDead()) v.remove();
        }
        helperVillagers.clear();
    }

    private void tick() {
        hudPulse++;
        // ห้องขังกระจก — ใช้ได้ทุกโหมด (Box / Farm / …)
        tickCages();
        tickCageHud();

        // ไม่รัน logic / เสียง Box บนโลก Farm/Fish/Tower
        World arenaWorld = plugin.getArenaState().getWorld();
        if (arenaWorld != null && !isBoxWorld(arenaWorld)) return;
        if (plugin.isFarmMode() || plugin.isFishMode() || plugin.isTowerMode()) return;
        if (winLockoutTicks > 0) winLockoutTicks--;
        tickFillWin();
        tickWin();
        tickHud();
        // ดับไฟ + คงกลางวัน
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!isBoxPlayer(p)) continue;
            if (p.getFireTicks() > 0) p.setFireTicks(0);
        }
        if (hudPulse % 100 == 0) {
            World w = plugin.getArenaState().getWorld();
            if (w != null && isBoxWorld(w)) plugin.getArenaBuilder().applyBrightWorld(w);
        }
    }

    /** นับวินาทีห้องขังกลางจอ — ทุกแมพ */
    private void tickCageHud() {
        if (cages.isEmpty()) return;
        if (hudPulse % 20 != 0) return;
        for (Map.Entry<UUID, GlassCage> e : cages.entrySet()) {
            Player p = Bukkit.getPlayer(e.getKey());
            if (p == null || !p.isOnline()) continue;
            GlassCage cage = e.getValue();
            if (cage == null || cage.ticksLeft <= 0) continue;
            int sec = Math.max(1, (cage.ticksLeft + 19) / 20);
            String color = sec <= 3 ? "§c§l" : (sec <= 7 ? "§6§l" : "§e§l");
            p.sendTitle(color + sec, "§6ห้องขัง", 0, 25, 5);
        }
    }

    private void tickHud() {
        if (winActive) {
            int sec = Math.max(0, (winTicksLeft + 19) / 20);
            if (sec <= 3) {
                // ช่วงลุ้น — กระพริบบ่อย + เสียงเร่ง
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
    }

    private void tickFillWin() {
        if (plugin.isFishMode()) return;
        if (winLockoutTicks > 0) return;
        if (fillCheckCooldown > 0) {
            fillCheckCooldown--;
            return;
        }
        fillCheckCooldown = 10;
        if (plugin.getArenaState().getWorld() == null) return;
        boolean complete = plugin.getArenaBuilder().isPlayVolumeFull();
        if (complete && !winActive && plugin.getConfig().getBoolean("win.auto-on-fill", true)) {
            startWinCountdown(plugin.getConfig().getInt("win.countdown-seconds", 15));
        } else if (!complete && winActive) {
            cancelWinCountdown("พัง");
        }
    }

    private void tickWin() {
        if (!winActive) return;
        int secLeft = Math.max(0, (winTicksLeft + 19) / 20);
        if (secLeft <= 3 && winTicksLeft > 0) {
            // นับช้าขึ้น ~1.8 เท่า (36 ticks ต่อ 1 วินาทีที่แสดง)
            winSlowAccum++;
            if (winSlowAccum < 36) return;
            winSlowAccum = 0;
            winTicksLeft = Math.max(0, (secLeft - 1) * 20);
        } else {
            winSlowAccum = 0;
            winTicksLeft--;
        }
        if (winTicksLeft > 0) return;
        onFillWinSuccess();
    }

    private void onFillWinSuccess() {
        winActive = false;
        winTicksLeft = 0;
        winLockoutTicks = 120;
        var world = plugin.getArenaState().getWorld();
        // เก็บเวลาห้องขัง — รีเซ็ตแมพแล้วขังต่อจนหมดเวลา
        Map<UUID, int[]> cageRemain = snapshotCages();
        detachCagesWithoutRestore();
        broadcastTitle("§a§lชนะ!", "§eเริ่มแมพใหม่", 10, 60, 20);
        playAll(Sound.UI_TOAST_CHALLENGE_COMPLETE, 1f);
        playAll(Sound.ENTITY_PLAYER_LEVELUP, 0.9f);
        spawnArenaFireworks();
        Bukkit.getScheduler().runTaskLater(plugin, this::spawnArenaFireworks, 15L);
        Bukkit.getScheduler().runTaskLater(plugin, this::spawnArenaFireworks, 30L);
        if (world != null) {
            Bukkit.getScheduler().runTaskLater(plugin, () -> {
                plugin.getArenaBuilder().resetToNineByNine(world);
                playAll(Sound.BLOCK_BEACON_DEACTIVATE, 1.1f);
                broadcastTitle("§e§lเริ่มใหม่", "§fแมพ 9×9", 5, 30, 10);
                winLockoutTicks = Math.max(winLockoutTicks, 40);
                reapplyCages(cageRemain);
                if (!suppressNextMapWinDelta) {
                    BridgeHttpServer.queueWinDelta(1);
                }
                suppressNextMapWinDelta = false;
            }, 70L);
        } else {
            reapplyCages(cageRemain);
        }
    }

    private void stopAnim() {
        if (animTask != null) {
            animTask.cancel();
            animTask = null;
        }
        for (Entity ent : animEntities) {
            if (ent != null && ent.isValid()) ent.remove();
        }
        animEntities.clear();
    }

    /** ลบวิน — มังกรบินวนบนฟ้า ปล่อยลูกไฟลงมา ~10 วินาที */
    public void playMinusWinAnim() {
        stopAnim();
        if (winActive) cancelWinCountdown("ลบวิน");
        ArenaState state = plugin.getArenaState();
        World world = state.getWorld();
        if (world == null) return;
        ArenaBuilder arena = plugin.getArenaBuilder();
        int cx = state.getCenterX();
        int cz = state.getCenterZ();
        int floorY = state.getFloorY();
        int height = state.getLayerHeight();
        int level = Math.max(2, arena.getCurrentExpandLevel());
        // บินสูงเหนือแมพตลอด
        double skyY = floorY + height + 10;

        broadcastTitle("§c§lว๊ายลบวิน!", "", 5, 40, 10);
        playAll(Sound.ENTITY_ENDER_DRAGON_FLAP, 1.3f);
        playAll(Sound.ITEM_FIRECHARGE_USE, 0.9f);

        Location spawnAt = new Location(world, cx + level + 8.0, skyY, cz + 0.5);
        EnderDragon dragon = (EnderDragon) world.spawnEntity(spawnAt, EntityType.ENDER_DRAGON);
        dragon.setCustomName("§c§lลบวิน!");
        dragon.setCustomNameVisible(true);
        dragon.setInvulnerable(true);
        dragon.setSilent(true);
        dragon.setGravity(false);
        try {
            dragon.setPhase(EnderDragon.Phase.CIRCLING);
        } catch (Throwable ignored) {}
        animEntities.add(dragon);

        final int[] tick = {0};
        final int duration = 200; // 10 วินาที
        animTask = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            tick[0]++;
            if (!dragon.isValid()) {
                stopAnim();
                return;
            }
            double prog = tick[0] / (double) duration;
            // วนช้าบนฟ้า ~1.25 รอบ
            double ang = prog * Math.PI * 2.5;
            double r = level + 8.0;
            double y = skyY + Math.sin(prog * Math.PI * 2) * 1.2;
            double x = cx + 0.5 + Math.cos(ang) * r;
            double z = cz + 0.5 + Math.sin(ang) * r;

            // ทิศบินตามวงกลม (มังกรหันกลับด้านโมเดล — กลับทิศ tangent)
            double nextAng = ang + 0.2;
            Vector forward = new Vector(
                    Math.cos(ang) * r - Math.cos(nextAng) * r,
                    0.02,
                    Math.sin(ang) * r - Math.sin(nextAng) * r
            );
            if (forward.lengthSquared() < 0.0001) forward = new Vector(1, 0, 0);
            else forward.normalize();

            Location at = new Location(world, x, y, z);
            at.setDirection(forward);
            dragon.teleport(at);
            if (tick[0] % 16 == 0) {
                try {
                    dragon.setPhase(EnderDragon.Phase.CIRCLING);
                } catch (Throwable ignored) {}
            }

            // ปล่อยลูกไฟลงแมพ
            if (tick[0] % 10 == 0) {
                Location drop = at.clone().add(
                        (random.nextDouble() - 0.5) * 2.5,
                        -2.0,
                        (random.nextDouble() - 0.5) * 2.5);
                try {
                    SmallFireball ball = world.spawn(drop, SmallFireball.class);
                    ball.setDirection(new Vector(
                            (random.nextDouble() - 0.5) * 0.12,
                            -0.95,
                            (random.nextDouble() - 0.5) * 0.12));
                    ball.setYield(0f);
                    ball.setIsIncendiary(false);
                    ball.setShooter(null);
                    animEntities.add(ball);
                } catch (Throwable ignored) {}
                world.spawnParticle(org.bukkit.Particle.FLAME, drop, 12, 0.3, 0.3, 0.3, 0.02);
                world.playSound(drop, Sound.ENTITY_BLAZE_SHOOT, 0.45f, 0.9f);
            }
            if (tick[0] % 20 == 0) {
                world.playSound(at, Sound.ENTITY_ENDER_DRAGON_FLAP, 0.35f, 1.15f);
            }

            if (tick[0] == 110) {
                playAll(Sound.ENTITY_GENERIC_EXPLODE, 1.0f);
                arena.resetBedrockMap(world);
                fillCheckCooldown = 0;
                Location boom = new Location(world, cx + 0.5, floorY + 3, cz + 0.5);
                world.spawnParticle(org.bukkit.Particle.EXPLOSION, boom, 3, 1.5, 1.0, 1.5, 0);
                world.spawnParticle(org.bukkit.Particle.FLAME, boom, 50, 2.0, 1.5, 2.0, 0.08);
                broadcastTitle("§c§lว๊ายลบวิน!", "", 5, 35, 8);
            }
            if (tick[0] >= duration) {
                arena.resetBedrockMap(world);
                fillCheckCooldown = 0;
                broadcastTitle("§c§lว๊ายลบวิน!", "", 5, 28, 8);
                playAll(Sound.ENTITY_GENERIC_EXPLODE, 0.8f);
                stopAnim();
            }
        }, 1L, 1L);
    }

    /** บวกวิน — ชาวบ้านราชายักษ์สูงกว่าชั้น 9 เดินยาว ~10 วินาที */
    public void playPlusWinAnim() {
        stopAnim();
        ArenaState state = plugin.getArenaState();
        World world = state.getWorld();
        if (world == null) return;
        ArenaBuilder arena = plugin.getArenaBuilder();
        int cx = state.getCenterX();
        int cz = state.getCenterZ();
        int floorY = state.getFloorY();
        int height = Math.max(9, state.getLayerHeight());
        int level = Math.max(2, arena.getCurrentExpandLevel());

        broadcastTitle("§a§lเย้บวกวิน!", "§6ราชาช่วยต่อ", 5, 40, 10);
        playAll(Sound.ENTITY_PLAYER_LEVELUP, 1.15f);
        playAll(Sound.ENTITY_VILLAGER_YES, 1.1f);

        final double startX = cx - level - 14.0;
        final double endX = cx + level + 22.0;
        Location start = new Location(world, startX, floorY + 1, cz + 0.5, -90f, 0f);
        Villager king = (Villager) world.spawnEntity(start, EntityType.VILLAGER);
        king.setCustomName("§6§l♔ ราชาบวกวิน");
        king.setCustomNameVisible(true);
        king.setInvulnerable(true);
        king.setSilent(true);
        king.setCollidable(false);
        king.setAdult();
        try {
            king.setProfession(Villager.Profession.NITWIT);
            king.setVillagerLevel(5);
            king.setAI(false);
        } catch (Throwable ignored) {}
        try {
            EntityEquipment eq = king.getEquipment();
            if (eq != null) {
                eq.setHelmet(new ItemStack(Material.GOLDEN_HELMET));
                eq.setChestplate(new ItemStack(Material.GOLDEN_CHESTPLATE));
                eq.setLeggings(new ItemStack(Material.GOLDEN_LEGGINGS));
                eq.setBoots(new ItemStack(Material.GOLDEN_BOOTS));
                eq.setItemInMainHand(new ItemStack(Material.GOLDEN_SWORD));
                eq.setHelmetDropChance(0f);
                eq.setChestplateDropChance(0f);
                eq.setLeggingsDropChance(0f);
                eq.setBootsDropChance(0f);
                eq.setItemInMainHandDropChance(0f);
            }
        } catch (Throwable ignored) {}
        // สูงเลยชั้น 9: ชาวบ้านสูง ~1.95 บล็อก → สเกล ~6.5 ≈ สูง ~12.5 บล็อก
        double giantScale = Math.max(6.5, (height + 3) / 1.95);
        try {
            var scale = king.getAttribute(org.bukkit.attribute.Attribute.GENERIC_SCALE);
            if (scale != null) scale.setBaseValue(giantScale);
        } catch (Throwable ignored) {}
        animEntities.add(king);

        final int[] tick = {0};
        final int duration = 200; // 10 วินาที
        final double particleY = Math.min(height + 1.5, giantScale * 1.2);
        animTask = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            tick[0]++;
            if (!king.isValid()) {
                stopAnim();
                return;
            }
            double t = Math.min(1.0, tick[0] / (double) duration);
            double x = startX + (endX - startX) * t;
            double bob = Math.abs(Math.sin(tick[0] * 0.28)) * 0.25;
            Location at = new Location(world, x, floorY + 1 + bob, cz + 0.5);
            at.setYaw(-90f);
            at.setPitch(0f);
            king.teleport(at);
            world.spawnParticle(org.bukkit.Particle.HAPPY_VILLAGER, at.clone().add(0, particleY, 0), 14, 1.2, 1.8, 1.2, 0);
            world.spawnParticle(org.bukkit.Particle.END_ROD, at.clone().add(0, particleY + 1.5, 0), 4, 0.4, 0.5, 0.4, 0.01);
            if (tick[0] % 10 == 0) {
                world.playSound(at, Sound.ENTITY_VILLAGER_AMBIENT, 0.45f, 0.7f);
            }

            if (tick[0] == 80) {
                // ไม่ suppress — ของขวัญบวกวินนับทันทีแล้ว และเมื่อถอยหลังครบชนะจะ +1 อีกครั้ง
                arena.fillAllPlayInstant(world);
                fillCheckCooldown = 0;
                playAll(Sound.BLOCK_NOTE_BLOCK_CHIME, 1.35f);
                playAll(Sound.ENTITY_PLAYER_LEVELUP, 1.25f);
                broadcastTitle("§a§lเย้บวกวิน!", "§fเต็มแล้ว!", 5, 35, 8);
            }
            if (tick[0] >= duration) {
                if (!arena.isPlayVolumeFull()) arena.fillAllPlayInstant(world);
                fillCheckCooldown = 0;
                Location poof = king.getLocation();
                world.spawnParticle(org.bukkit.Particle.CLOUD, poof.clone().add(0, particleY * 0.5, 0), 50, 1.4, 2.2, 1.4, 0.03);
                world.playSound(poof, Sound.ENTITY_ENDERMAN_TELEPORT, 0.7f, 1.2f);
                stopAnim();
            }
        }, 1L, 1L);
    }

    /** พลุเหนือแมพ + อนุภาค — มองเห็นชัด */
    private void spawnArenaFireworks() {
        ArenaState state = plugin.getArenaState();
        World world = state.getWorld();
        if (world == null) return;
        int cx = state.getCenterX();
        int cz = state.getCenterZ();
        int floorY = state.getFloorY();
        int height = state.getLayerHeight();
        int skyY = floorY + height + 4;
        int level = Math.max(2, plugin.getArenaBuilder().getCurrentExpandLevel());
        int count = 12;
        for (int i = 0; i < count; i++) {
            double angle = (Math.PI * 2 * i) / count;
            double r = Math.max(1.5, Math.min(level, 8) * 0.7);
            Location at = new Location(world,
                    cx + 0.5 + Math.cos(angle) * r,
                    skyY + (i % 3),
                    cz + 0.5 + Math.sin(angle) * r);
            world.spawnParticle(org.bukkit.Particle.FIREWORK, at, 40, 0.6, 0.8, 0.6, 0.08);
            world.spawnParticle(org.bukkit.Particle.FLASH, at, 1, 0, 0, 0, 0);
            Firework fw = (Firework) world.spawnEntity(at, EntityType.FIREWORK_ROCKET);
            FireworkMeta meta = fw.getFireworkMeta();
            meta.setPower(1);
            meta.addEffect(FireworkEffect.builder()
                    .with(i % 3 == 0 ? FireworkEffect.Type.BALL_LARGE
                            : (i % 3 == 1 ? FireworkEffect.Type.BURST : FireworkEffect.Type.STAR))
                    .withColor(Color.LIME, Color.AQUA, Color.YELLOW, Color.FUCHSIA, Color.ORANGE, Color.RED)
                    .withFade(Color.WHITE)
                    .trail(true)
                    .flicker(true)
                    .build());
            fw.setFireworkMeta(meta);
            fw.setVelocity(new Vector(
                    (random.nextDouble() - 0.5) * 0.15,
                    0.35 + random.nextDouble() * 0.25,
                    (random.nextDouble() - 0.5) * 0.15));
            final Firework rocket = fw;
            Bukkit.getScheduler().runTaskLater(plugin, () -> {
                if (rocket.isValid()) {
                    Location boom = rocket.getLocation();
                    world.spawnParticle(org.bukkit.Particle.FIREWORK, boom, 80, 1.2, 1.2, 1.2, 0.12);
                    world.spawnParticle(org.bukkit.Particle.FLASH, boom, 2, 0.2, 0.2, 0.2, 0);
                    rocket.detonate();
                }
            }, 8L + (i % 5) * 3L);
        }
        Location center = new Location(world, cx + 0.5, skyY + 2, cz + 0.5);
        world.playSound(center, Sound.ENTITY_FIREWORK_ROCKET_LAUNCH, 1.6f, 1f);
        world.playSound(center, Sound.ENTITY_FIREWORK_ROCKET_BLAST, 1.4f, 1f);
        world.playSound(center, Sound.ENTITY_FIREWORK_ROCKET_TWINKLE, 1.2f, 1f);
    }

    private void tickCages() {
        if (cages.isEmpty()) return;
        for (UUID id : new ArrayList<>(cages.keySet())) {
            GlassCage cage = cages.get(id);
            if (cage == null) continue;
            cage.ticksLeft--;
            if (cage.ticksLeft <= 0 || Bukkit.getPlayer(id) == null) releaseGlassCage(id);
        }
    }

    private void broadcastTitle(String title, String sub, int fadeIn, int stay, int fadeOut) {
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!isBoxPlayer(p)) continue;
            p.sendTitle(title, sub == null ? "" : sub, fadeIn, stay, fadeOut);
        }
    }

    private void playAll(Sound sound, float pitch) {
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (!isBoxPlayer(p)) continue;
            p.playSound(p.getLocation(), sound, 1f, pitch);
        }
    }

    /** Box Control เท่านั้น — กันเสียง/คิท/วางบล็อคเล็ดเข้า Farm/Fish/Tower */
    private boolean isBoxPlayer(Player player) {
        if (player == null) return false;
        if (plugin.isFarmMode() || FarmBuilder.isFarmWorld(player.getWorld())) return false;
        if (plugin.isFishMode() || FishPierBuilder.isFishWorld(player.getWorld())) return false;
        if (plugin.isTowerMode() || TowerCastleBuilder.isTowerWorld(player.getWorld())) return false;
        return true;
    }

    private boolean isBoxWorld(World world) {
        if (world == null) return false;
        if (plugin.isFarmMode() || FarmBuilder.isFarmWorld(world)) return false;
        if (plugin.isFishMode() || FishPierBuilder.isFishWorld(world)) return false;
        if (plugin.isTowerMode() || TowerCastleBuilder.isTowerWorld(world)) return false;
        return true;
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onAnimDamage(EntityDamageByEntityEvent e) {
        if (animEntities.contains(e.getDamager()) || animEntities.contains(e.getEntity())) {
            e.setCancelled(true);
            return;
        }
        if (e.getEntity() instanceof Player && (e.getDamager() instanceof EnderDragon || e.getDamager() instanceof Villager)) {
            e.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onExplosionDamage(EntityDamageEvent e) {
        if (!(e.getEntity() instanceof Player player)) return;
        EntityDamageEvent.DamageCause cause = e.getCause();
        // ไม่เจ็บ / ไม่ติดไฟจากระเบิด ลาวา ไฟ
        if (cause == EntityDamageEvent.DamageCause.ENTITY_EXPLOSION
                || cause == EntityDamageEvent.DamageCause.BLOCK_EXPLOSION
                || cause == EntityDamageEvent.DamageCause.FIRE
                || cause == EntityDamageEvent.DamageCause.FIRE_TICK
                || cause == EntityDamageEvent.DamageCause.LAVA
                || cause == EntityDamageEvent.DamageCause.HOT_FLOOR) {
            e.setCancelled(true);
            player.setFireTicks(0);
            if (cause == EntityDamageEvent.DamageCause.ENTITY_EXPLOSION
                    || cause == EntityDamageEvent.DamageCause.BLOCK_EXPLOSION) {
                Vector v = player.getVelocity().clone();
                v.setY(Math.max(v.getY(), 0) + 1.15);
                player.setVelocity(v);
                player.setFallDistance(0f);
            }
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onExplode(EntityExplodeEvent e) {
        // พลุ / ลูกไฟอนิเมชั่น — ไม่ทำลายบล็อกแมพ
        if (e.getEntity() instanceof Firework || e.getEntity() instanceof SmallFireball
                || animEntities.contains(e.getEntity())) {
            e.blockList().clear();
            e.setYield(0f);
            return;
        }
        ArenaBuilder arena = plugin.getArenaBuilder();
        boolean brokeFill = false;
        List<Block> toBreak = new ArrayList<>();
        for (Block b : new ArrayList<>(e.blockList())) {
            if (isCageGlass(b)) continue;
            if (arena.isDestructiblePlayBlock(b.getX(), b.getY(), b.getZ())) {
                toBreak.add(b);
                brokeFill = true;
            }
        }
        e.blockList().clear();
        e.setYield(0f);
        for (Block b : toBreak) {
            b.setType(Material.AIR, false);
            arena.settleColumn(b.getWorld(), b.getX(), b.getZ());
        }
        if (brokeFill && winActive && winLockoutTicks <= 0) {
            Bukkit.getScheduler().runTask(plugin, () -> {
                if (winActive && winLockoutTicks <= 0 && !arena.isPlayVolumeFull()) {
                    cancelWinCountdown("พัง");
                }
            });
        }
        fillCheckCooldown = 0;
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onPlace(BlockPlaceEvent e) {
        fillCheckCooldown = 0;
        Player player = e.getPlayer();
        if (!isBoxPlayer(player)) return;
        if (plugin.isAdminDecorateMode(player)) {
            restoreInfiniteKit(player);
            return;
        }
        Block block = e.getBlockPlaced();
        Material hand = e.getItemInHand().getType();
        if (hand != Material.AMETHYST_BLOCK && block.getType() != Material.AMETHYST_BLOCK) {
            restoreInfiniteKit(player);
            return;
        }
        ArenaBuilder arena = plugin.getArenaBuilder();
        if (!arena.isInPlayArea(block.getX(), block.getZ())) {
            e.setCancelled(true);
            restoreInfiniteKit(player);
            return;
        }
        int floorY = plugin.getArenaState().getFloorY();
        int height = plugin.getArenaState().getLayerHeight();
        int y = block.getY();
        if (y <= floorY || y > floorY + height) {
            e.setCancelled(true);
            restoreInfiniteKit(player);
            return;
        }
        // ยกเลิกวางดิบ — วางจากล่าง / หล่นลงช่องว่างของคอลัมน์
        e.setCancelled(true);
        final int bx = block.getX();
        final int by = block.getY();
        final int bz = block.getZ();
        Bukkit.getScheduler().runTask(plugin, () -> {
            arena.placeBuildBlockWithGravity(block.getWorld(), bx, by, bz);
            player.playSound(player.getLocation(), Sound.BLOCK_AMETHYST_BLOCK_PLACE, 0.9f, 1.1f);
            restoreInfiniteKit(player);
            fillCheckCooldown = 0;
        });
    }

    /** ทุบแบบครีเอทีฟ — กดแล้วหายทันที ไม่ต้องกดค้าง */
    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onBlockDamage(BlockDamageEvent e) {
        if (!isBoxPlayer(e.getPlayer())) return;
        Block block = e.getBlock();
        if (isCageGlass(block) || block.getType() == Material.BEDROCK) {
            e.setCancelled(true);
            return;
        }
        ArenaBuilder arena = plugin.getArenaBuilder();
        if (arena.isInPlayArea(block.getX(), block.getZ())
                || arena.isInArenaFootprint(block.getX(), block.getZ())
                || plugin.isAdminDecorateMode(e.getPlayer())) {
            e.setInstaBreak(true);
        }
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onBreak(BlockBreakEvent e) {
        if (!isBoxPlayer(e.getPlayer())) return;
        fillCheckCooldown = 0;
        Block block = e.getBlock();
        // ห้องกระจก / Bedrock — ยกเลิกเงียบๆ ไม่แจ้งเตือน
        if (isCageGlass(block) || block.getType() == Material.BEDROCK) {
            e.setCancelled(true);
            return;
        }
        ArenaBuilder arena = plugin.getArenaBuilder();
        if (arena.isInPlayArea(block.getX(), block.getZ())
                || arena.isInArenaFootprint(block.getX(), block.getZ())
                || plugin.isAdminDecorateMode(e.getPlayer())) {
            e.setDropItems(false);
            e.setExpToDrop(0);
            e.getPlayer().playSound(block.getLocation(), Sound.BLOCK_STONE_BREAK, 0.7f, 1.15f);
            // หลังทุบ — ให้บล็อกด้านบนหล่นลงมา
            final int bx = block.getX();
            final int bz = block.getZ();
            final World bw = block.getWorld();
            Bukkit.getScheduler().runTask(plugin, () -> arena.settleColumn(bw, bx, bz));
            return;
        }
        if (!plugin.isAdminDecorateMode(e.getPlayer())) {
            e.setCancelled(true);
        } else {
            e.setDropItems(false);
            e.setExpToDrop(0);
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onItemSpawn(org.bukkit.event.entity.ItemSpawnEvent e) {
        // กันไอเทมดรอปจากระเบิด/ทุบในแมพ
        Material t = e.getEntity().getItemStack().getType();
        if (t == Material.AMETHYST_BLOCK || t == Material.IRON_BLOCK || t == Material.GOLD_BLOCK
                || t == Material.DIAMOND_BLOCK || t == Material.COBBLESTONE
                || t == Material.BLUE_STAINED_GLASS || t == Material.GLASS) {
            Location loc = e.getLocation();
            if (plugin.getArenaBuilder().isInArenaFootprint(loc.getBlockX(), loc.getBlockZ())) {
                e.setCancelled(true);
            }
        }
    }

    @EventHandler
    public void onSnowballLaunch(ProjectileLaunchEvent e) {
        if (!(e.getEntity() instanceof Snowball snowball)) return;
        if (!(e.getEntity().getShooter() instanceof Player player)) return;
        if (!isBoxPlayer(player)) return;
        snowball.setMetadata("tokcontrol_build", new org.bukkit.metadata.FixedMetadataValue(plugin, true));
        Bukkit.getScheduler().runTask(plugin, () -> restoreInfiniteKit(player));
    }

    @EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = false)
    public void onSnowballHit(ProjectileHitEvent e) {
        if (!(e.getEntity() instanceof Snowball)) return;
        if (!(e.getEntity().getShooter() instanceof Player player)) return;
        if (!isBoxPlayer(player)) return;
        if (plugin.isAdminDecorateMode(player)) return;

        ArenaBuilder arena = plugin.getArenaBuilder();
        ArenaState state = plugin.getArenaState();
        World world = e.getEntity().getWorld();

        int x;
        int z;
        Block hit = e.getHitBlock();
        if (hit != null) {
            org.bukkit.block.BlockFace face = e.getHitBlockFace() != null
                    ? e.getHitBlockFace() : org.bukkit.block.BlockFace.UP;
            if (face == org.bukkit.block.BlockFace.UP) {
                x = hit.getX();
                z = hit.getZ();
            } else {
                Block rel = hit.getRelative(face);
                x = rel.getX();
                z = rel.getZ();
            }
        } else {
            Location l = e.getEntity().getLocation();
            x = l.getBlockX();
            z = l.getBlockZ();
        }

        if (!arena.isInPlayArea(x, z)) {
            int cx = state.getCenterX();
            int cz = state.getCenterZ();
            int level = arena.getCurrentExpandLevel();
            x = Math.max(cx - level, Math.min(cx + level, x));
            z = Math.max(cz - level, Math.min(cz + level, z));
        }
        if (!arena.isInPlayArea(x, z)) {
            restoreInfiniteKit(player);
            return;
        }

        // จากล่างขึ้นแนวตั้ง 3 บล็อก
        int placed = arena.placeInColumnFromBottom(world, x, z, 3);
        fillCheckCooldown = 0;
        if (placed > 0) {
            player.playSound(player.getLocation(), Sound.BLOCK_AMETHYST_BLOCK_PLACE, 1f, 1.2f);
            player.playSound(player.getLocation(), Sound.ENTITY_SNOWBALL_THROW, 0.5f, 1.4f);
        }
        restoreInfiniteKit(player);
    }

    @EventHandler
    public void onDrop(PlayerDropItemEvent e) {
        if (!isBoxPlayer(e.getPlayer())) return;
        Material t = e.getItemDrop().getItemStack().getType();
        if (t == Material.AMETHYST_BLOCK || t == Material.SNOWBALL) {
            e.setCancelled(true);
            restoreInfiniteKit(e.getPlayer());
        }
    }

    private void restoreInfiniteKit(Player player) {
        if (player == null || !player.isOnline()) return;
        if (plugin.isFishMode() || FishPierBuilder.isFishWorld(player.getWorld())) {
            if (plugin.getFishPierBuilder() != null) {
                plugin.getFishPierBuilder().giveUnbreakableRod(player);
            }
            return;
        }
        if (plugin.isFarmMode() || FarmBuilder.isFarmWorld(player.getWorld())) {
            if (plugin.getFarmControlService() != null) {
                plugin.getFarmControlService().giveFarmKit(player);
            }
            return;
        }
        if (plugin.isTowerMode() || TowerCastleBuilder.isTowerWorld(player.getWorld())) return;
        if (plugin.isAdminDecorateMode(player)) return;
        player.getInventory().setItem(0, new ItemStack(Material.AMETHYST_BLOCK, 1));
        player.getInventory().setItem(1, new ItemStack(Material.SNOWBALL, 1));
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent e) {
        releaseGlassCage(e.getPlayer().getUniqueId());
    }
}
