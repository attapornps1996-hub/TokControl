package com.tokcontrol.minecraft;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.Particle;
import org.bukkit.World;
import org.bukkit.block.Block;

import java.util.ArrayList;
import java.util.List;

/**
 * Tower Wars — ป้อมฟ้า/แดง ห่าง 150 บล็อก · กำแพงชั้นนอก + ปราสาทชั้นใน (แนวภาพอ้างอิง)
 */
public final class TowerCastleBuilder {

    public static final int CASTLE_GAP = 150;
    public static final int HALF_GAP = CASTLE_GAP / 2; // 75

    private final TokControlPlugin plugin;
    private int floorY = 64;
    private int centerX;
    private int centerZ;
    private Location blueSpawn;
    private Location redSpawn;
    private Location blueKingPos;
    private Location redKingPos;
    private Location midSpawn;
    private Location overlook;
    private boolean built;

    /** ประตูชั้นนอกที่ระเบิดได้ตาม stage */
    private final List<int[]> blueOuterGate = new ArrayList<>();
    private final List<int[]> redOuterGate = new ArrayList<>();
    private final List<int[]> blueInnerGate = new ArrayList<>();
    private final List<int[]> redInnerGate = new ArrayList<>();

    public TowerCastleBuilder(TokControlPlugin plugin) {
        this.plugin = plugin;
    }

    public static boolean isTowerWorld(World world) {
        if (world == null) return false;
        String n = world.getName().toLowerCase();
        return n.contains("tower") || n.contains("castle");
    }

    public boolean isBuilt() { return built; }
    public int getFloorY() { return floorY; }
    public Location getBlueSpawn() { return blueSpawn; }
    public Location getRedSpawn() { return redSpawn; }
    public Location getBlueKingPos() { return blueKingPos; }
    public Location getRedKingPos() { return redKingPos; }
    public Location getMidSpawn() { return midSpawn; }
    public Location getOverlook() { return overlook; }
    public int getCenterX() { return centerX; }
    public int getCenterZ() { return centerZ; }

    public int findGroundY(World world, int x, int z) {
        int min = world.getMinHeight() + 1;
        int max = Math.min(world.getMaxHeight() - 2, 180);
        for (int y = max; y >= min; y--) {
            Material m = world.getBlockAt(x, y, z).getType();
            Material above = world.getBlockAt(x, y + 1, z).getType();
            if (m.isSolid() && !m.name().contains("LEAVES") && (above.isAir() || !above.isSolid())) {
                return y;
            }
        }
        return 64;
    }

    public void buildArena(World world) {
        if (world == null) return;
        blueOuterGate.clear();
        redOuterGate.clear();
        blueInnerGate.clear();
        redInnerGate.clear();

        centerX = 0;
        centerZ = 0;
        if (world.getSpawnLocation() != null) {
            centerX = world.getSpawnLocation().getBlockX();
            centerZ = world.getSpawnLocation().getBlockZ();
        }
        floorY = findGroundY(world, centerX, centerZ);
        int cx = centerX;
        int cz = centerZ;
        int fy = floorY;

        int blueZ = cz - HALF_GAP;
        int redZ = cz + HALF_GAP;

        clearBox(world, cx - 36, cx + 36, cz - HALF_GAP - 28, cz + HALF_GAP + 28, fy - 1, fy + 40);
        buildBattlefield(world, cx, cz, fy);

        buildFactionComplex(world, cx, blueZ, fy, true);
        buildFactionComplex(world, cx, redZ, fy, false);

        blueKingPos = new Location(world, cx + 0.5, fy + 3, blueZ + 0.5);
        redKingPos = new Location(world, cx + 0.5, fy + 3, redZ + 0.5);
        // จุดเสกทหาร — นอกกำแพงชั้นนอก หันเข้ากลาง
        blueSpawn = new Location(world, cx + 0.5, fy + 2, blueZ + 22.5, 0f, 0f);
        redSpawn = new Location(world, cx + 0.5, fy + 2, redZ - 22.5, 180f, 0f);
        midSpawn = new Location(world, cx + 0.5, fy + 2, cz + 0.5, 0f, 0f);
        overlook = new Location(world, cx + 0.5, fy + 28, cz + 0.5, 0f, 40f);

        world.setSpawnLocation(overlook);
        built = true;
        plugin.getLogger().info("Tower Wars arena — gap=" + CASTLE_GAP + " blueZ=" + blueZ + " redZ=" + redZ);
    }

    private void buildBattlefield(World world, int cx, int cz, int fy) {
        int minZ = cz - HALF_GAP - 26;
        int maxZ = cz + HALF_GAP + 26;
        int minX = cx - 32;
        int maxX = cx + 32;

        fill(world, minX, maxX, minZ, maxZ, fy, fy, Material.GRASS_BLOCK);
        // สะพานกลาง / ทางบุก
        fill(world, cx - 4, cx + 4, minZ, maxZ, fy, fy, Material.STONE_BRICKS);
        fill(world, cx - 2, cx + 2, minZ, maxZ, fy, fy, Material.POLISHED_ANDESITE);
        fill(world, minX, maxX, cz - 1, cz + 1, fy, fy, Material.SMOOTH_STONE);
        set(world, cx, fy + 1, cz, Material.BEACON);

        int wallTop = fy + 14;
        fill(world, minX, maxX, minZ, minZ, fy, wallTop, Material.BEDROCK);
        fill(world, minX, maxX, maxZ, maxZ, fy, wallTop, Material.BEDROCK);
        fill(world, minX, minX, minZ, maxZ, fy, wallTop, Material.BEDROCK);
        fill(world, maxX, maxX, minZ, maxZ, fy, wallTop, Material.BEDROCK);
        fill(world, minX, maxX, minZ, maxZ, fy - 1, fy - 1, Material.BEDROCK);
    }

    /**
     * คอมเพล็กซ์ป้อม: กำแพงชั้นนอก (bailey) + ประตู + ปราสาทชั้นใน (keep)
     */
    private void buildFactionComplex(World world, int cx, int cz, int fy, boolean blue) {
        Material primary = blue ? Material.CYAN_CONCRETE : Material.RED_CONCRETE;
        Material accent = blue ? Material.LIGHT_BLUE_CONCRETE : Material.RED_TERRACOTTA;
        Material trim = blue ? Material.DARK_PRISMARINE : Material.NETHER_BRICKS;
        Material glass = blue ? Material.LIGHT_BLUE_STAINED_GLASS : Material.RED_STAINED_GLASS;
        Material banner = blue ? Material.BLUE_BANNER : Material.RED_BANNER;
        Material lamp = blue ? Material.SEA_LANTERN : Material.SHROOMLIGHT;
        Material wallStone = blue ? Material.PRISMARINE_BRICKS : Material.RED_NETHER_BRICKS;

        // ─── กำแพงชั้นนอก (bailey) 18x18 ────────────────────────────────
        int oMinX = cx - 14;
        int oMaxX = cx + 14;
        int oMinZ = cz - 14;
        int oMaxZ = cz + 14;
        int outerH = fy + 10;

        // พื้นลานนอก
        fill(world, oMinX, oMaxX, oMinZ, oMaxZ, fy, fy + 1, wallStone);
        fill(world, oMinX + 1, oMaxX - 1, oMinZ + 1, oMaxZ - 1, fy + 1, fy + 1, Material.STONE_BRICKS);

        // กำแพงรอบ
        for (int y = fy + 2; y <= outerH; y++) {
            Material w = (y == outerH) ? trim : wallStone;
            fill(world, oMinX, oMaxX, oMinZ, oMinZ, y, y, w);
            fill(world, oMinX, oMaxX, oMaxZ, oMaxZ, y, y, w);
            fill(world, oMinX, oMinX, oMinZ, oMaxZ, y, y, w);
            fill(world, oMaxX, oMaxX, oMinZ, oMaxZ, y, y, w);
        }
        // เชิงเทิน
        for (int x = oMinX; x <= oMaxX; x += 2) {
            set(world, x, outerH + 1, oMinZ, trim);
            set(world, x, outerH + 1, oMaxZ, trim);
        }
        for (int z = oMinZ; z <= oMaxZ; z += 2) {
            set(world, oMinX, outerH + 1, z, trim);
            set(world, oMaxX, outerH + 1, z, trim);
        }

        // หอคอยมุมกำแพงนอก
        int[][] corners = {{oMinX, oMinZ}, {oMaxX, oMinZ}, {oMinX, oMaxZ}, {oMaxX, oMaxZ}};
        for (int[] c : corners) {
            fill(world, c[0] - 1, c[0] + 1, c[1] - 1, c[1] + 1, fy, outerH + 4, primary);
            set(world, c[0], outerH + 5, c[1], lamp);
            set(world, c[0], outerH + 6, c[1], banner);
        }

        // ประตูชั้นนอกหันเข้ากลางสนาม — เก็บพิกัดสำหรับพังกำแพง
        List<int[]> outerGate = blue ? blueOuterGate : redOuterGate;
        if (blue) {
            // ป้อมฟ้าอยู่ -Z → ประตูด้าน +Z
            recordGate(world, outerGate, cx - 3, cx + 3, cz + 14, cz + 14, fy + 2, fy + 7, Material.IRON_BARS);
            fill(world, cx - 3, cx + 3, cz + 14, cz + 14, fy + 1, fy + 1, Material.POLISHED_BLACKSTONE);
        } else {
            recordGate(world, outerGate, cx - 3, cx + 3, cz - 14, cz - 14, fy + 2, fy + 7, Material.IRON_BARS);
            fill(world, cx - 3, cx + 3, cz - 14, cz - 14, fy + 1, fy + 1, Material.POLISHED_BLACKSTONE);
        }

        // ─── ปราสาทชั้นใน (keep) ────────────────────────────────────────
        int kMinX = cx - 7;
        int kMaxX = cx + 7;
        int kMinZ = cz - 7;
        int kMaxZ = cz + 7;
        int keepH = fy + 22;

        fill(world, kMinX, kMaxX, kMinZ, kMaxZ, fy + 1, fy + 2, primary);
        fill(world, kMinX + 1, kMaxX - 1, kMinZ + 1, kMaxZ - 1, fy + 2, fy + 2, accent);

        for (int y = fy + 3; y <= keepH; y++) {
            Material w = (y % 4 == 0) ? trim : primary;
            fill(world, kMinX, kMaxX, kMinZ, kMinZ, y, y, w);
            fill(world, kMinX, kMaxX, kMaxZ, kMaxZ, y, y, w);
            fill(world, kMinX, kMinX, kMinZ, kMaxZ, y, y, w);
            fill(world, kMaxX, kMaxX, kMinZ, kMaxZ, y, y, w);
        }
        fill(world, kMinX + 1, kMaxX - 1, kMinZ + 1, kMaxZ - 1, fy + 3, keepH - 1, Material.AIR);

        // ประตูชั้นใน
        List<int[]> innerGate = blue ? blueInnerGate : redInnerGate;
        if (blue) {
            recordGate(world, innerGate, cx - 2, cx + 2, cz + 7, cz + 7, fy + 3, fy + 6, Material.IRON_BARS);
        } else {
            recordGate(world, innerGate, cx - 2, cx + 2, cz - 7, cz - 7, fy + 3, fy + 6, Material.IRON_BARS);
        }

        // หอคอย keep 4 มุม + สไปร์กลาง
        int[][] kt = {{kMinX, kMinZ}, {kMaxX, kMinZ}, {kMinX, kMaxZ}, {kMaxX, kMaxZ}};
        for (int[] t : kt) {
            fill(world, t[0] - 1, t[0] + 1, t[1] - 1, t[1] + 1, fy, keepH + 6, primary);
            set(world, t[0], keepH + 7, t[1], lamp);
            set(world, t[0], keepH + 8, t[1], banner);
        }
        // สไปร์กลาง + คริสตัลตกแต่ง (บล็อกแก้วเรืองแสง)
        fill(world, cx - 1, cx + 1, cz - 1, cz + 1, keepH, keepH + 8, accent);
        set(world, cx, keepH + 9, cz, blue ? Material.SEA_LANTERN : Material.SHROOMLIGHT);
        set(world, cx, keepH + 10, cz, glass);
        set(world, cx, keepH + 11, cz, glass);

        // หลังคา
        fill(world, kMinX, kMaxX, kMinZ, kMaxZ, keepH, keepH, accent);
        fill(world, kMinX + 2, kMaxX - 2, kMinZ + 2, kMaxZ - 2, keepH, keepH, glass);

        // แท่นราชา
        fill(world, cx - 2, cx + 2, cz - 2, cz + 2, fy + 2, fy + 2, trim);
        set(world, cx, fy + 2, cz, Material.GOLD_BLOCK);
        set(world, cx - 3, fy + 3, cz - 3, lamp);
        set(world, cx + 3, fy + 3, cz - 3, lamp);
        set(world, cx - 3, fy + 3, cz + 3, lamp);
        set(world, cx + 3, fy + 3, cz + 3, lamp);

        // หน้าต่าง
        for (int y = fy + 8; y <= fy + 16; y += 3) {
            set(world, kMinX, y, cz, glass);
            set(world, kMaxX, y, cz, glass);
            set(world, cx, y, kMinZ, glass);
            set(world, cx, y, kMaxZ, glass);
        }

        // บันไดจากประตูนอกเข้าลาน
        if (blue) {
            for (int i = 0; i < 5; i++) {
                fill(world, cx - 3, cx + 3, cz + 15 + i, cz + 15 + i, fy + 1, fy + 1, Material.STONE_BRICKS);
            }
        } else {
            for (int i = 0; i < 5; i++) {
                fill(world, cx - 3, cx + 3, cz - 15 - i, cz - 15 - i, fy + 1, fy + 1, Material.STONE_BRICKS);
            }
        }
    }

    private void recordGate(World world, List<int[]> store, int minX, int maxX, int minZ, int maxZ, int minY, int maxY, Material mat) {
        for (int x = Math.min(minX, maxX); x <= Math.max(minX, maxX); x++) {
            for (int z = Math.min(minZ, maxZ); z <= Math.max(minZ, maxZ); z++) {
                for (int y = Math.min(minY, maxY); y <= Math.max(minY, maxY); y++) {
                    world.getBlockAt(x, y, z).setType(mat, false);
                    store.add(new int[]{x, y, z});
                }
            }
        }
    }

    /**
     * พังกำแพงตาม stage 0..4 (70/50/30/10/0%)
     * stage 0-1: แตกประตูนอก · 2-3: เปิดช่องกว้าง · 4: พังประตูชั้นใน
     */
    public void breachWall(World world, boolean blue, int stage) {
        if (world == null || stage < 0) return;
        List<int[]> outer = blue ? blueOuterGate : redOuterGate;
        List<int[]> inner = blue ? blueInnerGate : redInnerGate;

        if (stage <= 1) {
            destroyPortion(world, outer, stage == 0 ? 0.35 : 0.7, true);
        } else if (stage <= 3) {
            destroyPortion(world, outer, 1.0, true);
            // ขยายช่องกำแพงรอบประตู
            widenGateHole(world, blue, stage);
        } else {
            destroyPortion(world, outer, 1.0, true);
            destroyPortion(world, inner, 1.0, true);
            widenGateHole(world, blue, 4);
        }
    }

    private void destroyPortion(World world, List<int[]> blocks, double ratio, boolean explodeFx) {
        if (blocks.isEmpty()) return;
        int n = (int) Math.ceil(blocks.size() * Math.min(1.0, Math.max(0, ratio)));
        for (int i = 0; i < n && i < blocks.size(); i++) {
            int[] b = blocks.get(i);
            Block block = world.getBlockAt(b[0], b[1], b[2]);
            if (block.getType() != Material.AIR) {
                Location loc = block.getLocation().add(0.5, 0.5, 0.5);
                if (explodeFx && i % 3 == 0) {
                    world.spawnParticle(Particle.EXPLOSION, loc, 2, 0.3, 0.3, 0.3, 0.01);
                    world.spawnParticle(Particle.CLOUD, loc, 8, 0.4, 0.4, 0.4, 0.02);
                }
                block.setType(Material.AIR, false);
            }
        }
    }

    private void widenGateHole(World world, boolean blue, int stage) {
        int cx = centerX;
        int cz = blue ? (centerZ - HALF_GAP) : (centerZ + HALF_GAP);
        int fy = floorY;
        int gateZ = blue ? (cz + 14) : (cz - 14);
        int width = 3 + stage; // กว้างขึ้นเรื่อยๆ
        for (int x = cx - width; x <= cx + width; x++) {
            for (int y = fy + 2; y <= fy + 9; y++) {
                world.getBlockAt(x, y, gateZ).setType(Material.AIR, false);
                if (blue) {
                    world.getBlockAt(x, y, gateZ + 1).setType(Material.AIR, false);
                } else {
                    world.getBlockAt(x, y, gateZ - 1).setType(Material.AIR, false);
                }
            }
        }
        Location fx = new Location(world, cx + 0.5, fy + 5, gateZ + 0.5);
        world.spawnParticle(Particle.EXPLOSION_EMITTER, fx, 1);
        world.spawnParticle(Particle.CAMPFIRE_COSY_SMOKE, fx, 30, 2, 1, 0.5, 0.01);
    }

    public Location troopSpawnFor(World world, boolean blueTeam) {
        Location base = blueTeam ? blueSpawn.clone() : redSpawn.clone();
        if (base == null || world == null) return null;
        int x = base.getBlockX();
        int z = base.getBlockZ() + (blueTeam ? 2 : -2);
        int y = findGroundY(world, x, z) + 1;
        return new Location(world, x + 0.5, y, z + 0.5, blueTeam ? 0f : 180f, 0f);
    }

    private void clearBox(World world, int minX, int maxX, int minZ, int maxZ, int minY, int maxY) {
        fill(world, minX, maxX, minZ, maxZ, minY, maxY, Material.AIR);
    }

    private void fill(World world, int minX, int maxX, int minZ, int maxZ, int minY, int maxY, Material mat) {
        for (int x = Math.min(minX, maxX); x <= Math.max(minX, maxX); x++) {
            for (int z = Math.min(minZ, maxZ); z <= Math.max(minZ, maxZ); z++) {
                for (int y = Math.min(minY, maxY); y <= Math.max(minY, maxY); y++) {
                    world.getBlockAt(x, y, z).setType(mat, false);
                }
            }
        }
    }

    private void set(World world, int x, int y, int z, Material mat) {
        world.getBlockAt(x, y, z).setType(mat, false);
    }
}
