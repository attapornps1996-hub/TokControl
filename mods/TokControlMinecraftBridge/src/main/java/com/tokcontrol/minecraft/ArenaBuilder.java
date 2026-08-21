package com.tokcontrol.minecraft;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.entity.Cow;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Villager;

import java.util.ArrayList;

public final class ArenaBuilder {

    private final TokControlPlugin plugin;
    private final ArenaState state;
    private int currentExpandLevel = 4;
    private static final int DECOR_PAD = 48;
    /** ความกว้างบ่อน้ำรอบกำแพงแมพ (บล็อก) */
    public static final int POND_WIDTH = 7;

    public ArenaBuilder(TokControlPlugin plugin, ArenaState state) {
        this.plugin = plugin;
        this.state = state;
    }

    public ArenaState getState() {
        return state;
    }

    /**
     * พื้นแมพต้องอยู่ระดับ Superflat จริง — ห้ามใช้ getHighestBlockYAt
     * และห้ามสแกนหาดินลอย/เพดานเศษฟาร์ม (เคยทำให้แมพถูกฝังมืด / ทริกเกอร์พัง)
     */
    public int resolveFloorY(World world) {
        int configured = plugin.getConfig().getInt("arena.floor-y", -1);
        // -1 = auto; ค่าอื่น (รวม 0 และติดลบ) ใช้ตามที่ตั้ง
        if (configured != -1) return configured;
        // Superflat: bedrock + dirt×3 + grass → หญ้าที่ minHeight+4
        return FarmBuilder.resolveFlatFloorY(world);
    }

    public Material pathMaterial() {
        return parseMat(plugin.getConfig().getString("arena.path-block", "DIAMOND_BLOCK"), Material.DIAMOND_BLOCK);
    }

    public Material baseMaterial() {
        return parseMat(plugin.getConfig().getString("arena.base-block", "LIME_CONCRETE"), Material.LIME_CONCRETE);
    }

    public Material shellMaterial() {
        return parseMat(plugin.getConfig().getString("arena.shell-block", "BEDROCK"), Material.BEDROCK);
    }

    public Material wallMaterial() {
        return parseMat(plugin.getConfig().getString("arena.wall-block", "BLACK_CONCRETE"), Material.BLACK_CONCRETE);
    }

    public Location spawnLocation(World world) {
        return new Location(world, state.getCenterX() + 0.5, state.getFloorY() + 1.0, state.getCenterZ() + 0.5, 0, 0);
    }

    public Location finishLocation(World world) {
        return spawnLocation(world);
    }

    public int getCurrentExpandLevel() {
        return currentExpandLevel;
    }

    public void setCurrentExpandLevel(int level) {
        currentExpandLevel = clampLevel(level);
    }

    /** ขนาดพื้นที่เล่น: Lv0=1x1 แล้วขยายได้ไม่จำกัด */
    public int playSizeForLevel(int level) {
        return clampLevel(level) * 2 + 1;
    }

    /** Lv. สำหรับขนาด 9x9 */
    public int levelForPlaySize9() {
        return 4;
    }

    public boolean isInPlayArea(int x, int z) {
        int level = currentExpandLevel;
        return Math.abs(x - state.getCenterX()) <= level
                && Math.abs(z - state.getCenterZ()) <= level;
    }

    public boolean isInArenaFootprint(int x, int z) {
        int border = currentExpandLevel + 1;
        return Math.abs(x - state.getCenterX()) <= border
                && Math.abs(z - state.getCenterZ()) <= border;
    }

    /** บล็อกที่ TNT ทำลายได้ = เฉพาะของที่ต่อในพื้นที่เล่น (ไม่ใช่ Bedrock / นอกแมพ) */
    public boolean isDestructiblePlayBlock(int x, int y, int z) {
        if (state.getWorld() == null) return false;
        if (!isInPlayArea(x, z)) return false;
        int floorY = state.getFloorY();
        int height = state.getLayerHeight();
        if (y <= floorY || y > floorY + height) return false;
        Material m = state.getWorld().getBlockAt(x, y, z).getType();
        return m != Material.BEDROCK && m != Material.AIR && !m.isAir();
    }

    /**
     * ชั้นแสดงผลเมื่อต่อบล็อก (ความสูง 9):
     * 1–3 เหล็ก | 4–6 ทอง | 7–9 เพชร
     */
    public Material displayMaterialForRelativeY(int relativeY) {
        if (relativeY <= 3) return Material.IRON_BLOCK;
        if (relativeY <= 6) return Material.GOLD_BLOCK;
        return Material.DIAMOND_BLOCK;
    }

    public Material displayMaterialAt(int y) {
        int rel = y - state.getFloorY();
        if (rel < 1) rel = 1;
        if (rel > state.getLayerHeight()) rel = state.getLayerHeight();
        return displayMaterialForRelativeY(rel);
    }

    /** วางบล็อกต่อในแมพ แล้วแปลงเป็นเหล็ก/ทอง/เพชรตามชั้น */
    public boolean placeBuildBlock(World world, int x, int y, int z) {
        if (world == null || !isInPlayArea(x, z)) return false;
        int floorY = state.getFloorY();
        int height = state.getLayerHeight();
        if (y <= floorY || y > floorY + height) return false;
        if (world.getBlockAt(x, y, z).getType() == Material.BEDROCK) return false;
        set(world, x, y, z, displayMaterialAt(y));
        return true;
    }

    private boolean isPlayAir(Material m) {
        return m == null || m.isAir() || m == Material.CAVE_AIR || m == Material.VOID_AIR;
    }

    private boolean isBuildSolid(Material m) {
        return m != null && !isPlayAir(m) && m != Material.BEDROCK
                && m != Material.LAVA && m != Material.WATER
                && m != Material.BLUE_STAINED_GLASS && m != Material.GLASS;
    }

    /**
     * ดึงบล็อกในคอลัมน์ให้เรียงจากล่างขึ้นบน — ช่องว่างด้านล่างจะถูกเติม
     * คืนจำนวนบล็อกหลัง settle
     */
    public int settleColumn(World world, int x, int z) {
        if (world == null || !isInPlayArea(x, z)) return 0;
        int floorY = state.getFloorY();
        int maxY = floorY + state.getLayerHeight();
        int count = 0;
        for (int y = floorY + 1; y <= maxY; y++) {
            Material m = world.getBlockAt(x, y, z).getType();
            if (isBuildSolid(m)) count++;
        }
        for (int y = floorY + 1; y <= maxY; y++) {
            clear(world, x, y, z);
        }
        for (int i = 0; i < count; i++) {
            int y = floorY + 1 + i;
            set(world, x, y, z, displayMaterialAt(y));
        }
        return count;
    }

    public void settleAllColumns(World world) {
        if (world == null) return;
        int level = currentExpandLevel;
        int cx = state.getCenterX();
        int cz = state.getCenterZ();
        for (int x = cx - level; x <= cx + level; x++) {
            for (int z = cz - level; z <= cz + level; z++) {
                settleColumn(world, x, z);
            }
        }
    }

    /** วางจำนวนบล็อกในคอลัมน์จากล่างขึ้น (ช่องว่างล่างสุดก่อน) */
    public int placeInColumnFromBottom(World world, int x, int z, int count) {
        if (world == null || !isInPlayArea(x, z) || count <= 0) return 0;
        settleColumn(world, x, z);
        int floorY = state.getFloorY();
        int maxY = floorY + state.getLayerHeight();
        int placed = 0;
        for (int y = floorY + 1; y <= maxY && placed < count; y++) {
            if (isPlayAir(world.getBlockAt(x, y, z).getType())) {
                set(world, x, y, z, displayMaterialAt(y));
                placed++;
            }
        }
        return placed;
    }

    /** วางที่พิกัดแล้วให้ตกลงช่องว่างของคอลัมน์นั้น */
    public boolean placeBuildBlockWithGravity(World world, int x, int y, int z) {
        if (world == null || !isInPlayArea(x, z)) return false;
        int floorY = state.getFloorY();
        int maxY = floorY + state.getLayerHeight();
        if (y <= floorY || y > maxY) return false;
        if (world.getBlockAt(x, y, z).getType() == Material.BEDROCK) return false;
        // วางชั่วคราวที่จุดคลิก แล้ว settle ให้หล่นลงช่องว่าง
        if (isPlayAir(world.getBlockAt(x, y, z).getType())) {
            set(world, x, y, z, displayMaterialAt(y));
        } else {
            // ช่องตัน — หาช่องว่างล่างสุดใส่แทน
            return placeInColumnFromBottom(world, x, z, 1) > 0;
        }
        settleColumn(world, x, z);
        return true;
    }

    /** เติมเต็มทั้งแมพทันที */
    public int fillAllPlayInstant(World world) {
        if (world == null) return 0;
        int level = currentExpandLevel;
        int floorY = state.getFloorY();
        int height = state.getLayerHeight();
        int cx = state.getCenterX();
        int cz = state.getCenterZ();
        int placed = 0;
        for (int x = cx - level; x <= cx + level; x++) {
            for (int z = cz - level; z <= cz + level; z++) {
                for (int y = floorY + 1; y <= floorY + height; y++) {
                    Material m = world.getBlockAt(x, y, z).getType();
                    if (isPlayAir(m) || m == Material.LAVA) {
                        set(world, x, y, z, displayMaterialAt(y));
                        placed++;
                    }
                }
            }
        }
        return placed;
    }

    /** เติม 1 ชั้น (Y ต่ำสุดที่ยังไม่เต็ม) */
    public int fillOneLayer(World world) {
        if (world == null) return 0;
        int level = currentExpandLevel;
        int floorY = state.getFloorY();
        int height = state.getLayerHeight();
        int cx = state.getCenterX();
        int cz = state.getCenterZ();
        for (int rel = 1; rel <= height; rel++) {
            int y = floorY + rel;
            boolean anyEmpty = false;
            for (int x = cx - level; x <= cx + level && !anyEmpty; x++) {
                for (int z = cz - level; z <= cz + level; z++) {
                    if (isPlayAir(world.getBlockAt(x, y, z).getType())) {
                        anyEmpty = true;
                        break;
                    }
                }
            }
            if (!anyEmpty) continue;
            int placed = 0;
            for (int x = cx - level; x <= cx + level; x++) {
                for (int z = cz - level; z <= cz + level; z++) {
                    if (isPlayAir(world.getBlockAt(x, y, z).getType())) {
                        set(world, x, y, z, displayMaterialAt(y));
                        placed++;
                    }
                }
            }
            return placed;
        }
        return 0;
    }

    /** เติม 1 แถว (แนว Z) เต็มความสูง — จากแถวที่ยังว่าง */
    public int fillTenRows(World world) {
        return fillRows(world, 1);
    }

    public int fillRows(World world, int rowCount) {
        if (world == null) return 0;
        int level = currentExpandLevel;
        int floorY = state.getFloorY();
        int height = state.getLayerHeight();
        int cx = state.getCenterX();
        int cz = state.getCenterZ();
        int rowsDone = 0;
        int placed = 0;
        int want = Math.max(1, rowCount);
        for (int z = cz - level; z <= cz + level && rowsDone < want; z++) {
            boolean rowNeeds = false;
            for (int x = cx - level; x <= cx + level && !rowNeeds; x++) {
                for (int y = floorY + 1; y <= floorY + height; y++) {
                    if (isPlayAir(world.getBlockAt(x, y, z).getType())) {
                        rowNeeds = true;
                        break;
                    }
                }
            }
            if (!rowNeeds) continue;
            for (int x = cx - level; x <= cx + level; x++) {
                for (int y = floorY + 1; y <= floorY + height; y++) {
                    if (isPlayAir(world.getBlockAt(x, y, z).getType())) {
                        set(world, x, y, z, displayMaterialAt(y));
                        placed++;
                    }
                }
            }
            rowsDone++;
        }
        return placed;
    }

    public int countEmptyPlayBlocks() {
        World world = state.getWorld();
        if (world == null) return 0;
        int level = currentExpandLevel;
        int floorY = state.getFloorY();
        int height = state.getLayerHeight();
        int cx = state.getCenterX();
        int cz = state.getCenterZ();
        int empty = 0;
        for (int x = cx - level; x <= cx + level; x++) {
            for (int z = cz - level; z <= cz + level; z++) {
                for (int y = floorY + 1; y <= floorY + height; y++) {
                    if (world.getBlockAt(x, y, z).getType().isAir()) empty++;
                }
            }
        }
        return empty;
    }

    /** วางแนวตั้งจากล่างของคอลัมน์ขึ้นไป count บล็อก (gravity) */
    public int placeVerticalStackUp(World world, int x, int baseY, int z, int count) {
        return placeInColumnFromBottom(world, x, z, count);
    }

    public void buildArena(World world) {
        if (world.getEnvironment() != World.Environment.NORMAL) return;
        int level = plugin.getConfig().getInt("arena.expand-level", 4);
        int height = plugin.getConfig().getInt("arena.height", 9);
        Location center = new Location(world, 0, 0, 0);
        if (state.getWorld() != null) {
            center = new Location(world, state.getCenterX(), 0, state.getCenterZ());
        } else if (world.getSpawnLocation() != null) {
            center = world.getSpawnLocation();
        }
        buildBedrockMap(world, center, level, height, true);
    }

    /**
     * แมพขอบ Bedrock เปิดโล่งด้านบน — พื้น+กำแพงเป็น Bedrock ล้วน
     * รอบนอกคืนดิน/หญ้า | ขยายได้ไม่จำกัด | คืนบล็อกตกแต่งแอดมินหลังสร้าง
     */
    public void buildBedrockMap(World world, Location center, int level, int height, boolean teleportPlayers) {
        if (world == null || world.getEnvironment() != World.Environment.NORMAL) return;

        int prevLevel = currentExpandLevel;
        currentExpandLevel = clampLevel(level);
        int safeHeight = Math.max(3, Math.min(64, height));
        int cx;
        int cz;
        if (state.getWorld() != null) {
            cx = state.getCenterX();
            cz = state.getCenterZ();
        } else if (center != null) {
            cx = center.getBlockX();
            cz = center.getBlockZ();
        } else {
            cx = 0;
            cz = 0;
        }

        int floorY = resolveFloorY(world);
        int border = currentExpandLevel + 1;
        int prevBorder = prevLevel + 1;
        int playSize = playSizeForLevel(currentExpandLevel);
        // เคลียร์กว้างพอ — กันเศษแมพฟาร์มเก่าที่ค้างนอกวงบ่อ (หลังแยกเซิร์ฟ)
        int clearBorder = Math.max(Math.max(prevBorder, border) + POND_WIDTH + 4, 80);

        // เก็บตกแต่งรอบนอกก่อนเคลียร์ — กรองเศษฟาร์มออก · โลกว่างใช้ไฟล์ที่บันทึกไว้
        DecorationStore store = plugin.getDecorationStore();
        java.util.List<DecorationStore.SavedBlock> liveDecor = store.captureFromWorld(
                world, cx, cz, floorY, prevBorder, DECOR_PAD);
        liveDecor = DecorationStore.filterOutFarmLeftovers(liveDecor);
        java.util.List<DecorationStore.SavedBlock> toRestore;
        if (!liveDecor.isEmpty()) {
            toRestore = liveDecor;
        } else {
            toRestore = DecorationStore.filterOutFarmLeftovers(store.getCached());
        }
        // เลื่อนของนอกแมพให้ระยะห่างจากรั้ว/บ่อคงเดิมเมื่อขยายหรือย่อ
        int oldInner = prevBorder + POND_WIDTH;
        int newInner = border + POND_WIDTH;
        if (oldInner != newInner && toRestore != null && !toRestore.isEmpty()) {
            toRestore = DecorationStore.shiftOutwardWithFence(toRestore, oldInner, newInner);
            plugin.getLogger().info("Shifted Box decorations with fence delta="
                    + (newInner - oldInner) + " (" + oldInner + " → " + newInner + ")");
        }
        if (toRestore != null) {
            store.replaceCache(toRestore);
            store.saveToDisk();
        } else {
            toRestore = java.util.Collections.emptyList();
        }

        state.setWorld(world);
        state.setSize(playSize);
        state.setLayers(1);
        state.setLayerHeight(safeHeight);
        state.setFloorY(floorY);
        state.setCenter(cx, cz);
        state.clearCells();

        // เคลียร์ถึงเพดานโลก — รื้อเพดานดิน/กำแพงเศษเก่าที่บังแสงท้องฟ้า
        int clearTop = world.getMaxHeight() - 1;
        int clearBottom = Math.max(world.getMinHeight(), floorY - 3);
        clearFarmLeftoverEntities(world, cx, cz, clearBorder);
        clearBox(world, cx - clearBorder, cx + clearBorder, cz - clearBorder, cz + clearBorder, clearBottom, clearTop);

        buildOpenTopBedrockArena(world, cx, cz, floorY, safeHeight, border);
        clearPlayArea(world, cx, cz, floorY, safeHeight, currentExpandLevel);
        restoreSurroundingTerrain(world, cx, cz, floorY, border, 64);
        decoratePondAroundMap(world, cx, cz, floorY, border, POND_WIDTH);
        // ตกแต่งแอดมินนอกวงบ่อน้ำ (ไม่ทับธีมบ่อ)
        store.paste(world, cx, cz, floorY, border + POND_WIDTH, toRestore);
        // หลัง paste — เปิดช่องฟ้าเหนือพื้นที่เล่น+กำแพงอีกครั้ง (กันเศษทับ/บังแสง)
        openSkyAboveArena(world, cx, cz, floorY, border, safeHeight);
        applyBrightWorld(world);

        world.setSpawnLocation(spawnLocation(world));
        if (teleportPlayers) {
            teleportAllToStart(world);
        } else {
            for (Player player : world.getPlayers()) {
                plugin.enablePlayerFlight(player);
            }
        }

        plugin.getConfig().set("arena.expand-level", currentExpandLevel);
        plugin.getConfig().set("arena.height", safeHeight);
        plugin.saveConfig();
        plugin.getLogger().info("Built open-top bedrock map level=" + currentExpandLevel
                + " play=" + playSize + "x" + playSize
                + " y=" + floorY + " wallHeight=" + safeHeight
                + " decor=" + (toRestore == null ? 0 : toRestore.size())
                + " teleport=" + teleportPlayers);
    }

    /** บันทึกแมพตกแต่งรอบนอกตอนนี้ (เรียกจากแอดมิน) */
    public int saveDecorationsNow() {
        World world = state.getWorld();
        if (world == null) return 0;
        int border = currentExpandLevel + 1;
        return plugin.getDecorationStore().snapshotAndSave(
                world, state.getCenterX(), state.getCenterZ(), state.getFloorY(), border, DECOR_PAD);
    }

    public int expandBedrockMap(World world, Location ignoredCenter) {
        int height = plugin.getConfig().getInt("arena.height", 9);
        return resizeBedrockMapPreserve(world, currentExpandLevel + 1, height);
    }

    public int shrinkBedrockMap(World world, Location ignoredCenter) {
        int height = plugin.getConfig().getInt("arena.height", 9);
        return resizeBedrockMapPreserve(world, Math.max(0, currentExpandLevel - 1), height);
    }

    /**
     * ขยาย/ย่อแมพโดยเก็บบล็อกที่ต่อไว้แล้ว (ในพื้นที่เล่นใหม่)
     */
    public int resizeBedrockMapPreserve(World world, int newLevel, int height) {
        if (world == null) return currentExpandLevel;
        int safeHeight = Math.max(3, Math.min(64, height > 0 ? height : state.getLayerHeight()));
        int floorY = state.getFloorY() > 0 || state.getWorld() != null ? state.getFloorY() : resolveFloorY(world);
        int cx = state.getCenterX();
        int cz = state.getCenterZ();
        int oldLevel = currentExpandLevel;

        // บันทึกบล็อกที่ต่อไว้ก่อนเคลียร์
        java.util.List<int[]> saved = new java.util.ArrayList<>();
        java.util.List<Material> savedMat = new java.util.ArrayList<>();
        for (int x = cx - oldLevel; x <= cx + oldLevel; x++) {
            for (int z = cz - oldLevel; z <= cz + oldLevel; z++) {
                for (int y = floorY + 1; y <= floorY + safeHeight; y++) {
                    Material m = world.getBlockAt(x, y, z).getType();
                    if (!m.isAir() && m != Material.CAVE_AIR && m != Material.VOID_AIR && m != Material.BEDROCK
                            && m != Material.LAVA && m != Material.WATER) {
                        saved.add(new int[]{x, y, z});
                        savedMat.add(m);
                    }
                }
            }
        }

        buildBedrockMap(world, null, newLevel, safeHeight, false);

        // คืนบล็อกที่ยังอยู่ในพื้นที่เล่นใหม่ แล้ว settle ให้เรียงจากล่าง
        for (int i = 0; i < saved.size(); i++) {
            int[] p = saved.get(i);
            if (!isInPlayArea(p[0], p[2])) continue;
            if (p[1] <= state.getFloorY() || p[1] > state.getFloorY() + state.getLayerHeight()) continue;
            set(world, p[0], p[1], p[2], displayMaterialAt(p[1]));
        }
        settleAllColumns(world);
        return currentExpandLevel;
    }

    /** รีเซ็ตเป็น 9x9 (Lv.4) — ไม่วาร์ปผู้เล่น (ล้างบล็อก) */
    public int resetToNineByNine(World world) {
        int height = plugin.getConfig().getInt("arena.height", 9);
        buildBedrockMap(world, null, levelForPlaySize9(), height, false);
        return currentExpandLevel;
    }

    public int resetBedrockMap(World world) {
        if (world == null) return currentExpandLevel;
        int height = plugin.getConfig().getInt("arena.height", 9);
        int border = currentExpandLevel + 1;
        clearPlayArea(world, state.getCenterX(), state.getCenterZ(), state.getFloorY(), height, currentExpandLevel);
        openSkyAboveArena(world, state.getCenterX(), state.getCenterZ(), state.getFloorY(), border, height);
        applyBrightWorld(world);
        return currentExpandLevel;
    }

    /**
     * พื้นที่เล่นเต็มทุกช่อง+ทุกชั้นหรือยัง (เหล็ก/ทอง/เพชร/คริสตัล/บล็อกทึบอื่น)
     */
    public boolean isCrystalFillComplete() {
        return isPlayVolumeFull();
    }

    public boolean isPlayVolumeFull() {
        World world = state.getWorld();
        if (world == null) return false;
        int level = currentExpandLevel;
        int floorY = state.getFloorY();
        int height = state.getLayerHeight();
        int cx = state.getCenterX();
        int cz = state.getCenterZ();
        for (int x = cx - level; x <= cx + level; x++) {
            for (int z = cz - level; z <= cz + level; z++) {
                for (int y = floorY + 1; y <= floorY + height; y++) {
                    Material m = world.getBlockAt(x, y, z).getType();
                    if (m.isAir() || m == Material.CAVE_AIR || m == Material.VOID_AIR || m == Material.BEDROCK) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    private int clampLevel(int level) {
        // ไม่จำกัดขนาดแมพ — ขยายได้เรื่อยๆ
        return Math.max(0, level);
    }

    private void clearBox(World world, int minX, int maxX, int minZ, int maxZ, int minY, int maxY) {
        for (int x = minX; x <= maxX; x++) {
            for (int z = minZ; z <= maxZ; z++) {
                for (int y = minY; y <= maxY; y++) {
                    clear(world, x, y, z);
                }
            }
        }
    }

    /** Purge farm cows/villagers left behind when rebuilding Box map in a shared/leftover world. */
    private void clearFarmLeftoverEntities(World world, int cx, int cz, int radius) {
        if (world == null) return;
        int r2 = radius * radius;
        int removed = 0;
        for (Entity e : new ArrayList<>(world.getEntities())) {
            if (e == null || e instanceof Player) continue;
            Location loc = e.getLocation();
            int dx = loc.getBlockX() - cx;
            int dz = loc.getBlockZ() - cz;
            if (dx * dx + dz * dz > r2) continue;
            boolean drop = false;
            for (String tag : e.getScoreboardTags()) {
                if (tag != null && tag.startsWith("tc_farm")) {
                    drop = true;
                    break;
                }
            }
            if (!drop && (e instanceof Cow || e instanceof Villager)) drop = true;
            if (drop) {
                try {
                    e.remove();
                    removed++;
                } catch (Exception ignored) {}
            }
        }
        if (removed > 0) {
            plugin.getLogger().info("Cleared " + removed + " farm leftover entities from Box map area");
        }
    }

    /** พื้น + กำแพง Bedrock ล้วน — ไม่มีหลังคา */
    private void buildOpenTopBedrockArena(World world, int cx, int cz, int floorY, int height, int border) {
        for (int x = cx - border; x <= cx + border; x++) {
            for (int z = cz - border; z <= cz + border; z++) {
                set(world, x, floorY, z, Material.BEDROCK);
                boolean wall = x == cx - border || x == cx + border || z == cz - border || z == cz + border;
                if (!wall) continue;
                for (int y = 1; y <= height; y++) {
                    set(world, x, floorY + y, z, Material.BEDROCK);
                }
            }
        }
    }

    private void clearPlayArea(World world, int cx, int cz, int floorY, int height, int level) {
        int skyTop = world.getMaxHeight() - 1;
        for (int x = cx - level; x <= cx + level; x++) {
            for (int z = cz - level; z <= cz + level; z++) {
                set(world, x, floorY, z, Material.BEDROCK);
                // เปิดช่องฟ้าเต็มคอลัมน์ — แสงท้องฟ้าส่องถึงพื้นเล่น
                for (int y = floorY + 1; y <= skyTop; y++) {
                    clear(world, x, y, z);
                }
                state.addZone(x, z, 0);
            }
        }
    }

    /**
     * เปิดช่องฟ้าเหนือพื้นที่เล่น + กำแพง (หลัง paste ตกแต่ง)
     * คงกำแพง Bedrock สูงตาม height ไว้ — ไม่มีหลังคา
     */
    private void openSkyAboveArena(World world, int cx, int cz, int floorY, int border, int height) {
        int skyTop = world.getMaxHeight() - 1;
        for (int x = cx - border; x <= cx + border; x++) {
            for (int z = cz - border; z <= cz + border; z++) {
                boolean wall = x == cx - border || x == cx + border || z == cz - border || z == cz + border;
                for (int y = floorY + 1; y <= skyTop; y++) {
                    clear(world, x, y, z);
                }
                if (wall) {
                    for (int y = 1; y <= height; y++) {
                        set(world, x, floorY + y, z, Material.BEDROCK);
                    }
                }
                set(world, x, floorY, z, Material.BEDROCK);
            }
        }
        // เติม zoneCells ของพื้นที่เล่นใหม่หลังเคลียร์
        int level = Math.max(0, border - 1);
        for (int x = cx - level; x <= cx + level; x++) {
            for (int z = cz - level; z <= cz + level; z++) {
                state.addZone(x, z, 0);
            }
        }
    }

    /** กลางวันตลอด — ไม่มืด */
    public void applyBrightWorld(World world) {
        if (world == null) return;
        world.setTime(6000L);
        world.setStorm(false);
        world.setThundering(false);
        world.setWeatherDuration(0);
        world.setClearWeatherDuration(20 * 60 * 60);
        try {
            world.setGameRule(org.bukkit.GameRule.DO_DAYLIGHT_CYCLE, false);
            world.setGameRule(org.bukkit.GameRule.DO_WEATHER_CYCLE, false);
        } catch (Throwable ignored) {}
    }

    /**
     * ตกแต่งรอบแมพ — ปิดใช้แล้ว (เก็บไว้ไม่เรียก)
     */
    @SuppressWarnings("unused")
    private void decorateAroundMap(World world, int cx, int cz, int floorY, int border) {
        int fenceR = border + 1;
        int yardR = border + 4;
        // รั้วรอบแมพ
        for (int x = cx - fenceR; x <= cx + fenceR; x++) {
            for (int z = cz - fenceR; z <= cz + fenceR; z++) {
                boolean edge = x == cx - fenceR || x == cx + fenceR || z == cz - fenceR || z == cz + fenceR;
                if (!edge) continue;
                // ช่องประตูกลางแต่ละด้าน
                boolean gate = (x == cx && (z == cz - fenceR || z == cz + fenceR))
                        || (z == cz && (x == cx - fenceR || x == cx + fenceR));
                if (gate) {
                    set(world, x, floorY, z, Material.DIRT_PATH);
                    clear(world, x, floorY + 1, z);
                    clear(world, x, floorY + 2, z);
                    continue;
                }
                set(world, x, floorY, z, Material.GRASS_BLOCK);
                set(world, x, floorY + 1, z, Material.OAK_FENCE);
                clear(world, x, floorY + 2, z);
            }
        }
        // สนามหญ้า + ดอกไม้รอบรั้ว
        Material[] flowers = {
                Material.POPPY, Material.DANDELION, Material.OXEYE_DAISY,
                Material.AZURE_BLUET, Material.CORNFLOWER, Material.ALLIUM
        };
        for (int x = cx - yardR; x <= cx + yardR; x++) {
            for (int z = cz - yardR; z <= cz + yardR; z++) {
                if (Math.abs(x - cx) <= fenceR && Math.abs(z - cz) <= fenceR) continue;
                set(world, x, floorY, z, Material.GRASS_BLOCK);
                clear(world, x, floorY + 1, z);
                clear(world, x, floorY + 2, z);
                int h = Math.floorMod(x * 31 + z * 17, 7);
                if (h == 0) {
                    set(world, x, floorY + 1, z, flowers[Math.floorMod(x + z, flowers.length)]);
                } else if (h == 1) {
                    set(world, x, floorY + 1, z, Material.SHORT_GRASS);
                } else if (h == 2 && (Math.abs(x - cx) + Math.abs(z - cz)) % 5 == 0) {
                    set(world, x, floorY, z, Material.DIRT_PATH);
                }
            }
        }
        // ต้นไม้มุมและกลางด้านนอก
        int treeR = border + 3;
        int[][] treeSpots = {
                {cx - treeR, cz - treeR}, {cx + treeR, cz - treeR},
                {cx - treeR, cz + treeR}, {cx + treeR, cz + treeR},
                {cx - treeR, cz}, {cx + treeR, cz},
                {cx, cz - treeR}, {cx, cz + treeR}
        };
        for (int[] spot : treeSpots) {
            placeDecorTree(world, spot[0], floorY, spot[1]);
        }
    }

    private void placeDecorTree(World world, int x, int floorY, int z) {
        set(world, x, floorY, z, Material.GRASS_BLOCK);
        for (int y = 1; y <= 4; y++) {
            set(world, x, floorY + y, z, Material.OAK_LOG);
        }
        for (int dx = -2; dx <= 2; dx++) {
            for (int dz = -2; dz <= 2; dz++) {
                if (Math.abs(dx) == 2 && Math.abs(dz) == 2) continue;
                for (int dy = 3; dy <= 5; dy++) {
                    if (dx == 0 && dz == 0 && dy <= 4) continue;
                    set(world, x + dx, floorY + dy, z + dz, Material.OAK_LEAVES);
                }
            }
        }
        set(world, x, floorY + 6, z, Material.OAK_LEAVES);
    }

    /**
     * ธีมบ่อน้ำรอบแมพกว้าง {@code width} บล็อกจากกำแพง —
     * ปะการัง · ไฟทะเล · สาหร่าย · ดอกบัว · ดอกไม้ชายฝั่ง
     */
    public void decoratePondAroundMap(World world, int cx, int cz, int floorY, int border, int width) {
        if (world == null || width < 1) return;
        int w = Math.max(1, Math.min(16, width));
        Material[] corals = {
                Material.TUBE_CORAL, Material.BRAIN_CORAL, Material.BUBBLE_CORAL,
                Material.FIRE_CORAL, Material.HORN_CORAL
        };
        Material[] coralFans = {
                Material.TUBE_CORAL_FAN, Material.BRAIN_CORAL_FAN, Material.BUBBLE_CORAL_FAN,
                Material.FIRE_CORAL_FAN, Material.HORN_CORAL_FAN
        };
        Material[] coralBlocks = {
                Material.TUBE_CORAL_BLOCK, Material.BRAIN_CORAL_BLOCK, Material.BUBBLE_CORAL_BLOCK,
                Material.FIRE_CORAL_BLOCK, Material.HORN_CORAL_BLOCK, Material.PRISMARINE,
                Material.DARK_PRISMARINE, Material.PRISMARINE_BRICKS
        };
        Material[] shoreFlowers = {
                Material.BLUE_ORCHID, Material.CORNFLOWER, Material.LILY_OF_THE_VALLEY,
                Material.PINK_TULIP, Material.WHITE_TULIP, Material.AZURE_BLUET,
                Material.OXEYE_DAISY, Material.ALLIUM, Material.POPPY
        };
        java.util.Random rng = new java.util.Random((long) cx * 73856093L ^ (long) cz * 19349663L ^ border);

        for (int x = cx - border - w; x <= cx + border + w; x++) {
            for (int z = cz - border - w; z <= cz + border + w; z++) {
                int dx = Math.abs(x - cx);
                int dz = Math.abs(z - cz);
                if (dx <= border && dz <= border) continue; // ในแมพ
                int cheb = Math.max(dx, dz);
                if (cheb > border + w) continue;
                int ring = cheb - border; // 1..w

                // เคลียร์เศษเหนือพื้นในวงบ่อ
                for (int y = floorY; y <= floorY + 4; y++) {
                    clear(world, x, y, z);
                }
                // ชั้นใต้บ่อ
                set(world, x, floorY - 1, z, Material.SAND);
                if (floorY - 2 >= world.getMinHeight()) {
                    set(world, x, floorY - 2, z, Material.STONE);
                }

                int h = Math.floorMod(x * 17 + z * 31 + ring * 7, 100);

                if (ring == 1) {
                    // ขอบติดกำแพง — ปริซึมารีน + ไฟทะเล
                    Material rim = (h % 3 == 0) ? Material.DARK_PRISMARINE
                            : (h % 3 == 1 ? Material.PRISMARINE_BRICKS : Material.PRISMARINE);
                    set(world, x, floorY, z, rim);
                    set(world, x, floorY + 1, z, Material.WATER);
                    if (h % 5 == 0) set(world, x, floorY, z, Material.SEA_LANTERN);
                    if (h % 7 == 0) tryPlace(world, x, floorY + 1, z, Material.SEAGRASS);
                } else if (ring >= w - 1) {
                    // ชายฝั่งนอก — ทราย + ดอกไม้ / หญ้า
                    set(world, x, floorY, z, h % 4 == 0 ? Material.SANDSTONE : Material.SAND);
                    if (h % 3 == 0) {
                        set(world, x, floorY + 1, z, shoreFlowers[Math.floorMod(x + z, shoreFlowers.length)]);
                    } else if (h % 5 == 0) {
                        set(world, x, floorY + 1, z, Material.SHORT_GRASS);
                    } else if (h % 11 == 0) {
                        set(world, x, floorY, z, Material.GRASS_BLOCK);
                        set(world, x, floorY + 1, z, Material.PINK_PETALS);
                    }
                } else {
                    // กลางบ่อ — น้ำ + ปะการัง + สาหร่าย + ดอกบัว
                    Material bed = coralBlocks[Math.floorMod(h, coralBlocks.length)];
                    if (h % 8 == 0) bed = Material.SEA_LANTERN;
                    else if (h % 6 == 0) bed = Material.SAND;
                    else if (h % 5 == 0) bed = Material.GRAVEL;
                    set(world, x, floorY, z, bed);
                    set(world, x, floorY + 1, z, Material.WATER);

                    if (h % 4 == 0) {
                        tryPlace(world, x, floorY + 1, z, corals[Math.floorMod(h, corals.length)]);
                    } else if (h % 4 == 1) {
                        tryPlace(world, x, floorY + 1, z, coralFans[Math.floorMod(h, coralFans.length)]);
                    } else if (h % 4 == 2) {
                        tryPlace(world, x, floorY + 1, z, Material.SEAGRASS);
                    } else if (ring >= 3 && ring <= w - 2 && h % 9 == 0) {
                        tryPlace(world, x, floorY + 1, z, Material.KELP);
                        if (world.getBlockAt(x, floorY + 1, z).getType() == Material.KELP) {
                            tryPlace(world, x, floorY + 2, z, Material.KELP);
                        }
                    }

                    if (h % 10 == 0) {
                        tryPlace(world, x, floorY + 1, z, Material.SEA_PICKLE);
                    }
                    // ดอกบัวบนผิวน้ำ
                    if (h % 13 == 0 || (ring == 3 && h % 7 == 0)) {
                        set(world, x, floorY + 1, z, Material.WATER);
                        set(world, x, floorY + 2, z, Material.LILY_PAD);
                    }
                }

                // จุดไฟทะเลกระจายเป็นระยะ
                if (ring >= 2 && ring <= w - 2 && (x + z) % 9 == 0 && rng.nextInt(3) == 0) {
                    set(world, x, floorY, z, Material.SEA_LANTERN);
                    set(world, x, floorY + 1, z, Material.WATER);
                }
            }
        }
        plugin.getLogger().info("Decorated pond theme width=" + w + " around border=" + border);
    }

    private void tryPlace(World world, int x, int y, int z, Material mat) {
        try {
            set(world, x, y, z, mat);
        } catch (Throwable ignored) {
            // บางเวอร์ชัน/บล็อกอาจวางไม่ได้ในน้ำ — ข้าม
        }
    }

    /** คืนพื้นดิน/หญ้า รอบนอกแมพให้เต็ม — ซ่อมหลุมเก่าด้วย */
    private void restoreSurroundingTerrain(World world, int cx, int cz, int floorY, int border, int pad) {
        int minY = world.getMinHeight();
        int outer = border + Math.max(48, pad);
        for (int x = cx - outer; x <= cx + outer; x++) {
            for (int z = cz - outer; z <= cz + outer; z++) {
                if (Math.abs(x - cx) <= border && Math.abs(z - cz) <= border) continue;

                // เติมจากก้นโลกถึงพื้น — กันหลุมลึกจากเวอร์ชันเก่า
                set(world, x, minY, z, Material.BEDROCK);
                for (int y = minY + 1; y < floorY; y++) {
                    Material cur = world.getBlockAt(x, y, z).getType();
                    if (cur.isAir() || cur == Material.BEDROCK || cur == Material.WATER
                            || cur == Material.LAVA || cur == Material.GLASS) {
                        set(world, x, y, z, Material.DIRT);
                    }
                }
                // บังคับชั้นบนสุดเป็นหญ้า
                set(world, x, floorY, z, Material.GRASS_BLOCK);
                // ล้างทุกอย่างเหนือหญ้าสูงพอ — กันเพดานดิน/เศษโครงสร้างบังแสงรอบแมพ
                int clearAbove = Math.min(world.getMaxHeight() - 1, floorY + 96);
                for (int y = floorY + 1; y <= clearAbove; y++) {
                    Material cur = world.getBlockAt(x, y, z).getType();
                    if (!cur.isAir()) {
                        clear(world, x, y, z);
                    }
                }
            }
        }
    }

    private void teleportAllToStart(World world) {
        Location start = spawnLocation(world);
        for (Player player : world.getPlayers()) {
            player.teleport(start);
            plugin.enablePlayerFlight(player);
            plugin.giveBuildKit(player);
        }
    }

    public void buildTowerArena(World world) {
        if (world.getEnvironment() != World.Environment.NORMAL) return;

        int size = plugin.getConfig().getInt("arena.size", 7);
        int layers = plugin.getConfig().getInt("arena.layers", 9);
        int layerHeight = plugin.getConfig().getInt("arena.layer-height", 4);
        int floorY = resolveFloorY(world);

        state.setWorld(world);
        state.setSize(size);
        state.setLayers(layers);
        state.setLayerHeight(layerHeight);
        state.setFloorY(floorY);
        state.setCenter(0, 0);
        state.clearCells();

        int half = size / 2;
        int minX = -half;
        int maxX = half;
        int minZ = -half;
        int maxZ = half;

        Material base = baseMaterial();
        Material shell = shellMaterial();

        clearTowerVolume(world, minX, maxX, minZ, maxZ, floorY, layers, layerHeight);

        for (int layer = 0; layer < layers; layer++) {
            int baseY = state.layerBaseY(layer);
            for (int x = minX; x <= maxX; x++) {
                for (int z = minZ; z <= maxZ; z++) {
                    state.addZone(x, z, layer);
                    set(world, x, baseY, z, base);
                    for (int y = 1; y <= layerHeight; y++) {
                        clear(world, x, baseY + y, z);
                    }
                }
            }
            buildLayerShell(world, minX, maxX, minZ, maxZ, baseY, layerHeight, shell);
            placeLadderColumn(world, state.getCenterX(), state.getCenterZ(), baseY, layerHeight, layer < layers - 1);
        }

        int topLayer = layers - 1;
        int cx = state.getCenterX();
        int cz = state.getCenterZ();
        set(world, cx, state.layerWalkY(0), cz, Material.EMERALD_BLOCK);
        set(world, cx, state.layerWalkY(topLayer), cz, Material.GOLD_BLOCK);
        clear(world, cx, state.layerWalkY(0) + 1, cz);
        clear(world, cx, state.layerWalkY(0) + 2, cz);

        world.setSpawnLocation(spawnLocation(world));
        plugin.getLogger().info("Built TokControl bedrock-box arena " + size + "x" + size + " layers=" + layers + " y=" + floorY);
    }

    private void clearTowerVolume(World world, int minX, int maxX, int minZ, int maxZ, int floorY, int layers, int layerHeight) {
        int topY = floorY + layers * layerHeight + 6;
        for (int x = minX - 2; x <= maxX + 2; x++) {
            for (int z = minZ - 2; z <= maxZ + 2; z++) {
                for (int y = floorY - 1; y <= topY; y++) {
                    clear(world, x, y, z);
                }
            }
        }
    }

    private void buildLayerShell(World world, int minX, int maxX, int minZ, int maxZ, int baseY, int layerHeight, Material shell) {
        int wallTop = baseY + layerHeight;
        for (int x = minX - 1; x <= maxX + 1; x++) {
            for (int y = 0; y <= wallTop - baseY; y++) {
                set(world, x, baseY + y, minZ - 1, shell);
                set(world, x, baseY + y, maxZ + 1, shell);
            }
        }
        for (int z = minZ; z <= maxZ; z++) {
            for (int y = 0; y <= wallTop - baseY; y++) {
                set(world, minX - 1, baseY + y, z, shell);
                set(world, maxX + 1, baseY + y, z, shell);
            }
        }
        for (int x = minX - 1; x <= maxX + 1; x++) {
            for (int z = minZ - 1; z <= maxZ + 1; z++) {
                set(world, x, baseY - 1, z, shell);
            }
        }
    }

    private void placeLadderColumn(World world, int cx, int cz, int baseY, int layerHeight, boolean withLadder) {
        if (!withLadder || layerHeight < 2) return;
        for (int y = 2; y <= layerHeight; y++) {
            set(world, cx, baseY + y, cz, Material.LADDER);
        }
    }

    public void placeCell(World world, int x, int z, int layer, boolean asPath) {
        int baseY = state.layerBaseY(layer);
        Material path = pathMaterial();
        Material base = baseMaterial();
        set(world, x, baseY, z, base);
        if (asPath) {
            set(world, x, baseY + 1, z, path);
            state.addPath(x, z, layer);
        } else {
            clear(world, x, baseY + 1, z);
            state.removePath(x, z, layer);
        }
        state.addZone(x, z, layer);
    }

    public void clearCellPath(World world, int x, int z, int layer) {
        int baseY = state.layerBaseY(layer);
        clear(world, x, baseY + 1, z);
        state.removePath(x, z, layer);
    }

    public void rebuildWalls(World world) {
        int half = state.getSize() / 2;
        int minX = -half;
        int maxX = half;
        int minZ = -half;
        int maxZ = half;
        Material shell = shellMaterial();
        for (int layer = 0; layer < state.getLayers(); layer++) {
            buildLayerShell(world, minX, maxX, minZ, maxZ, state.layerBaseY(layer), state.getLayerHeight(), shell);
        }
    }

    private Material parseMat(String name, Material fallback) {
        if (name == null) return fallback;
        Material m = Material.matchMaterial(name.toUpperCase());
        return m != null && m.isBlock() ? m : fallback;
    }

    private void set(World world, int x, int y, int z, Material mat) {
        world.getBlockAt(x, y, z).setType(mat, false);
    }

    private void clear(World world, int x, int y, int z) {
        world.getBlockAt(x, y, z).setType(Material.AIR, false);
    }
}
