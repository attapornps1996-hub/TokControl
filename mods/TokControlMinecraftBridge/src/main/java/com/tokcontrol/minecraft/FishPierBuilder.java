package com.tokcontrol.minecraft;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.List;

/**
 * Fish Control pier — square harbor deck, circular center plaza + red/white lighthouse,
 * long pier arm for fishing. Clean single-layer borders (no stacked fences / flowers).
 */
public final class FishPierBuilder {

    public static final int SQUARE_HALF = 16;
    public static final int CIRCLE_R = 7;
    public static final int PIER_LENGTH = 14;
    public static final int PIER_WIDTH = 3;
    public static final int LIGHTHOUSE_H = 12;

    private final TokControlPlugin plugin;
    private Location pierSpawn;
    private int deckY = 64;
    private int waterY = 62;
    private int centerX;
    private int centerZ;
    private boolean built;

    public FishPierBuilder(TokControlPlugin plugin) {
        this.plugin = plugin;
    }

    public static boolean isFishWorld(World world) {
        if (world == null) return false;
        String n = world.getName().toLowerCase();
        return n.contains("fish") || n.contains("pier") || n.contains("harbor");
    }

    public boolean isBuilt() { return built; }
    public Location getPierSpawn() { return pierSpawn; }
    public int getDeckY() { return deckY; }
    public int getWaterY() { return waterY; }
    public int getCenterX() { return centerX; }
    public int getCenterZ() { return centerZ; }
    public int getSquareHalf() { return SQUARE_HALF; }

    /** ยอดหอคอยประภาคาร — สำหรับอนิเมชัน Allay */
    public Location getLighthouseTop() {
        if (!built || pierSpawn == null || pierSpawn.getWorld() == null) return null;
        return new Location(pierSpawn.getWorld(), centerX + 0.5, deckY + LIGHTHOUSE_H + 2.6, centerZ + 0.5);
    }

    /** จุดกลางทะเลด้านทิศใต้ของท่า — สำหรับอนิเมชัน Drowned */
    public Location getSeaSpectacleSpot() {
        if (!built || pierSpawn == null || pierSpawn.getWorld() == null) return null;
        int tipZ = centerZ + SQUARE_HALF + PIER_LENGTH + 10;
        return new Location(pierSpawn.getWorld(), centerX + 0.5, waterY + 1.2, tipZ + 0.5);
    }

    public int findWaterSurfaceY(World world, int x, int z) {
        int min = world.getMinHeight();
        int max = Math.min(world.getMaxHeight() - 2, 120);
        for (int y = max; y >= min; y--) {
            Material m = world.getBlockAt(x, y, z).getType();
            Material above = world.getBlockAt(x, y + 1, z).getType();
            if (isWater(m) && (above.isAir() || above == Material.LILY_PAD || above == Material.KELP
                    || above == Material.SEAGRASS || above == Material.TALL_SEAGRASS)) {
                return y;
            }
        }
        for (int y = max; y >= min; y--) {
            Material m = world.getBlockAt(x, y, z).getType();
            if (m.isSolid() && !m.name().contains("LEAVES")) return y;
        }
        return 62;
    }

    private static boolean isWater(Material m) {
        return m == Material.WATER || m == Material.BUBBLE_COLUMN || m == Material.KELP
                || m == Material.KELP_PLANT || m == Material.SEAGRASS || m == Material.TALL_SEAGRASS;
    }

    public void buildPier(World world) {
        if (world == null) return;
        // Chunked rebuild — avoids one-frame stutter from wiping ~900k blocks
        centerX = 0;
        centerZ = 0;
        if (world.getSpawnLocation() != null) {
            centerX = world.getSpawnLocation().getBlockX();
            centerZ = world.getSpawnLocation().getBlockZ();
        }
        waterY = findWaterSurfaceY(world, centerX, centerZ);
        deckY = waterY + 2;
        built = false;
        plugin.getServer().getScheduler().runTask(plugin, () -> buildPierPhase(world, 0));
    }

    private void buildPierPhase(World world, int phase) {
        if (world == null) return;
        int floor = waterY - 8;
        int cx = centerX;
        int cz = centerZ;
        int half = SQUARE_HALF;
        // Tight clear radius — enough for square + pier, not entire ocean
        int clearR = half + PIER_LENGTH + 10;

        switch (phase) {
            case 0 -> {
                clearBox(world, cx - clearR, cx + clearR, cz - clearR, cz + clearR + 4, deckY - 2, deckY + 20);
                plugin.getServer().getScheduler().runTaskLater(plugin, () -> buildPierPhase(world, 1), 1L);
            }
            case 1 -> {
                fill(world, cx - clearR, cx + clearR, cz - clearR, cz + clearR + 4, floor, floor, Material.SAND);
                fill(world, cx - clearR, cx + clearR, cz - clearR, cz + clearR + 4, floor + 1, waterY, Material.WATER);
                plugin.getServer().getScheduler().runTaskLater(plugin, () -> buildPierPhase(world, 2), 1L);
            }
            case 2 -> {
                for (int x = cx - half; x <= cx + half; x++) {
                    for (int z = cz - half; z <= cz + half; z++) {
                        Material plank = ((x + z) & 1) == 0 ? Material.SPRUCE_PLANKS : Material.OAK_PLANKS;
                        set(world, x, deckY, z, plank);
                        if (((x + z) % 5) == 0) {
                            for (int y = floor + 1; y < deckY; y++) {
                                set(world, x, y, z, Material.STRIPPED_OAK_LOG);
                            }
                        }
                        clearAbove(world, x, deckY, z, 4);
                    }
                }
                plugin.getServer().getScheduler().runTaskLater(plugin, () -> buildPierPhase(world, 3), 1L);
            }
            case 3 -> {
                buildCirclePlaza(world, cx, cz, CIRCLE_R, deckY, floor);
                buildLighthouse(world, cx, cz, deckY);
                placeSquareRim(world, cx, cz, half, deckY);
                plugin.getServer().getScheduler().runTaskLater(plugin, () -> buildPierPhase(world, 4), 1L);
            }
            case 4 -> {
                buildLongPier(world, cx, cz, half, deckY, floor);
                decorateHarborWater(world, cx, cz, half, waterY, floor);
                fillDeckHoles(world, cx, cz, half, deckY);
                plugin.getServer().getScheduler().runTaskLater(plugin, () -> buildPierPhase(world, 5), 1L);
            }
            case 5 -> {
                world.setTime(13000L);
                world.setStorm(false);
                try {
                    world.setGameRule(org.bukkit.GameRule.DO_DAYLIGHT_CYCLE, false);
                    world.setGameRule(org.bukkit.GameRule.DO_WEATHER_CYCLE, false);
                    world.setGameRule(org.bukkit.GameRule.KEEP_INVENTORY, true);
                    world.setGameRule(org.bukkit.GameRule.ANNOUNCE_ADVANCEMENTS, false);
                    world.setGameRule(org.bukkit.GameRule.DO_MOB_LOOT, false);
                    world.setGameRule(org.bukkit.GameRule.DO_ENTITY_DROPS, false);
                    world.setGameRule(org.bukkit.GameRule.DO_TILE_DROPS, false);
                    world.setGameRule(org.bukkit.GameRule.DO_MOB_SPAWNING, false);
                } catch (Exception ignored) {}

                int spawnZ = cz + half - 3;
                for (int ox = -1; ox <= 1; ox++) {
                    for (int oz = -1; oz <= 1; oz++) {
                        set(world, cx + ox, deckY, spawnZ + oz, Material.DARK_OAK_PLANKS);
                        clearAbove(world, cx + ox, deckY, spawnZ + oz, 3);
                    }
                }
                pierSpawn = new Location(world, cx + 0.5, deckY + 1.0, spawnZ + 0.5, 0f, 8f);
                world.setSpawnLocation(pierSpawn);

                // Clear leftover rod shop from older builds (shop removed)
                if (plugin.getFishShopHelper() != null) {
                    plugin.getFishShopHelper().clearShopKeepers(world);
                }

                built = true;
                for (Player p : world.getPlayers()) {
                    softTeleport(p);
                    restoreKit(p, false);
                }
                if (plugin.getFishControlService() != null) {
                    plugin.getFishControlService().onPierBuilt(world);
                }
                try {
                    DecorationStore store = plugin.getDecorationStore();
                    if (store != null) store.clearFishCache();
                } catch (Exception ignored) {}
                plugin.getLogger().info("Fish Control harbor ready (chunked) deckY=" + deckY);
            }
            default -> { }
        }
    }

    /** Lift player out of water onto the nearest deck / pier spawn. */
    public void rescueFromWater(Player player) {
        if (player == null || !player.isOnline() || pierSpawn == null) return;
        Location loc = player.getLocation();
        if (loc.getWorld() == null || !loc.getWorld().equals(pierSpawn.getWorld())) return;
        Material feet = loc.getBlock().getType();
        Material below = loc.clone().add(0, -0.2, 0).getBlock().getType();
        boolean inWater = isWater(feet) || isWater(below) || player.isInWater()
                || loc.getY() < deckY - 0.2;
        if (!inWater) return;
        softTeleport(player);
        player.setVelocity(new org.bukkit.util.Vector(0, 0, 0));
        player.setFallDistance(0f);
    }

    private void buildCirclePlaza(World world, int cx, int cz, int r, int deckY, int floor) {
        for (int x = cx - r - 1; x <= cx + r + 1; x++) {
            for (int z = cz - r - 1; z <= cz + r + 1; z++) {
                double d = Math.hypot(x - cx, z - cz);
                if (d > r + 0.35) continue;
                for (int y = floor; y < deckY; y++) {
                    set(world, x, y, z, Material.STONE_BRICKS);
                }
                Material top;
                if (d <= 2.2) top = Material.POLISHED_ANDESITE;
                else if (d <= r - 1.2) top = Material.SMOOTH_STONE;
                else top = Material.STONE_BRICKS;
                set(world, x, deckY, z, top);
                clearAbove(world, x, deckY, z, 3);
                // Circular ring accent
                if (d >= r - 0.55 && d <= r + 0.35) {
                    set(world, x, deckY, z, Material.PRISMARINE_BRICKS);
                }
            }
        }
    }

    private void buildLighthouse(World world, int cx, int cz, int deckY) {
        int h = LIGHTHOUSE_H;
        for (int y = 1; y <= h; y++) {
            Material band = (y % 2 == 0) ? Material.RED_CONCRETE : Material.WHITE_CONCRETE;
            for (int dx = -1; dx <= 1; dx++) {
                for (int dz = -1; dz <= 1; dz++) {
                    if (Math.abs(dx) + Math.abs(dz) > 2) continue;
                    boolean core = dx == 0 && dz == 0;
                    boolean wall = Math.abs(dx) == 1 || Math.abs(dz) == 1;
                    if (core || wall) {
                        set(world, cx + dx, deckY + y, cz + dz, core ? band : band);
                    }
                }
            }
            // Hollow interior air for middle
            if (y >= 2 && y <= h - 2) {
                set(world, cx, deckY + y, cz, Material.AIR);
            }
        }
        // Base plinth
        fill(world, cx - 2, cx + 2, cz - 2, cz + 2, deckY + 1, deckY + 1, Material.POLISHED_BLACKSTONE);
        set(world, cx, deckY + 1, cz, Material.RED_CONCRETE);
        // Lantern top
        set(world, cx, deckY + h + 1, cz, Material.SEA_LANTERN);
        set(world, cx, deckY + h + 2, cz, Material.LANTERN);
        set(world, cx + 1, deckY + h, cz, Material.RED_CONCRETE);
        set(world, cx - 1, deckY + h, cz, Material.WHITE_CONCRETE);
        set(world, cx, deckY + h, cz + 1, Material.RED_CONCRETE);
        set(world, cx, deckY + h, cz - 1, Material.WHITE_CONCRETE);
        // Door opening south
        set(world, cx, deckY + 1, cz + 1, Material.AIR);
        set(world, cx, deckY + 2, cz + 1, Material.AIR);
    }

    /** Single-layer square rim — walls, not stacked oak fences. */
    private void placeSquareRim(World world, int cx, int cz, int half, int deckY) {
        for (int x = cx - half; x <= cx + half; x++) {
            for (int z = cz - half; z <= cz + half; z++) {
                boolean edge = x == cx - half || x == cx + half || z == cz - half || z == cz + half;
                if (!edge) continue;
                // Leave south pier gate open (3-wide)
                if (z == cz + half && Math.abs(x - cx) <= PIER_WIDTH) {
                    clearAbove(world, x, deckY, z, 3);
                    set(world, x, deckY, z, Material.DARK_OAK_PLANKS);
                    continue;
                }
                set(world, x, deckY, z, Material.PRISMARINE_BRICKS);
                set(world, x, deckY + 1, z, Material.PRISMARINE_WALL);
                set(world, x, deckY + 2, z, Material.AIR);
                if ((x + z) % 4 == 0) {
                    set(world, x, deckY + 2, z, Material.SEA_LANTERN);
                }
            }
        }
        // Corner posts
        int[][] corners = {
                {cx - half, cz - half}, {cx + half, cz - half},
                {cx - half, cz + half}, {cx + half, cz + half}
        };
        for (int[] c : corners) {
            set(world, c[0], deckY + 1, c[1], Material.PRISMARINE_BRICKS);
            set(world, c[0], deckY + 2, c[1], Material.PRISMARINE_BRICKS);
            set(world, c[0], deckY + 3, c[1], Material.LANTERN);
        }
    }

    private void buildLongPier(World world, int cx, int cz, int half, int deckY, int floor) {
        int startZ = cz + half;
        int endZ = startZ + PIER_LENGTH;
        int halfW = PIER_WIDTH;
        for (int z = startZ; z <= endZ; z++) {
            for (int x = cx - halfW; x <= cx + halfW; x++) {
                Material plank = ((x + z) & 1) == 0 ? Material.DARK_OAK_PLANKS : Material.SPRUCE_PLANKS;
                set(world, x, deckY, z, plank);
                if ((z - startZ) % 3 == 0 && x == cx) {
                    for (int y = floor + 1; y < deckY; y++) {
                        set(world, x, y, z, Material.STRIPPED_DARK_OAK_LOG);
                    }
                }
                clearAbove(world, x, deckY, z, 3);
            }
            // Single rail each side — no double fill
            set(world, cx - halfW, deckY + 1, z, Material.SPRUCE_FENCE);
            set(world, cx + halfW, deckY + 1, z, Material.SPRUCE_FENCE);
            set(world, cx - halfW, deckY + 2, z, Material.AIR);
            set(world, cx + halfW, deckY + 2, z, Material.AIR);
            if ((z - startZ) % 4 == 0) {
                set(world, cx - halfW, deckY + 2, z, Material.LANTERN);
                set(world, cx + halfW, deckY + 2, z, Material.SOUL_LANTERN);
            }
        }
        // Pier tip fishing platform
        for (int x = cx - halfW - 1; x <= cx + halfW + 1; x++) {
            for (int z = endZ; z <= endZ + 2; z++) {
                set(world, x, deckY, z, Material.DARK_OAK_PLANKS);
                clearAbove(world, x, deckY, z, 3);
            }
        }
        // Tip rail (open sides for casting)
        for (int x = cx - halfW - 1; x <= cx + halfW + 1; x++) {
            set(world, x, deckY + 1, endZ + 2, Material.SPRUCE_FENCE);
        }
        set(world, cx - halfW - 1, deckY + 1, endZ, Material.SPRUCE_FENCE);
        set(world, cx - halfW - 1, deckY + 1, endZ + 1, Material.SPRUCE_FENCE);
        set(world, cx + halfW + 1, deckY + 1, endZ, Material.SPRUCE_FENCE);
        set(world, cx + halfW + 1, deckY + 1, endZ + 1, Material.SPRUCE_FENCE);
        // Open tip center for casting
        set(world, cx, deckY + 1, endZ + 2, Material.AIR);
        set(world, cx - 1, deckY + 1, endZ + 2, Material.AIR);
        set(world, cx + 1, deckY + 1, endZ + 2, Material.AIR);
        set(world, cx, deckY + 2, endZ + 2, Material.SEA_LANTERN);
    }

    private void decorateHarborWater(World world, int cx, int cz, int half, int waterY, int floor) {
        Material[] coral = {
                Material.BRAIN_CORAL_BLOCK, Material.FIRE_CORAL_BLOCK, Material.TUBE_CORAL_BLOCK,
                Material.HORN_CORAL_BLOCK, Material.BUBBLE_CORAL_BLOCK
        };
        int n = 0;
        for (int x = cx - half - 6; x <= cx + half + 6; x++) {
            for (int z = cz - half - 6; z <= cz + half + PIER_LENGTH + 4; z++) {
                int cheb = Math.max(Math.abs(x - cx), Math.abs(z - cz));
                if (cheb < half - 1 && z < cz + half) continue;
                if (((x * 31 + z * 17) & 15) != 0) continue;
                set(world, x, floor + 1, z, coral[Math.floorMod(x + z, coral.length)]);
                if (((x + z) & 3) == 0) set(world, x, waterY - 1, z, Material.SEA_LANTERN);
                n++;
                if (n > 40) return;
            }
        }
    }

    /** Fill any air/water holes on the walkable square deck (no flower pits). */
    public void fillDeckHoles(World world, int cx, int cz, int half, int deckY) {
        if (world == null) return;
        for (int x = cx - half; x <= cx + half; x++) {
            for (int z = cz - half; z <= cz + half + PIER_LENGTH + 2; z++) {
                Material m = world.getBlockAt(x, deckY, z).getType();
                if (m.isAir() || isWater(m) || isFlowerish(m)) {
                    boolean onPier = z > cz + half && Math.abs(x - cx) <= PIER_WIDTH + 1;
                    boolean onSquare = Math.abs(x - cx) <= half && Math.abs(z - cz) <= half;
                    if (onSquare || onPier) {
                        set(world, x, deckY, z, onPier ? Material.DARK_OAK_PLANKS : Material.OAK_PLANKS);
                    }
                }
                Material above = world.getBlockAt(x, deckY + 1, z).getType();
                if (isFlowerish(above) || above == Material.SHORT_GRASS || above == Material.FERN
                        || above == Material.TALL_GRASS || above.name().contains("PETAL")) {
                    set(world, x, deckY + 1, z, Material.AIR);
                }
            }
        }
    }

    private static boolean isFlowerish(Material m) {
        if (m == null) return false;
        String n = m.name();
        return n.contains("FLOWER") || n.contains("TULIP") || n.contains("ORCHID")
                || n.contains("DAISY") || n.contains("BLUET") || n.contains("POPPY")
                || n.contains("DANDELION") || n.contains("ALLIUM") || n.contains("CORNFLOWER")
                || n.contains("LILY") || n.contains("PETAL") || n.contains("TORCHFLOWER")
                || m == Material.SHORT_GRASS || m == Material.FERN;
    }

    public int saveDecorationsNow() {
        if (pierSpawn == null || pierSpawn.getWorld() == null) return 0;
        World world = pierSpawn.getWorld();
        return plugin.getDecorationStore().snapshotAndSaveFish(
                world, centerX, centerZ, deckY, SQUARE_HALF, 36);
    }

    public void restoreDecorations(World world) {
        if (world == null) return;
        DecorationStore store = plugin.getDecorationStore();
        store.loadFishFromDisk();
        store.pasteFish(world, centerX, centerZ, deckY, SQUARE_HALF, store.getFishCached());
        fillDeckHoles(world, centerX, centerZ, SQUARE_HALF, deckY);
    }

    /** Quiet teleport to pier — no title, no inventory wipe. */
    public void softTeleport(Player player) {
        if (player == null || !player.isOnline() || pierSpawn == null) return;
        Location safe = pierSpawn.clone();
        for (int i = 0; i < 6; i++) {
            Material feet = safe.getBlock().getType();
            Material head = safe.clone().add(0, 1, 0).getBlock().getType();
            if (!feet.isSolid() && !head.isSolid()) break;
            safe.add(0, 1, 0);
        }
        player.teleport(safe);
    }

    /** Restore rod/sword without clearing whole inventory / titles. */
    public void restoreKit(Player player, boolean clearAll) {
        if (player == null || !player.isOnline()) return;
        player.setAllowFlight(false);
        player.setFlying(false);
        player.setGameMode(org.bukkit.GameMode.SURVIVAL);
        if (clearAll) {
            player.getInventory().clear();
            player.getInventory().setArmorContents(null);
        }
        player.getInventory().setItem(0, createUnbreakableRod());
        player.getInventory().setItem(1, createSword());
    }

    public void prepareFisher(Player player) {
        softTeleport(player);
        restoreKit(player, true);
        player.sendTitle("§b§lตกปลา", "§eตกปลาให้ครบ · ระวังซอมบี้!", 5, 45, 10);
    }

    public static ItemStack createUnbreakableRod() {
        ItemStack rod = new ItemStack(Material.FISHING_ROD, 1);
        ItemMeta meta = rod.getItemMeta();
        if (meta != null) {
            meta.setDisplayName("§bเบ็ดตกปลา");
            meta.setLore(List.of("§7ไม่พัง · ดึงอัตโนมัติ", "§8TokControl"));
            meta.setUnbreakable(true);
            try {
                meta.addEnchant(Enchantment.LURE, 3, true);
                meta.addEnchant(Enchantment.LUCK_OF_THE_SEA, 2, true);
                meta.addEnchant(Enchantment.UNBREAKING, 3, true);
            } catch (Exception ignored) {}
            rod.setItemMeta(meta);
        }
        return rod;
    }

    public static ItemStack createSword() {
        ItemStack sword = new ItemStack(Material.DIAMOND_SWORD, 1);
        ItemMeta meta = sword.getItemMeta();
        if (meta != null) {
            meta.setDisplayName("§b§lHarbor Guard Sword");
            meta.setLore(List.of("§7For zombies", "§8TokControl"));
            meta.setUnbreakable(true);
            try {
                meta.addEnchant(Enchantment.SHARPNESS, 4, true);
                meta.addEnchant(Enchantment.UNBREAKING, 3, true);
            } catch (Exception ignored) {}
            sword.setItemMeta(meta);
        }
        return sword;
    }

    public void giveUnbreakableRod(Player player) {
        restoreKit(player, false);
    }

    private void clearAbove(World world, int x, int deckY, int z, int height) {
        for (int y = 1; y <= height; y++) {
            Material m = world.getBlockAt(x, deckY + y, z).getType();
            if (m == Material.BARRIER || m == Material.WATER || isFlowerish(m)
                    || m == Material.OAK_FENCE || m == Material.SPRUCE_FENCE
                    || m.name().contains("LEAVES") || m == Material.SHORT_GRASS) {
                set(world, x, deckY + y, z, Material.AIR);
            }
        }
    }

    private void clearBox(World world, int minX, int maxX, int minZ, int maxZ, int minY, int maxY) {
        for (int x = minX; x <= maxX; x++) {
            for (int z = minZ; z <= maxZ; z++) {
                for (int y = minY; y <= maxY; y++) {
                    Block b = world.getBlockAt(x, y, z);
                    if (!b.getType().isAir()) b.setType(Material.AIR, false);
                }
            }
        }
    }

    private void fill(World world, int minX, int maxX, int minZ, int maxZ, int minY, int maxY, Material mat) {
        for (int x = minX; x <= maxX; x++) {
            for (int z = minZ; z <= maxZ; z++) {
                for (int y = minY; y <= maxY; y++) {
                    world.getBlockAt(x, y, z).setType(mat, false);
                }
            }
        }
    }

    private void set(World world, int x, int y, int z, Material mat) {
        world.getBlockAt(x, y, z).setType(mat, false);
    }
}
