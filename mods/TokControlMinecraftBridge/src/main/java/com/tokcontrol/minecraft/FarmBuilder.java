package com.tokcontrol.minecraft;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.block.BlockFace;
import org.bukkit.block.data.MultipleFacing;
import org.bukkit.block.data.type.Lantern;
import org.bukkit.block.data.type.Stairs;
import org.bukkit.entity.Cow;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Villager;

import java.util.ArrayList;

/**
 * แมพฟาร์ม Map 4 — รั้วสี่เหลี่ยม · หอคอยวงกลมบนฐานสี่เหลี่ยม · คูน้ำ · นาข้าว
 * พิกัดครอปตรงกับ datapack tokcontrol_farm (origin ที่ cropY)
 */
public final class FarmBuilder {

    public static final int TOWER_R = 3;
    /** ฐานสี่เหลี่ยมครึ่งด้าน — เท่าขอบวงกลมด้านทิศหลัก ให้ต่อกันไม่มีช่อง */
    public static final int BASE_R = 3;
    public static final int POND_INNER = 4;
    public static final int POND_OUTER = 6;
    public static final int FARM_INNER = POND_OUTER + 1;
    /** เล็กสุด = ขอบบ่อ + 1 แถวนา + เสารั้ว */
    public static final int MIN_HALF = POND_OUTER + 2;
    public static final int DEFAULT_HALF = 15;
    public static final int MAX_HALF = 256;
    public static final int EXPAND_STEP = 1;
    public static final int HALF = DEFAULT_HALF;
    public static final int TOWER_HEIGHT = 14;
    /** ขอบดินนอกรั้ว — ถมเต็มแนวราบ */
    public static final int OUTER_DIRT_PAD = 40;

    private static final int[][] CARDINAL = {
            {1, 0}, {-1, 0}, {0, 1}, {0, -1}
    };

    private final TokControlPlugin plugin;
    private Location farmSpawn;
    private int floorY;
    private int cropY;
    private int centerX;
    private int centerZ;
    private int currentHalf = DEFAULT_HALF;
    /** รั้วใหญ่สุดที่เคยใช้ — ใช้ตอนเคลียร์ขอบเก่าที่ค้าง */
    private int extentHalf = DEFAULT_HALF;
    private boolean built;

    public FarmBuilder(TokControlPlugin plugin) {
        this.plugin = plugin;
    }

    public static boolean isFarmWorld(World world) {
        if (world == null) return false;
        String n = world.getName().toLowerCase();
        return n.contains("farm") || n.contains("wheat") || n.contains("paddy");
    }

    /**
     * พื้น flat ตายตัว: bedrock(1)+dirt(3)+grass(1) → หญ้าที่ minHeight+4
     * ห้ามสแกนหาพื้นสูง / ห้ามบวก offset / ห้ามสะสม Y เมื่อสร้างใหม่
     * (1.18+: minHeight=-64 → floorY=-60 · โลกเก่า minHeight=0 → floorY=4)
     */
    public static int resolveFlatFloorY(World world) {
        if (world == null) return 4;
        return world.getMinHeight() + 4;
    }

    /** ล็อก floorY/cropY ให้ตรงระดับ flat เสมอ (ไม่สะสม) */
    private void lockFloorToFlat(World world) {
        floorY = resolveFlatFloorY(world);
        cropY = floorY + 1;
    }

    public boolean isBuilt() { return built; }
    public Location getFarmSpawn() { return farmSpawn; }
    public int getFloorY() { return floorY; }
    public int getCropY() { return cropY; }
    public int getCenterX() { return centerX; }
    public int getCenterZ() { return centerZ; }
    public int getHalf() { return currentHalf; }

    public Location getTowerTop(World world) {
        if (world == null) return null;
        // ยืนบนดาดฟ้าข้างบล็อกทอง — ไม่สปอนทับทอง/โคม
        return new Location(world, centerX + 0.5, floorY + TOWER_HEIGHT + 1.0, centerZ + 1.5);
    }

    /** เปิดช่องอากาศให้สโนแมน/พ่นไฟยืนบนดาดฟ้า */
    public void clearHelperStand(World world) {
        if (world == null) return;
        int top = floorY + TOWER_HEIGHT;
        int x = centerX;
        int z = centerZ + 1;
        set(world, x, top, z, mixBrick(x, top, z));
        for (int dx = -1; dx <= 1; dx++) {
            for (int dz = 0; dz <= 1; dz++) {
                for (int y = top + 1; y <= top + 4; y++) {
                    Material m = world.getBlockAt(x + dx, y, z + dz).getType();
                    if (m != Material.GOLD_BLOCK && m != Material.BELL && !m.name().contains("BANNER")) {
                        set(world, x + dx, y, z + dz, Material.AIR);
                    }
                }
            }
        }
    }

    public void buildFarm(World world) {
        buildFarm(world, true);
    }

    /**
     * @param teleportPlayers false = รีเซ็ตแมพอย่างเดียว (เช่น หลังชนะ) ไม่ย้ายผู้เล่น
     * @param forceHalf &gt;= MIN_HALF บังคับขนาด (เช่น หลังชนะกลับค่าเริ่มต้น) · &lt;0 = ใช้ไฟล์เซฟ/ค่าเริ่มต้น
     */
    public void buildFarm(World world, boolean teleportPlayers) {
        buildFarm(world, teleportPlayers, -1);
    }

    public void buildFarm(World world, boolean teleportPlayers, int forceHalf) {
        if (world == null) return;
        // เคลียร์วัว/ชาวบ้าน/มอบฟาร์มก่อน wipe บล็อก — กันค้างหลัง rebuild/ขยาย/ย่อ
        clearFarmEntities(world);
        // ศูนย์กลางเฉพาะ X/Z — ไม่ใช้ Y จาก spawn (กันสะสมความสูง)
        centerX = 0;
        centerZ = 0;
        if (world.getSpawnLocation() != null) {
            centerX = world.getSpawnLocation().getBlockX();
            centerZ = world.getSpawnLocation().getBlockZ();
        }
        DecorationStore store = plugin.getDecorationStore();
        if (forceHalf >= MIN_HALF && forceHalf <= MAX_HALF) {
            currentHalf = forceHalf;
        } else {
            int savedHalf = store != null ? store.getFarmSavedHalf() : -1;
            currentHalf = (savedHalf >= MIN_HALF && savedHalf <= MAX_HALF) ? savedHalf : DEFAULT_HALF;
        }
        // จำขนาดที่กำลังสร้าง — รอบใหม่หลังชนะใช้ค่าเริ่มต้น ไม่เก็บขนาดขยายค้าง
        if (store != null) store.setFarmSavedHalf(currentHalf);
        lockFloorToFlat(world);
        int cx = centerX;
        int cz = centerZ;
        int half = currentHalf;
        int fy = floorY;
        int minY = world.getMinHeight();

        // ลบแมพเก่า — wipe กับพื้นต้องเท่ากัน กันหลุมโชว์ bedrock
        int wipeHalf = Math.max(extentHalf, half);
        int wipeR = wipeHalf + OUTER_DIRT_PAD + 16;
        int wipeTop = Math.min(world.getMaxHeight() - 1, Math.max(fy + 64, 320));
        clearBox(world, cx - wipeR, cx + wipeR, cz - wipeR, cz + wipeR, minY + 1, wipeTop);
        clearStaleBorders(world, cx, cz, fy, half, wipeHalf);

        // ถมพื้นครบทุกช่องที่ wipe (ไม่ให้เหลือแอ่ง)
        int padR = wipeR;
        for (int x = cx - padR; x <= cx + padR; x++) {
            for (int z = cz - padR; z <= cz + padR; z++) {
                placeFlatColumn(world, x, z, fy, minY);
                set(world, x, fy, z, Material.GRASS_BLOCK);
            }
        }
        clearHayAndFlowers(world, cx, cz, fy, padR);

        fillAllFarmPlots(world);
        buildPondRing(world, cx, cz, fy);
        buildCentralTower(world, cx, cz, fy);
        fillAllFarmPlots(world);
        placeFenceLayer(world, half);
        decorateOutsideFence(world, cx, cz, fy, half);
        sealOutsideHoles(world, cx, cz, fy, half);
        purgeOrphanFarmland(world, cx, cz, fy, half);
        fillSurfaceHoles(world, cx, cz, fy, padR);
        extentHalf = half;

        farmSpawn = new Location(world, cx + 0.5, fy + 1, cz + POND_OUTER + 3.5, 0f, 0f);
        world.setSpawnLocation(farmSpawn);
        built = true;
        clearFloatingDebris(world, cx, cz, fy, half);
        // แปะของแต่งนอกรั้วก่อน แล้วค่อยสร้างกำแพง/หอทับให้สม่ำเสมอ
        restoreDecorations(world);
        finalizeBordersAndPond(world, half);
        stripOrphanFenceBits(world, half);
        if (teleportPlayers) {
            for (Player p : world.getPlayers()) {
                if (Math.abs(p.getLocation().getBlockX() - cx) <= wipeR
                        && Math.abs(p.getLocation().getBlockZ() - cz) <= wipeR) {
                    p.teleport(farmSpawn);
                }
            }
        }
        plugin.getLogger().info("Farm map built half=" + half + " floorY=" + fy
                + " teleport=" + teleportPlayers
                + " customFence=" + (store != null && store.hasFarmPerimeterDecor(half))
                + " (locked flat minHeight+" + (fy - minY) + ") at " + cx + "," + cz);
    }

    /**
     * คอลัมน์ flat มาตรฐาน: bedrock → dirt×3 → grass ที่ fy
     * ไม่ถมหิน/ดินพุ่งสูงเกินระดับพื้น
     */
    private void placeFlatColumn(World world, int x, int z, int fy, int minY) {
        set(world, x, minY, z, Material.BEDROCK);
        // ชั้นระหว่าง bedrock กับใต้พื้น — ดินบางชั้นเท่านั้น (ตรง generator)
        for (int y = minY + 1; y < fy; y++) {
            set(world, x, y, z, Material.DIRT);
        }
        set(world, x, fy, z, Material.GRASS_BLOCK);
        for (int y = fy + 1; y <= fy + 28; y++) set(world, x, y, z, Material.AIR);
    }

    /** ทุกช่องในรั้ว = สี่เหลี่ยมชัดเจน · เว้นโซนหอ/บ่อสี่เหลี่ยมกลาง */
    public void fillAllFarmPlots(World world) {
        if (world == null) return;
        int cx = centerX;
        int cz = centerZ;
        int fy = floorY;
        int half = currentHalf;
        for (int x = cx - half + 1; x <= cx + half - 1; x++) {
            for (int z = cz - half + 1; z <= cz + half - 1; z++) {
                if (!isFarmPlotXZ(x, z, cx, cz, half)) continue;
                if (plugin.getGameSessionService() != null && plugin.getGameSessionService().isInsideActiveCage(x, z)) continue;
                set(world, x, fy - 1, z, Material.WATER);
                setFarmlandMoist(world, x, fy, z);
                Material top = world.getBlockAt(x, cropY, z).getType();
                if (top != Material.WHEAT && top != Material.FIRE) set(world, x, cropY, z, Material.AIR);
                for (int y = cropY + 1; y <= fy + 10; y++) {
                    Material m = world.getBlockAt(x, y, z).getType();
                    if (m == Material.HAY_BLOCK || m == Material.CHEST || m == Material.POPPY
                            || m == Material.DANDELION || m == Material.OXEYE_DAISY || m == Material.CORNFLOWER
                            || m == Material.LANTERN || m == Material.OAK_LOG || m == Material.OAK_LEAVES
                            || m == Material.OAK_FENCE || m == Material.OAK_FENCE_GATE
                            || m == Material.CHAIN || m == Material.STONE_BRICK_WALL || m == Material.COBBLESTONE_WALL
                            || m == Material.STONE_BRICKS || m == Material.MOSSY_STONE_BRICKS
                            || m == Material.CRACKED_STONE_BRICKS || m == Material.MOSSY_COBBLESTONE
                            || m == Material.STONE_BRICK_STAIRS || m == Material.VINE || m == Material.MOSS_CARPET
                            || m.name().contains("_WALL") || m.name().contains("_STAIRS")
                            || m.name().contains("BANNER") || m == Material.IRON_BARS) {
                        set(world, x, y, z, Material.AIR);
                    }
                }
            }
        }
        purgeOrphanFarmland(world, cx, cz, fy, half);
    }

    /** จานวงกลมแบบต่อกัน (4-neighbor) — ไม่มีรูที่มุม */
    public static boolean inCircle(int dx, int dz, int radius) {
        return dx * dx + dz * dz <= radius * radius + radius;
    }

    public static boolean isCircleShell(int dx, int dz, int radius) {
        if (!inCircle(dx, dz, radius)) return false;
        return !inCircle(dx + 1, dz, radius) || !inCircle(dx - 1, dz, radius)
                || !inCircle(dx, dz + 1, radius) || !inCircle(dx, dz - 1, radius);
    }

    /** มุมสี่เหลี่ยมที่ติดวงกลม — เติมอิฐเชื่อมไม่ให้หอมีรู */
    public static boolean isCircleButtress(int dx, int dz, int radius) {
        if (inCircle(dx, dz, radius)) return false;
        if (Math.max(Math.abs(dx), Math.abs(dz)) > radius) return false;
        return inCircle(dx + 1, dz, radius) || inCircle(dx - 1, dz, radius)
                || inCircle(dx, dz + 1, radius) || inCircle(dx, dz - 1, radius);
    }

    public static boolean inTowerColumn(int dx, int dz, int radius) {
        return inCircle(dx, dz, radius) || isCircleButtress(dx, dz, radius);
    }

    public static double circleDist(int dx, int dz) {
        return Math.hypot(dx, dz);
    }

    /** โซนฐานสี่เหลี่ยม + คูน้ำรอบฐาน — ห้ามถมนาทับ */
    public static boolean isTowerPondZone(int x, int z, int cx, int cz) {
        return Math.max(Math.abs(x - cx), Math.abs(z - cz)) <= POND_OUTER;
    }

    /** แปลงนา = ในรั้ว หักหอ/คูน้ำ */
    public static boolean isFarmPlotXZ(int x, int z, int cx, int cz, int half) {
        if (Math.abs(x - cx) >= half || Math.abs(z - cz) >= half) return false;
        return !isTowerPondZone(x, z, cx, cz);
    }

    public boolean isFarmPlotAt(int x, int z) {
        return isFarmPlotXZ(x, z, centerX, centerZ, currentHalf);
    }

    private static BlockFace faceTowardOrigin(int dx, int dz) {
        if (Math.abs(dx) >= Math.abs(dz)) {
            if (dx > 0) return BlockFace.WEST;
            if (dx < 0) return BlockFace.EAST;
        }
        if (dz > 0) return BlockFace.NORTH;
        if (dz < 0) return BlockFace.SOUTH;
        return BlockFace.NORTH;
    }

    /** แปลง farmland / รั้วเก่าที่อยู่นอกเขต → หญ้า */
    public void purgeOrphanFarmland(World world, int cx, int cz, int fy, int half) {
        if (world == null) return;
        int scan = Math.max(Math.max(half, extentHalf) + OUTER_DIRT_PAD + 48, Math.min(MAX_HALF, 200) + 16);
        for (int x = cx - scan; x <= cx + scan; x++) {
            for (int z = cz - scan; z <= cz + scan; z++) {
                // ห้ามแตะหอ/บ่อน้ำ
                if (isTowerPondZone(x, z, cx, cz)) continue;
                boolean insidePlot = isFarmPlotXZ(x, z, cx, cz, half);
                boolean onFence = (Math.abs(x - cx) == half && Math.abs(z - cz) <= half)
                        || (Math.abs(z - cz) == half && Math.abs(x - cx) <= half);
                Block soil = world.getBlockAt(x, fy, z);
                Material top = soil.getType();

                if (!insidePlot && !onFence) {
                    if (top == Material.FARMLAND || top == Material.DIRT || top == Material.COARSE_DIRT) {
                        set(world, x, fy, z, Material.GRASS_BLOCK);
                        Material under = world.getBlockAt(x, fy - 1, z).getType();
                        if (under == Material.WATER) set(world, x, fy - 1, z, Material.DIRT);
                    }
                    Block crop = world.getBlockAt(x, fy + 1, z);
                    if (crop.getType() == Material.WHEAT || crop.getType() == Material.FIRE) {
                        set(world, x, fy + 1, z, Material.AIR);
                    }
                    // รั้ว/ฐานหินเก่าที่ค้างนอกเขตปัจจุบัน
                    for (int y = fy; y <= fy + 8; y++) {
                        Material m = world.getBlockAt(x, y, z).getType();
                        if (m == Material.OAK_FENCE || m == Material.OAK_FENCE_GATE
                                || m == Material.COBBLESTONE || m == Material.SPRUCE_PLANKS
                                || m == Material.STRIPPED_OAK_LOG || m == Material.LANTERN
                                || m == Material.STONE_BRICK_WALL || m == Material.COBBLESTONE_WALL
                                || m == Material.CHAIN || m == Material.STONE_BRICKS
                                || m == Material.MOSSY_STONE_BRICKS || m == Material.CRACKED_STONE_BRICKS
                                || m.name().contains("_WALL") || m.name().contains("_STAIRS")) {
                            set(world, x, y, z, y == fy ? Material.GRASS_BLOCK : Material.AIR);
                        }
                    }
                }
            }
        }
    }

    /** เคลียร์รั้วเก่าทุกระยะระหว่าง half..oldMax */
    public void clearStaleBorders(World world, int cx, int cz, int fy, int keepHalf, int oldMax) {
        if (world == null) return;
        int from = Math.min(keepHalf, oldMax);
        int to = Math.max(oldMax, keepHalf) + 4;
        for (int h = Math.max(1, from - 2); h <= to; h++) {
            if (h == keepHalf) continue;
            clearFence(world, cx, cz, fy, h);
        }
    }

    /**
     * ลบรั้วซ้อนทุกชั้นที่ไมใช่ keepHalf — สแกนทั้งวงแหวน + พื้นที่รอบ
     */
    public void clearAllStaleFences(World world, int cx, int cz, int fy, int keepHalf) {
        clearAllStaleFences(world, cx, cz, fy, keepHalf, -1);
    }

    public void clearAllStaleFences(World world, int cx, int cz, int fy, int keepHalf, int scanMax) {
        if (world == null) return;
        int scan = scanMax >= keepHalf
                ? scanMax
                : Math.max(Math.max(extentHalf, keepHalf) + 24, keepHalf + 16);
        // ลบทีละวง (เร็วและครอบคลุมรั้วสี่เหลี่ยม)
        for (int h = 1; h <= scan; h++) {
            if (h == keepHalf) continue;
            clearFence(world, cx, cz, fy, h);
        }
        // กวาดซ้ำบล็อกรั้วที่ค้างนอกแนว keepHalf (เผื่อรั้วเยื้อง)
        for (int x = cx - scan; x <= cx + scan; x++) {
            for (int z = cz - scan; z <= cz + scan; z++) {
                if (isTowerPondZone(x, z, cx, cz)) continue;
                boolean onKeep = (Math.abs(x - cx) == keepHalf && Math.abs(z - cz) <= keepHalf)
                        || (Math.abs(z - cz) == keepHalf && Math.abs(x - cx) <= keepHalf);
                if (onKeep) continue;
                clearFenceColumn(world, x, fy, z);
            }
        }
    }

    /** ลบรั้ว/กำแพง/กระจกที่ค้างนอกรั้วปัจจุบัน ทั้งพื้นที่ */
    public void stripOuterPerimeter(World world, int keepHalf, int oldMax) {
        if (world == null) return;
        int fy = floorY;
        int found = detectFarthestOuterRing(world, fy, keepHalf);
        int to = Math.max(Math.max(Math.max(oldMax, keepHalf), extentHalf), found) + 16;
        to = Math.min(MAX_HALF + 16, to);
        if (plugin.getGameSessionService() != null) {
            plugin.getGameSessionService().releaseCagesOutside(centerX, centerZ, keepHalf);
        }
        for (int x = centerX - to; x <= centerX + to; x++) {
            for (int z = centerZ - to; z <= centerZ + to; z++) {
                if (isTowerPondZone(x, z, centerX, centerZ)) continue;
                int cheb = Math.max(Math.abs(x - centerX), Math.abs(z - centerZ));
                if (cheb <= keepHalf) continue;
                clearFenceColumn(world, x, fy, z, false);
            }
        }
    }

    /**
     * ลบกำแพง/หินมอสที่ลอยค้างหลังย่อ-ขยาย — ไม่แตะรั้วปัจจุบันและหอ/บ่อ
     */
    public void stripOrphanFenceBits(World world, int keepHalf) {
        if (world == null) return;
        int fy = floorY;
        int found = detectFarthestOuterRing(world, fy, keepHalf);
        int to = Math.min(MAX_HALF + 16, Math.max(Math.max(extentHalf, keepHalf), found) + 24);
        int cleared = 0;
        for (int x = centerX - to; x <= centerX + to; x++) {
            for (int z = centerZ - to; z <= centerZ + to; z++) {
                if (isTowerPondZone(x, z, centerX, centerZ)) continue;
                boolean onKeep = (Math.abs(x - centerX) == keepHalf && Math.abs(z - centerZ) <= keepHalf)
                        || (Math.abs(z - centerZ) == keepHalf && Math.abs(x - centerX) <= keepHalf);
                if (onKeep) continue;
                for (int y = fy + 1; y <= fy + 12; y++) {
                    if (isActiveCageBlock(x, y, z)) continue;
                    Material m = world.getBlockAt(x, y, z).getType();
                    if (!isClearablePerimeterMat(m)) continue;
                    set(world, x, y, z, Material.AIR);
                    cleared++;
                }
            }
        }
        if (cleared > 0) {
            plugin.getLogger().info("Stripped " + cleared + " orphan fence bits");
        }
    }

    /** หาวงรั้ว/กระจกเก่าที่ไกลสุด — กัน leftover นอก extentHalf */
    private int detectFarthestOuterRing(World world, int fy, int keepHalf) {
        int best = keepHalf;
        int[] ys = { fy, fy + 1, fy + 3, fy + 8, fy + 16, fy + 24, fy + 40 };
        for (int h = keepHalf + 1; h <= MAX_HALF; h++) {
            boolean hit = false;
            for (int y : ys) {
                if (isFenceLike(world.getBlockAt(centerX + h, y, centerZ).getType())
                        || isFenceLike(world.getBlockAt(centerX - h, y, centerZ).getType())
                        || isFenceLike(world.getBlockAt(centerX, y, centerZ + h).getType())
                        || isFenceLike(world.getBlockAt(centerX, y, centerZ - h).getType())
                        || isFenceLike(world.getBlockAt(centerX + h, y, centerZ + h).getType())
                        || isGlassLike(world.getBlockAt(centerX + h, y, centerZ).getType())
                        || isGlassLike(world.getBlockAt(centerX - h, y, centerZ).getType())
                        || isGlassLike(world.getBlockAt(centerX, y, centerZ + h).getType())
                        || isGlassLike(world.getBlockAt(centerX, y, centerZ - h).getType())
                        || isGlassLike(world.getBlockAt(centerX + h, y, centerZ + h).getType())) {
                    hit = true;
                    break;
                }
            }
            if (hit) best = h;
        }
        return best;
    }

    private static boolean isGlassLike(Material m) {
        if (m == null || m.isAir()) return false;
        String n = m.name();
        return n.contains("GLASS");
    }

    private boolean isActiveCageBlock(int x, int y, int z) {
        return plugin.getGameSessionService() != null
                && plugin.getGameSessionService().isCageProtected(x, y, z);
    }

    /** หลังขยาย/ย่อ — ล้างรั้วซ้อน · สร้างกำแพงสม่ำเสมอ · สร้างหอใหม่ · บ่อน้ำ */
    private void finalizeBordersAndPond(World world, int half) {
        if (world == null) return;
        clearAllStaleFences(world, centerX, centerZ, floorY, half);
        buildFence(world, centerX, centerZ, floorY, half);
        fillAllFarmPlots(world);
        buildPondRing(world, centerX, centerZ, floorY);
        buildCentralTower(world, centerX, centerZ, floorY);
    }

    /** วางกำแพงหินรอบนา (สไตล์เดียวกับหอคอย) — ขยายแล้วสร้างใหม่ที่ half ใหม่เสมอ */
    private void placeFenceLayer(World world, int half) {
        buildFence(world, centerX, centerZ, floorY, half);
    }

    public static void setFarmlandMoist(World world, int x, int y, int z) {
        Block b = world.getBlockAt(x, y, z);
        try {
            b.setBlockData(org.bukkit.Bukkit.createBlockData("minecraft:farmland[moisture=7]"), false);
        } catch (Throwable t) {
            b.setType(Material.FARMLAND, false);
            try {
                Object data = b.getBlockData();
                var m = data.getClass().getMethod("setMoisture", int.class);
                var max = data.getClass().getMethod("getMaximumMoisture");
                m.invoke(data, max.invoke(data));
                b.setBlockData((org.bukkit.block.data.BlockData) data, false);
            } catch (Throwable ignored) {}
        }
    }

    public void resetCrops(World world) {
        if (world == null) return;
        for (int x = centerX - currentHalf + 1; x <= centerX + currentHalf - 1; x++) {
            for (int z = centerZ - currentHalf + 1; z <= centerZ + currentHalf - 1; z++) {
                if (!isFarmPlotXZ(x, z, centerX, centerZ, currentHalf)) continue;
                set(world, x, floorY, z, Material.FARMLAND);
                setFarmlandMoist(world, x, floorY, z);
                set(world, x, floorY - 1, z, Material.WATER);
                set(world, x, cropY, z, Material.AIR);
            }
        }
        purgeOrphanFarmland(world, centerX, centerZ, floorY, currentHalf);
    }

    /** ขยายนา + รั้ว แนวราบ (X/Z เท่านั้น) · Y ล็อกระดับ flat เดิม */
    public int expand(World world, int steps) {
        if (world == null || !built) return currentHalf;
        clearFarmEntities(world);
        lockFloorToFlat(world);
        int step = Math.max(1, steps) * EXPAND_STEP;
        int old = currentHalf;
        int neu = Math.min(MAX_HALF, old + step);
        if (neu <= old) return old;
        int fy = floorY;
        int minY = world.getMinHeight();

        // จับของแต่งที่ขนาดเก่า แล้วเลื่อนของนอกรั้วตามระยะขยาย
        prepareFarmDecorForResize(world, old, neu);

        // ลบรั้ว/กำแพงเก่าทั้งแถบ (รวมหินชิดใน) กันค้างตำแหน่งเดิม
        clearPerimeterBand(world, old, DecorationStore.FENCE_ATTACH_MARGIN);
        clearAllStaleFences(world, centerX, centerZ, fy, -1);
        clearFence(world, centerX, centerZ, fy, old);
        int padR = neu + OUTER_DIRT_PAD;
        for (int x = centerX - padR; x <= centerX + padR; x++) {
            for (int z = centerZ - padR; z <= centerZ + padR; z++) {
                int cheb = Math.max(Math.abs(x - centerX), Math.abs(z - centerZ));
                if (cheb <= old + 3) continue;
                if (isTowerPondZone(x, z, centerX, centerZ)) continue;
                placeFlatColumn(world, x, z, fy, minY);
                set(world, x, fy, z, Material.GRASS_BLOCK);
            }
        }
        clearHayAndFlowers(world, centerX, centerZ, fy, padR);
        fillFarmlandRing(world, old, neu);
        currentHalf = neu;
        extentHalf = Math.max(extentHalf, neu);
        DecorationStore storeExpand = plugin.getDecorationStore();
        if (storeExpand != null) storeExpand.setFarmSavedHalf(neu);
        fillAllFarmPlots(world);
        buildPondRing(world, centerX, centerZ, fy);
        placeFenceLayer(world, neu);
        decorateOutsideFence(world, centerX, centerZ, fy, neu);
        sealOutsideHoles(world, centerX, centerZ, fy, neu);
        purgeOrphanFarmland(world, centerX, centerZ, fy, neu);
        fillSurfaceHoles(world, centerX, centerZ, fy, neu + OUTER_DIRT_PAD + 8);
        clearFloatingDebris(world, centerX, centerZ, fy, neu);
        restoreDecorations(world);
        finalizeBordersAndPond(world, neu);
        stripOuterPerimeter(world, neu, Math.max(old, extentHalf));
        stripOrphanFenceBits(world, neu);
        return currentHalf;
    }

    /** ลดขนาดนา + รั้ว แนวราบ · Y คงที่ */
    public int shrink(World world, int steps) {
        if (world == null || !built) return currentHalf;
        clearFarmEntities(world);
        lockFloorToFlat(world);
        int step = Math.max(1, steps) * EXPAND_STEP;
        int old = currentHalf;
        int neu = Math.max(MIN_HALF, old - step);
        if (neu >= old) return old;
        int fy = floorY;

        prepareFarmDecorForResize(world, old, neu);

        // ลบรั้ว/กำแพงเก่าทั้งแถบก่อนย่อ
        clearPerimeterBand(world, old, DecorationStore.FENCE_ATTACH_MARGIN);
        clearAllStaleFences(world, centerX, centerZ, fy, -1);
        clearFence(world, centerX, centerZ, fy, old);
        clearStaleBorders(world, centerX, centerZ, fy, neu, old);
        // เคลียร์วงนอกกลับเป็นหญ้าที่ระดับเดิม
        for (int x = centerX - old; x <= centerX + old; x++) {
            for (int z = centerZ - old; z <= centerZ + old; z++) {
                if (Math.abs(x - centerX) < neu && Math.abs(z - centerZ) < neu) continue;
                if (Math.abs(x - centerX) > old || Math.abs(z - centerZ) > old) continue;
                if (isTowerPondZone(x, z, centerX, centerZ)) continue;
                set(world, x, cropY, z, Material.AIR);
                set(world, x, fy, z, Material.GRASS_BLOCK);
                set(world, x, fy - 1, z, Material.DIRT);
                for (int y = fy + 1; y <= fy + 80; y++) {
                    if (isActiveCageBlock(x, y, z)) continue;
                    Material m = world.getBlockAt(x, y, z).getType();
                    if (m == Material.OAK_FENCE || m == Material.OAK_LEAVES || m == Material.LANTERN
                            || m == Material.CHEST || m == Material.HAY_BLOCK || m == Material.STRIPPED_OAK_LOG
                            || m.name().contains("FLOWER") || m == Material.POPPY || m == Material.DANDELION
                            || m == Material.OXEYE_DAISY || m == Material.CORNFLOWER || m == Material.OAK_LOG
                            || m == Material.COBBLESTONE || m == Material.MOSSY_COBBLESTONE
                            || m == Material.OAK_FENCE_GATE || m == Material.SPRUCE_PLANKS
                            || m.name().contains("BRICK") || m.name().contains("_WALL")
                            || m.name().contains("COBBLE") || m.name().contains("GLASS")
                            || isClearablePerimeterMat(m)) {
                        set(world, x, y, z, Material.AIR);
                    }
                }
            }
        }
        currentHalf = neu;
        DecorationStore storeShrink = plugin.getDecorationStore();
        if (storeShrink != null) storeShrink.setFarmSavedHalf(neu);
        fillAllFarmPlots(world);
        buildPondRing(world, centerX, centerZ, fy);
        placeFenceLayer(world, neu);
        decorateOutsideFence(world, centerX, centerZ, fy, neu);
        sealOutsideHoles(world, centerX, centerZ, fy, neu);
        purgeOrphanFarmland(world, centerX, centerZ, fy, neu);
        fillSurfaceHoles(world, centerX, centerZ, fy, old + OUTER_DIRT_PAD + 8);
        clearFloatingDebris(world, centerX, centerZ, fy, neu);
        restoreDecorations(world);
        finalizeBordersAndPond(world, neu);
        stripOuterPerimeter(world, neu, Math.max(old, extentHalf));
        stripOrphanFenceBits(world, neu);
        return currentHalf;
    }

    /**
     * จับของแต่งที่ขนาดรั้วเก่า → เลื่อนรั้ว+ของนอกตาม delta → อัปเดต cache
     * ของในนา (cheb &lt; oldHalf) ไม่ขยับ · รั้ว(==) และนอกรั้วคงระยะ
     */
    private void prepareFarmDecorForResize(World world, int oldHalf, int newHalf) {
        DecorationStore store = plugin.getDecorationStore();
        if (store == null || oldHalf == newHalf) return;
        java.util.List<DecorationStore.SavedBlock> live = store.captureFarmFromWorld(
                world, centerX, centerZ, floorY, oldHalf, OUTER_DIRT_PAD + 16);
        java.util.List<DecorationStore.SavedBlock> base =
                (live != null && !live.isEmpty()) ? live : store.getFarmCached();
        if (base == null || base.isEmpty()) return;
        java.util.List<DecorationStore.SavedBlock> shifted =
                DecorationStore.shiftOutwardWithFence(base, oldHalf, newHalf);
        store.replaceFarmCache(shifted, newHalf);
        store.saveFarmToDisk();
        plugin.getLogger().info("Shifted Farm decorations with fence delta="
                + (newHalf - oldHalf) + " (" + oldHalf + " → " + newHalf + ") blocks=" + shifted.size());
    }

    private void fillFarmlandRing(World world, int fromHalfExclusive, int toHalfInclusive) {
        int cx = centerX;
        int cz = centerZ;
        int fy = floorY;
        for (int x = cx - toHalfInclusive + 1; x <= cx + toHalfInclusive - 1; x++) {
            for (int z = cz - toHalfInclusive + 1; z <= cz + toHalfInclusive - 1; z++) {
                if (!isFarmPlotXZ(x, z, cx, cz, toHalfInclusive)) continue;
                int cheb = Math.max(Math.abs(x - cx), Math.abs(z - cz));
                if (cheb < fromHalfExclusive) continue;
                set(world, x, fy, z, Material.FARMLAND);
                setFarmlandMoist(world, x, fy, z);
                set(world, x, fy - 1, z, Material.WATER);
                set(world, x, cropY, z, Material.AIR);
            }
        }
    }

    private void clearFence(World world, int cx, int cz, int fy, int h) {
        for (int x = cx - h; x <= cx + h; x++) {
            clearFenceColumn(world, x, fy, cz - h);
            clearFenceColumn(world, x, fy, cz + h);
        }
        for (int z = cz - h; z <= cz + h; z++) {
            clearFenceColumn(world, cx - h, fy, z);
            clearFenceColumn(world, cx + h, fy, z);
        }
        clearFenceColumn(world, cx - h, fy, cz - h);
        clearFenceColumn(world, cx + h, fy, cz - h);
        clearFenceColumn(world, cx - h, fy, cz + h);
        clearFenceColumn(world, cx + h, fy, cz + h);
    }

    private void clearFenceColumn(World world, int x, int fy, int z) {
        clearFenceColumn(world, x, fy, z, true);
    }

    private void clearFenceColumn(World world, int x, int fy, int z, boolean preserveCage) {
        int yTop = Math.min(world.getMaxHeight() - 1, fy + 80);
        for (int y = fy; y <= yTop; y++) {
            if (preserveCage && isActiveCageBlock(x, y, z)) continue;
            Material m = world.getBlockAt(x, y, z).getType();
            if (isClearablePerimeterMat(m)) {
                set(world, x, y, z, y == fy ? Material.GRASS_BLOCK : Material.AIR);
            }
        }
    }

    private static boolean isClearablePerimeterMat(Material m) {
        if (m == null || m.isAir()) return false;
        if (m == Material.OAK_FENCE || m == Material.OAK_FENCE_GATE
                || m == Material.COBBLESTONE || m == Material.MOSSY_COBBLESTONE
                || m == Material.STRIPPED_OAK_LOG
                || m == Material.LANTERN || m == Material.SPRUCE_PLANKS
                || m == Material.OAK_LOG || m == Material.OAK_PLANKS
                || m == Material.STONE_BRICKS || m == Material.MOSSY_STONE_BRICKS
                || m == Material.CRACKED_STONE_BRICKS
                || m == Material.STONE_BRICK_WALL || m == Material.STONE
                || m == Material.COBBLESTONE_WALL || m == Material.MOSSY_COBBLESTONE_WALL
                || m == Material.CHAIN || m == Material.IRON_BARS
                || m == Material.GLASS || m == Material.BLUE_STAINED_GLASS
                || m == Material.LIGHT_BLUE_STAINED_GLASS || m == Material.WHITE_STAINED_GLASS
                || m == Material.GLASS_PANE) return true;
        String n = m.name();
        return n.contains("FENCE") || n.contains("BRICK") || n.contains("_WALL")
                || n.contains("COBBLE") || n.contains("STAIRS") || n.contains("CHAIN")
                || n.contains("CONCRETE") || n.contains("TERRACOTTA")
                || n.contains("DEEPSLATE") || n.contains("BLACKSTONE")
                || n.contains("NETHER") || n.contains("PRISMARINE")
                || n.contains("IRON_BARS") || n.contains("GLASS")
                || n.contains("_LOG") || n.contains("_WOOD") || n.contains("BANNER");
    }

    /**
     * ลบรั้ว/กำแพงในแถบติดขอบ (รวมกำแพงหินที่สร้างชิดด้านใน)
     * เรียกหลัง capture แล้ว — กันของเก่าค้างตำแหน่งเดิมตอนขยาย
     */
    private void clearPerimeterBand(World world, int half, int margin) {
        if (world == null || half < 1) return;
        int fy = floorY;
        int from = Math.max(0, half - Math.max(0, margin));
        int to = half + 2;
        for (int x = centerX - to; x <= centerX + to; x++) {
            for (int z = centerZ - to; z <= centerZ + to; z++) {
                int cheb = Math.max(Math.abs(x - centerX), Math.abs(z - centerZ));
                if (cheb < from || cheb > to) continue;
                if (isTowerPondZone(x, z, centerX, centerZ)) continue;
                clearFenceColumn(world, x, fy, z);
            }
        }
    }

    private void buildPondRing(World world, int cx, int cz, int fy) {
        for (int x = cx - POND_OUTER - 1; x <= cx + POND_OUTER + 1; x++) {
            for (int z = cz - POND_OUTER - 1; z <= cz + POND_OUTER + 1; z++) {
                int cheb = Math.max(Math.abs(x - cx), Math.abs(z - cz));
                if (cheb <= BASE_R || cheb > POND_OUTER) continue;
                boolean axis = x == cx || z == cz;
                if (cheb == POND_OUTER) {
                    set(world, x, fy, z, mixBrick(x, fy, z));
                    set(world, x, fy + 1, z, Material.AIR);
                    if (!axis && (Math.abs(x - cx) == POND_OUTER || Math.abs(z - cz) == POND_OUTER)
                            && ((x + z) & 1) == 0) {
                        set(world, x, fy + 1, z, Material.STONE_BRICK_WALL);
                    }
                    if (axis) set(world, x, fy, z, Material.STRIPPED_SPRUCE_LOG);
                } else if (axis) {
                    set(world, x, fy, z, Material.SPRUCE_PLANKS);
                    set(world, x, fy + 1, z, Material.AIR);
                    if (cheb == BASE_R + 1 || cheb == POND_OUTER - 1) {
                        set(world, x, fy, z, Material.STRIPPED_SPRUCE_LOG);
                    }
                } else {
                    set(world, x, fy - 1, z, Material.CLAY);
                    set(world, x, fy, z, Material.WATER);
                    set(world, x, fy + 1, z, Material.AIR);
                    if ((x + z) % 5 == 0) set(world, x, fy + 1, z, Material.LILY_PAD);
                    if ((x * 3 + z) % 9 == 0) set(world, x, fy - 1, z, Material.SEAGRASS);
                    if ((x + z * 2) % 13 == 0) set(world, x, fy - 1, z, Material.SEA_LANTERN);
                }
            }
        }
        placeLantern(world, cx + POND_OUTER, fy, cz + POND_OUTER);
        placeLantern(world, cx - POND_OUTER, fy, cz + POND_OUTER);
        placeLantern(world, cx + POND_OUTER, fy, cz - POND_OUTER);
        placeLantern(world, cx - POND_OUTER, fy, cz - POND_OUTER);
    }

    private void placeLantern(World world, int x, int fy, int z) {
        set(world, x, fy, z, mixBrick(x, fy, z));
        set(world, x, fy + 1, z, Material.STONE_BRICK_WALL);
        set(world, x, fy + 2, z, Material.LANTERN);
    }

    private Material mixBrick(int x, int y, int z) {
        int h = Math.floorMod(x * 31 + y * 17 + z * 13, 8);
        if (h == 0) return Material.MOSSY_STONE_BRICKS;
        if (h == 1) return Material.CRACKED_STONE_BRICKS;
        if (h == 2) return Material.MOSSY_STONE_BRICKS;
        if (h == 3) return Material.MOSSY_COBBLESTONE;
        return Material.STONE_BRICKS;
    }

    private void setHangingLantern(World world, int x, int y, int z) {
        set(world, x, y, z, Material.CHAIN);
        Block b = world.getBlockAt(x, y - 1, z);
        b.setType(Material.LANTERN, false);
        try {
            if (b.getBlockData() instanceof Lantern lantern) {
                lantern.setHanging(true);
                b.setBlockData(lantern, false);
            }
        } catch (Throwable ignored) {}
    }

    private void setStair(World world, int x, int y, int z, BlockFace face) {
        Block b = world.getBlockAt(x, y, z);
        b.setType(Material.STONE_BRICK_STAIRS, false);
        try {
            if (b.getBlockData() instanceof Stairs stairs) {
                stairs.setFacing(face);
                b.setBlockData(stairs, false);
            }
        } catch (Throwable ignored) {}
    }

    private void setVine(World world, int x, int y, int z, BlockFace attached) {
        Block b = world.getBlockAt(x, y, z);
        if (!b.getType().isAir() && b.getType() != Material.VINE) return;
        b.setType(Material.VINE, false);
        try {
            if (b.getBlockData() instanceof MultipleFacing mf) {
                for (BlockFace f : mf.getAllowedFaces()) mf.setFace(f, false);
                if (mf.getAllowedFaces().contains(attached)) mf.setFace(attached, true);
                b.setBlockData(mf, false);
            }
        } catch (Throwable ignored) {}
    }

    /**
     * หอคอยวงกลมต่อเนื่องบนฐานสี่เหลี่ยม — เชิงเทิน · ประตู 4 ทิศ · หน้าต่างกระจก
     */
    private void buildCentralTower(World world, int cx, int cz, int fy) {
        int base = BASE_R;
        int r = TOWER_R;
        int h = TOWER_HEIGHT;
        int top = fy + h;
        int plinthTop = fy + 2;

        for (int x = cx - base - 2; x <= cx + base + 2; x++) {
            for (int z = cz - base - 2; z <= cz + base + 2; z++) {
                for (int y = fy + 1; y <= top + 6; y++) {
                    set(world, x, y, z, Material.AIR);
                }
            }
        }

        // ฐานสี่เหลี่ยมตัน fy..fy+2 แล้วต่อผนังวงกลม + เสาเชื่อมมุม ไม่มีช่องว่าง
        for (int x = cx - base; x <= cx + base; x++) {
            for (int z = cz - base; z <= cz + base; z++) {
                int dx = x - cx;
                int dz = z - cz;
                int cheb = Math.max(Math.abs(dx), Math.abs(dz));
                boolean wall = cheb == base;
                set(world, x, fy, z, mixBrick(x, fy, z));
                if (wall) set(world, x, fy - 1, z, Material.MOSSY_COBBLESTONE);
                for (int y = fy + 1; y <= plinthTop; y++) {
                    if (wall) set(world, x, y, z, mixBrick(x, y, z));
                    else if (y == fy + 1) set(world, x, y, z, Material.SPRUCE_PLANKS);
                    else set(world, x, y, z, Material.AIR);
                }
            }
        }

        for (int x = cx - r - 1; x <= cx + r + 1; x++) {
            for (int z = cz - r - 1; z <= cz + r + 1; z++) {
                int dx = x - cx;
                int dz = z - cz;
                boolean shell = isCircleShell(dx, dz, r);
                boolean buttress = isCircleButtress(dx, dz, r);
                boolean core = inCircle(dx, dz, r);
                if (!shell && !buttress && !core) continue;
                for (int y = plinthTop; y < top; y++) {
                    if (shell || buttress) set(world, x, y, z, mixBrick(x, y, z));
                    else if (y == plinthTop || y == fy + 7) set(world, x, y, z, Material.SPRUCE_PLANKS);
                    else set(world, x, y, z, Material.AIR);
                }
            }
        }

        Material[] banners = {
                Material.RED_BANNER, Material.LIME_BANNER, Material.YELLOW_BANNER, Material.ORANGE_BANNER
        };
        int[] winY = {fy + 6, fy + 7, fy + 10, fy + 11};
        int bi = 0;
        for (int[] d : CARDINAL) {
            int bx = cx + d[0] * base;
            int bz = cz + d[1] * base;
            set(world, bx, fy + 1, bz, Material.AIR);
            set(world, bx, fy + 2, bz, Material.AIR);
            set(world, bx, fy + 3, bz, Material.SPRUCE_TRAPDOOR);
            int ox = cx + d[0] * (base + 1);
            int oz = cz + d[1] * (base + 1);
            setStair(world, ox, fy, oz, faceTowardOrigin(d[0] * (base + 1), d[1] * (base + 1)));
            BlockFace vineFace = faceTowardOrigin(-d[0], -d[1]);
            for (int vy = fy + 2; vy <= fy + 5; vy++) {
                if (((bx + bz + vy) & 1) == 0) setVine(world, ox, vy, oz, vineFace);
            }

            int tx = cx + d[0] * r;
            int tz = cz + d[1] * r;
            for (int y : winY) {
                if (inCircle(tx - cx, tz - cz, r)) {
                    set(world, tx, y, tz, (y >= fy + 10) ? Material.IRON_BARS : Material.GLASS);
                }
            }
            setHangingLantern(world, tx, top + 2, tz);
            if (bi < banners.length) set(world, tx, top + 1, tz, banners[bi]);
            bi++;
        }

        for (int i = 0; i < h - 1; i++) {
            int yy = fy + 1 + i;
            int sx = cx - 1;
            int sz = cz - 1;
            if (inTowerColumn(sx - cx, sz - cz, r)) {
                set(world, sx, yy, sz, mixBrick(sx, yy, sz));
                if (i + 1 < h - 1) set(world, sx, yy + 1, sz, Material.AIR);
            }
        }

        set(world, cx + 1, fy + 1, cz + 1, Material.HAY_BLOCK);
        set(world, cx + 1, fy + 2, cz + 1, Material.LANTERN);
        set(world, cx, fy + 1, cz, Material.BARREL);
        set(world, cx - 1, fy + 1, cz + 1, Material.CRAFTING_TABLE);

        // ดาดฟ้าต่อเนื่อง + เชิงเทิน (รวมเสาเชื่อมมุม)
        for (int x = cx - r - 1; x <= cx + r + 1; x++) {
            for (int z = cz - r - 1; z <= cz + r + 1; z++) {
                int dx = x - cx;
                int dz = z - cz;
                if (!inTowerColumn(dx, dz, r)) continue;
                set(world, x, top, z, mixBrick(x, top, z));
                if (isCircleShell(dx, dz, r) || isCircleButtress(dx, dz, r)) {
                    set(world, x, top + 1, z, Material.STONE_BRICK_WALL);
                } else if (((x + z) & 5) == 0) {
                    set(world, x, top + 1, z, Material.MOSS_CARPET);
                }
            }
        }
        for (int x = cx - r - 1; x <= cx + r + 1; x++) {
            for (int z = cz - r - 1; z <= cz + r + 1; z++) {
                int dx = x - cx;
                int dz = z - cz;
                if (inTowerColumn(dx, dz, r)) continue;
                boolean nextTo = inTowerColumn(dx + 1, dz, r) || inTowerColumn(dx - 1, dz, r)
                        || inTowerColumn(dx, dz + 1, r) || inTowerColumn(dx, dz - 1, r);
                if (!nextTo) continue;
                setStair(world, x, top, z, faceTowardOrigin(dx, dz));
            }
        }

        set(world, cx, top + 1, cz, Material.GOLD_BLOCK);
        set(world, cx, top + 2, cz, Material.SEA_LANTERN);
        set(world, cx, top + 3, cz, Material.LANTERN);
        set(world, cx, top - 1, cz, Material.BELL);
        clearHelperStand(world);
    }

    /**
     * กำแพงหินรอบนา — ข้ามโซนหอ/คูน้ำเมื่อย่อเล็กจนทับกลาง
     */
    private void buildFence(World world, int cx, int cz, int fy, int h) {
        h = Math.max(MIN_HALF, h);
        for (int x = cx - h; x <= cx + h; x++) {
            if (!isTowerPondZone(x, cz - h, cx, cz) && !isFenceCornerAt(x, cz - h, h, cx, cz)) {
                placeUniformWallColumn(world, x, fy, cz - h);
            }
            if (!isTowerPondZone(x, cz + h, cx, cz) && !isFenceCornerAt(x, cz + h, h, cx, cz)) {
                placeUniformWallColumn(world, x, fy, cz + h);
            }
        }
        for (int z = cz - h + 1; z <= cz + h - 1; z++) {
            if (!isTowerPondZone(cx - h, z, cx, cz)) placeUniformWallColumn(world, cx - h, fy, z);
            if (!isTowerPondZone(cx + h, z, cx, cz)) placeUniformWallColumn(world, cx + h, fy, z);
        }
        if (!isTowerPondZone(cx - h, cz - h, cx, cz)) placeUniformCorner(world, cx - h, fy, cz - h);
        if (!isTowerPondZone(cx + h, cz - h, cx, cz)) placeUniformCorner(world, cx + h, fy, cz - h);
        if (!isTowerPondZone(cx - h, cz + h, cx, cz)) placeUniformCorner(world, cx - h, fy, cz + h);
        if (!isTowerPondZone(cx + h, cz + h, cx, cz)) placeUniformCorner(world, cx + h, fy, cz + h);
    }

    private static boolean isFenceCornerAt(int x, int z, int h, int cx, int cz) {
        return Math.abs(x - cx) == h && Math.abs(z - cz) == h;
    }

    /** คอลัมน์กำแพง: อิฐผสมมอส 3 ชั้น + หัว wall / โคมเป็นระยะ */
    private void placeUniformWallColumn(World world, int x, int fy, int z) {
        set(world, x, fy, z, mixBrick(x, fy, z));
        set(world, x, fy + 1, z, mixBrick(x, fy + 1, z));
        set(world, x, fy + 2, z, mixBrick(x, fy + 2, z));
        boolean lantern = !isFenceCorner(x, z) && Math.floorMod(x + z, 8) == 0;
        set(world, x, fy + 3, z, lantern ? Material.LANTERN : Material.STONE_BRICK_WALL);
        set(world, x, fy + 4, z, Material.AIR);
        set(world, x, fy + 5, z, Material.AIR);
    }

    private boolean isFenceCorner(int x, int z) {
        return Math.abs(x - centerX) == currentHalf && Math.abs(z - centerZ) == currentHalf;
    }

    private void placeUniformCorner(World world, int x, int fy, int z) {
        for (int y = fy; y <= fy + 4; y++) {
            set(world, x, y, z, mixBrick(x, y, z));
        }
        set(world, x, fy + 5, z, Material.STONE_BRICK_WALL);
        set(world, x, fy + 6, z, Material.LANTERN);
        set(world, x, fy + 7, z, Material.AIR);
    }

    private void placeSnowballCaches(World world, int cx, int cz, int fy, int half) {
        // ไม่วางหีบในพื้นที่ปลูกแล้ว — ของไม่จำกัดจาก kit
    }

    /** ไม่วางฟาง/ดอกไม้ — เคลียร์ของเก่า + ต้นไม้ + อุดหลุมนอกรั้ว */
    private void decorateOutsideFence(World world, int cx, int cz, int fy, int half) {
        clearHayAndFlowers(world, cx, cz, fy, half + OUTER_DIRT_PAD);
        clearTreesNear(world, cx, cz, fy, half + 6);
        sealOutsideHoles(world, cx, cz, fy, half);
    }

    /**
     * อุดหลุมนอกรั้ว: เติมดินใต้พื้น + หญ้าที่ผิว ใน OUTER_DIRT_PAD
     * ไม่แตะรั้ว / ในนา / หอ
     */
    private void sealOutsideHoles(World world, int cx, int cz, int fy, int half) {
        if (world == null) return;
        int minY = world.getMinHeight();
        int padR = half + OUTER_DIRT_PAD;
        for (int x = cx - padR; x <= cx + padR; x++) {
            for (int z = cz - padR; z <= cz + padR; z++) {
                boolean onFence = (Math.abs(x - cx) == half && Math.abs(z - cz) <= half)
                        || (Math.abs(z - cz) == half && Math.abs(x - cx) <= half);
                if (onFence) continue;
                if (Math.abs(x - cx) < half && Math.abs(z - cz) < half) continue;

                set(world, x, minY, z, Material.BEDROCK);
                for (int y = minY + 1; y < fy; y++) {
                    Material m = world.getBlockAt(x, y, z).getType();
                    if (m.isAir() || m == Material.CAVE_AIR || m == Material.VOID_AIR
                            || m == Material.WATER || m == Material.LAVA
                            || m.name().contains("FIRE")) {
                        set(world, x, y, z, Material.DIRT);
                    }
                }
                Material top = world.getBlockAt(x, fy, z).getType();
                if (top.isAir() || top == Material.CAVE_AIR || top == Material.VOID_AIR
                        || top == Material.WATER || top == Material.LAVA
                        || top == Material.FARMLAND || top.name().contains("FIRE")
                        || top == Material.DIRT || top == Material.COARSE_DIRT) {
                    set(world, x, fy, z, Material.GRASS_BLOCK);
                }
            }
        }
    }

    private void clearHayAndFlowers(World world, int cx, int cz, int fy, int r) {
        for (int x = cx - r; x <= cx + r; x++) {
            for (int z = cz - r; z <= cz + r; z++) {
                for (int y = fy + 1; y <= fy + 3; y++) {
                    Material m = world.getBlockAt(x, y, z).getType();
                    if (m == Material.HAY_BLOCK || m == Material.POPPY || m == Material.DANDELION
                            || m == Material.OXEYE_DAISY || m == Material.CORNFLOWER
                            || m == Material.SHORT_GRASS || m == Material.TALL_GRASS
                            || m.name().contains("FLOWER") || m.name().endsWith("_TULIP")) {
                        set(world, x, y, z, Material.AIR);
                    }
                }
            }
        }
    }

    private void clearTreesNear(World world, int cx, int cz, int fy, int r) {
        for (int x = cx - r; x <= cx + r; x++) {
            for (int z = cz - r; z <= cz + r; z++) {
                for (int y = fy; y <= fy + 8; y++) {
                    Material m = world.getBlockAt(x, y, z).getType();
                    if (m == Material.OAK_LOG || m == Material.OAK_LEAVES || m == Material.BIRCH_LOG
                            || m == Material.BIRCH_LEAVES || m.name().contains("_LOG") || m.name().contains("_LEAVES")) {
                        set(world, x, y, z, y == fy ? Material.GRASS_BLOCK : Material.AIR);
                    }
                }
            }
        }
    }

    private void decorateCorners(World world, int cx, int cz, int fy, int half) {
        decorateOutsideFence(world, cx, cz, fy, half);
    }

    public int saveDecorationsNow() {
        World world = farmSpawn != null ? farmSpawn.getWorld() : null;
        if (world == null) {
            for (org.bukkit.entity.Player p : org.bukkit.Bukkit.getOnlinePlayers()) {
                if (isFarmWorld(p.getWorld())) {
                    world = p.getWorld();
                    break;
                }
            }
        }
        if (world == null) {
            plugin.getLogger().warning("Farm save failed: no farm world");
            return 0;
        }
        if (!built) {
            lockFloorToFlat(world);
            if (world.getSpawnLocation() != null) {
                centerX = world.getSpawnLocation().getBlockX();
                centerZ = world.getSpawnLocation().getBlockZ();
            }
            built = true;
        }
        // sync ขนาดรั้วจากของจริง — ไม่ rebuild ทับของแต่งก่อนเซฟ
        int detected = detectFenceHalf(world);
        if (detected >= MIN_HALF && detected != currentHalf) {
            int old = currentHalf;
            currentHalf = detected;
            extentHalf = Math.max(extentHalf, detected);
            if (detected > old) {
                fillFarmlandRing(world, old, detected);
            }
            plugin.getLogger().info("Farm fence save synced half " + old + " → " + detected);
        }
        return plugin.getDecorationStore().snapshotAndSaveFarm(
                world, centerX, centerZ, floorY, currentHalf, OUTER_DIRT_PAD + 16);
    }

    /**
     * หา half จากรั้วในโลก (ขอบ OAK_FENCE / COBBLESTONE ห่างศูนย์กลาง)
     * ใช้ตอนแอดมินเลื่อนรั้วแล้ว /tokcontrol save
     */
    public int detectFenceHalf(World world) {
        if (world == null || !built) return currentHalf;
        int fy = floorY;
        int best = MIN_HALF - 1;
        for (int h = MIN_HALF; h <= Math.min(MAX_HALF, extentHalf + 64); h++) {
            int hits = 0;
            if (isFenceLike(world.getBlockAt(centerX + h, fy + 1, centerZ).getType())
                    || isFenceLike(world.getBlockAt(centerX + h, fy, centerZ).getType())) hits++;
            if (isFenceLike(world.getBlockAt(centerX - h, fy + 1, centerZ).getType())
                    || isFenceLike(world.getBlockAt(centerX - h, fy, centerZ).getType())) hits++;
            if (isFenceLike(world.getBlockAt(centerX, fy + 1, centerZ + h).getType())
                    || isFenceLike(world.getBlockAt(centerX, fy, centerZ + h).getType())) hits++;
            if (isFenceLike(world.getBlockAt(centerX, fy + 1, centerZ - h).getType())
                    || isFenceLike(world.getBlockAt(centerX, fy, centerZ - h).getType())) hits++;
            // มุม
            if (isFenceLike(world.getBlockAt(centerX + h, fy + 1, centerZ + h).getType())) hits++;
            if (hits >= 2) best = h;
        }
        return best >= MIN_HALF ? best : currentHalf;
    }

    private static boolean isFenceLike(Material m) {
        return isClearablePerimeterMat(m);
    }

    /**
     * รีเซ็ตนาหลังชนะ — กลับขนาดเริ่มต้น · ผู้เล่นนอกรั้วใหม่วาร์ปกลับสปอน
     */
    public void resetMapAfterWin(World world) {
        if (world == null) return;
        int oldHalf = currentHalf > 0 ? currentHalf : DEFAULT_HALF;
        int oldExtent = Math.max(extentHalf, oldHalf);
        int startHalf = DEFAULT_HALF;
        if (oldHalf != startHalf) {
            prepareFarmDecorForResize(world, oldHalf, startHalf);
        }
        DecorationStore store = plugin.getDecorationStore();
        if (store != null) store.setFarmSavedHalf(startHalf);
        buildFarm(world, false, startHalf);
        if (farmSpawn != null) {
            int h = currentHalf;
            for (Player p : world.getPlayers()) {
                int dx = Math.abs(p.getLocation().getBlockX() - centerX);
                int dz = Math.abs(p.getLocation().getBlockZ() - centerZ);
                if (Math.max(dx, dz) > h) {
                    p.teleport(farmSpawn);
                }
            }
        }
        int scanOut = Math.max(oldExtent, currentHalf) + 8;
        purgeOrphanFarmland(world, centerX, centerZ, floorY, currentHalf);
        stripOuterPerimeter(world, currentHalf, oldExtent);
        clearStaleBorders(world, centerX, centerZ, floorY, currentHalf, oldExtent);
        clearAllStaleFences(world, centerX, centerZ, floorY, currentHalf, scanOut);
        fillSurfaceHoles(world, centerX, centerZ, floorY, Math.max(oldExtent, currentHalf) + OUTER_DIRT_PAD + 16);
        finalizeBordersAndPond(world, currentHalf);
        stripOuterPerimeter(world, currentHalf, oldExtent);
        stripOrphanFenceBits(world, currentHalf);
        plugin.getLogger().info("Farm win reset " + oldHalf + " → " + currentHalf
                + " (cleared outer fences to " + oldExtent + ")");
    }

    /** เติมดิน/หญ้าให้หลุมที่โชว์ bedrock หรืออากาศที่ระดับพื้น */
    public int fillSurfaceHoles(World world, int cx, int cz, int fy, int radius) {
        if (world == null) return 0;
        int minY = world.getMinHeight();
        int filled = 0;
        for (int x = cx - radius; x <= cx + radius; x++) {
            for (int z = cz - radius; z <= cz + radius; z++) {
                // ห้ามถมทับบ่อน้ำ / ฐานหอ
                if (isTowerPondZone(x, z, cx, cz)) continue;
                Material top = world.getBlockAt(x, fy, z).getType();
                // น้ำที่ระดับพื้น = บ่อ/ของแต่ง — ไม่ถือเป็นหลุม (เดิมถมทับบ่อรอบหอ)
                boolean hole = top.isAir() || top == Material.CAVE_AIR || top == Material.VOID_AIR
                        || top == Material.BEDROCK || top == Material.LAVA;
                boolean underBroken = false;
                for (int y = minY + 1; y < fy; y++) {
                    Material m = world.getBlockAt(x, y, z).getType();
                    // น้ำใต้ farmland เป็นระบบชลประทาน — ไม่ใช่หลุม
                    if (m.isAir() || m == Material.CAVE_AIR || m == Material.VOID_AIR
                            || m == Material.LAVA) {
                        underBroken = true;
                        break;
                    }
                }
                if (world.getBlockAt(x, fy, z).getType() == Material.BEDROCK) hole = true;
                if (hole || underBroken) {
                    placeFlatColumn(world, x, z, fy, minY);
                    if (isFarmPlotXZ(x, z, cx, cz, currentHalf)) {
                        set(world, x, fy - 1, z, Material.WATER);
                        setFarmlandMoist(world, x, fy, z);
                    } else {
                        set(world, x, fy, z, Material.GRASS_BLOCK);
                    }
                    filled++;
                }
            }
        }
        if (filled > 0) {
            plugin.getLogger().info("Filled " + filled + " surface holes around farm");
        }
        return filled;
    }

    public int fillSurfaceHoles(World world) {
        if (world == null || !built) return 0;
        int r = Math.max(extentHalf, currentHalf) + OUTER_DIRT_PAD + 24;
        return fillSurfaceHoles(world, centerX, centerZ, floorY, r);
    }

    public void restoreDecorations(World world) {
        if (world == null) return;
        DecorationStore store = plugin.getDecorationStore();
        if (store == null || store.farmSize() <= 0) return;
        store.pasteFarm(world, centerX, centerZ, floorY, currentHalf, store.getFarmCached());
    }

    /**
     * ลบโครงสร้างลอยนอกรั้ว / นอกหอกลาง (เช่น ตึก deepslate ที่แปะจาก decorations)
     * เก็บหอคอยกลาง + รั้ว + โคมไฟใกล้พื้น
     */
    public int clearFloatingDebris(World world) {
        if (world == null || !built) return 0;
        return clearFloatingDebris(world, centerX, centerZ, floorY, currentHalf);
    }

    /**
     * ลบโครงสร้างลอยรอบฟาร์ม — ไม่แตะหอคอย · กำแพง · โคมบ่อ
     */
    public int clearFloatingDebris(World world, int cx, int cz, int fy, int half) {
        if (world == null) return 0;
        int padR = Math.max(half + OUTER_DIRT_PAD + 48, 160);
        // เริ่มสูงกว่ากำแพง/มุม/หอ — ไม่ตัดหัวกำแพง
        int y0 = fy + TOWER_HEIGHT + 6;
        int y1 = Math.min(world.getMaxHeight() - 1, fy + 120);
        int cleared = 0;
        for (int x = cx - padR; x <= cx + padR; x++) {
            for (int z = cz - padR; z <= cz + padR; z++) {
                // เก็บหอคอย + บ่อ
                if (isTowerPondZone(x, z, cx, cz)) continue;
                // เก็บแนวกำแพงและแถบนอกรั้วติดกำแพง
                int cheb = Math.max(Math.abs(x - cx), Math.abs(z - cz));
                if (cheb >= half - 1 && cheb <= half + 3) continue;

                for (int y = y0; y <= y1; y++) {
                    Block b = world.getBlockAt(x, y, z);
                    Material m = b.getType();
                    if (m.isAir() || m == Material.CAVE_AIR || m == Material.VOID_AIR) continue;
                    b.setType(Material.AIR, false);
                    cleared++;
                }
            }
        }
        if (cleared > 0) {
            plugin.getLogger().info("Cleared " + cleared + " floating debris blocks above farm");
        }
        return cleared;
    }

    private void plantTree(World world, int x, int fy, int z) {
        set(world, x, fy, z, Material.DIRT);
        for (int y = 1; y <= 4; y++) set(world, x, fy + y, z, Material.OAK_LOG);
        for (int dx = -2; dx <= 2; dx++) {
            for (int dz = -2; dz <= 2; dz++) {
                for (int dy = 3; dy <= 5; dy++) {
                    if (Math.abs(dx) + Math.abs(dz) + (dy - 3) > 4) continue;
                    if (dx == 0 && dz == 0 && dy < 5) continue;
                    set(world, x + dx, fy + dy, z + dz, Material.OAK_LEAVES);
                }
            }
        }
    }

    public void teleportPlayers(World world) {
        if (farmSpawn == null) return;
        for (Player p : plugin.getServer().getOnlinePlayers()) {
            if (p.getWorld().equals(world)) {
                p.teleport(farmSpawn);
                plugin.enablePlayerFlight(p);
            }
        }
    }

    private int findGroundY(World world, int x, int z) {
        int min = world.getMinHeight();
        int max = Math.min(world.getMaxHeight() - 2, 120);
        for (int y = max; y >= min; y--) {
            Material m = world.getBlockAt(x, y, z).getType();
            if (m.isSolid() && !m.name().contains("LEAVES") && m != Material.BEDROCK) return y;
        }
        return 4;
    }

    /**
     * Remove farm cows/villagers/mobs (tagged + untagged leftovers).
     * Block wipe alone does not despawn entities.
     */
    public void clearFarmEntities(World world) {
        if (world == null) return;
        int removed = 0;
        for (Entity e : new ArrayList<>(world.getEntities())) {
            if (e == null || e instanceof Player) continue;
            boolean drop = false;
            for (String tag : e.getScoreboardTags()) {
                if (tag != null && tag.startsWith("tc_farm")) {
                    drop = true;
                    break;
                }
            }
            if (!drop && (e instanceof Cow || e instanceof Villager)) {
                drop = true;
            }
            if (drop) {
                try {
                    e.remove();
                    removed++;
                } catch (Exception ignored) {}
            }
        }
        if (removed > 0) {
            plugin.getLogger().info("Cleared " + removed + " farm entities (cows/villagers/tagged)");
        }
    }

    private void clearBox(World world, int x1, int x2, int z1, int z2, int y1, int y2) {
        for (int x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
            for (int z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) {
                for (int y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
                    set(world, x, y, z, Material.AIR);
                }
            }
        }
    }

    private static void set(World world, int x, int y, int z, Material mat) {
        Block b = world.getBlockAt(x, y, z);
        if (b.getType() != mat) b.setType(mat, false);
    }
}
