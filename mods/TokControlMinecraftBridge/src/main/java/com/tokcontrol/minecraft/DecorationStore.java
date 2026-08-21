package com.tokcontrol.minecraft;

import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.block.data.BlockData;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.logging.Level;

/**
 * บันทึกบล็อกตกแต่งรอบนอกแมพ (นอกกำแพง Bedrock) ให้คงอยู่หลังชนะ/ขยาย/rebuild
 * — เฉพาะแอดมินที่ควรแต่งในโซนนี้
 */
public final class DecorationStore {

    public static final class SavedBlock {
        public final int dx;
        public final int dy;
        public final int dz;
        public final String material;
        public final String blockData;

        public SavedBlock(int dx, int dy, int dz, String material, String blockData) {
            this.dx = dx;
            this.dy = dy;
            this.dz = dz;
            this.material = material;
            this.blockData = blockData == null ? "" : blockData;
        }
    }

    private final TokControlPlugin plugin;
    private final File file;
    private final File fishFile;
    private final File farmFile;
    private List<SavedBlock> cached = new ArrayList<>();
    private List<SavedBlock> fishCached = new ArrayList<>();
    private List<SavedBlock> farmCached = new ArrayList<>();
    /** ขนาดรั้วฟาร์มที่เซฟล่าสุด (−1 = ยังไม่รู้) */
    private int farmSavedHalf = -1;
    /** กี่บล็อกด้านในขอบรั้วที่ถือว่า "ติดรั้ว" */
    public static final int FENCE_ATTACH_MARGIN = 4;

    public DecorationStore(TokControlPlugin plugin) {
        this.plugin = plugin;
        this.file = new File(plugin.getDataFolder(), "decorations.yml");
        this.fishFile = new File(plugin.getDataFolder(), "fish_decorations.yml");
        this.farmFile = new File(plugin.getDataFolder(), "farm_decorations.yml");
        loadFromDisk();
        loadFishFromDisk();
        loadFarmFromDisk();
    }

    public List<SavedBlock> getCached() {
        return cached;
    }

    public List<SavedBlock> getFishCached() {
        return fishCached;
    }

    public int size() {
        return cached.size();
    }

    public int fishSize() {
        return fishCached.size();
    }

    /** Drop cached fish decor (avoids re-pasting old fences/flowers onto redesigned pier). */
    public void clearFishCache() {
        fishCached = new ArrayList<>();
        try {
            if (fishFile != null && fishFile.exists()) {
                FileConfiguration yaml = new YamlConfiguration();
                yaml.set("blocks", new ArrayList<>());
                yaml.save(fishFile);
            }
        } catch (Exception ignored) {}
    }

    public List<SavedBlock> getFarmCached() {
        return farmCached;
    }

    public int farmSize() {
        return farmCached.size();
    }

    public int getFarmSavedHalf() {
        return farmSavedHalf;
    }

    public void setFarmSavedHalf(int half) {
        farmSavedHalf = half;
        // บันทึก half ลงดิสก์ทันที — กันชนะ/รีสตาร์ทแล้วขนาดหลุด
        try {
            FileConfiguration yaml;
            if (farmFile.exists()) {
                yaml = YamlConfiguration.loadConfiguration(farmFile);
            } else {
                yaml = new YamlConfiguration();
                yaml.set("version", 2);
                yaml.set("blocks", new ArrayList<String>());
            }
            yaml.set("half", farmSavedHalf > 0 ? farmSavedHalf : -1);
            if (!plugin.getDataFolder().exists()) plugin.getDataFolder().mkdirs();
            yaml.save(farmFile);
        } catch (IOException e) {
            plugin.getLogger().log(Level.WARNING, "Failed to persist farm half", e);
        }
    }

    /** มีรั้ว/กำแพงที่แอดมินเซฟไว้รอบขอบ half หรือไม่ */
    public boolean hasFarmPerimeterDecor(int half) {
        if (farmCached == null || farmCached.isEmpty()) {
            // ถ้าเซฟ half ไว้ แปลว่าเคยเซฟรั้วแล้ว — ให้ข้ามรั้วดีฟอลต์
            return farmSavedHalf >= FarmBuilder.MIN_HALF;
        }
        if (half < 1) half = farmSavedHalf > 0 ? farmSavedHalf : half;
        if (half < 1) return false;
        int margin = FENCE_ATTACH_MARGIN;
        int count = 0;
        for (SavedBlock b : farmCached) {
            int cheb = Math.max(Math.abs(b.dx), Math.abs(b.dz));
            if (cheb < half - margin || cheb > half + 2) continue;
            if (b.dy < 0 || b.dy > 12) continue;
            if (!isPerimeterStructureMat(b.material)) continue;
            count++;
            // เกณฑ์ต่ำ — เสาหินเว้นช่อง + รั้วไม้ก็พอ
            if (count >= 8) return true;
        }
        return count >= 8 || farmSavedHalf >= FarmBuilder.MIN_HALF;
    }

    /**
     * สแกนบล็อกนอกวงบ่อน้ำ (นอก border+pond) — โซนบ่อถูกสร้างใหม่ทุกครั้ง
     */
    public List<SavedBlock> captureFromWorld(World world, int cx, int cz, int floorY, int border, int pad) {
        List<SavedBlock> out = new ArrayList<>();
        if (world == null) return out;
        int pond = ArenaBuilder.POND_WIDTH;
        int skipUntil = border + pond;
        int outer = skipUntil + Math.max(8, pad);
        int maxDy = Math.max(16, plugin.getConfig().getInt("arena.height", 9) + 16);
        for (int x = cx - outer; x <= cx + outer; x++) {
            for (int z = cz - outer; z <= cz + outer; z++) {
                // ในแมพ + วงบ่อน้ำธีม = ไม่เก็บ (สร้างใหม่/ไม่ใช่แอดมิน)
                if (Math.abs(x - cx) <= skipUntil && Math.abs(z - cz) <= skipUntil) continue;
                for (int y = floorY; y <= floorY + maxDy; y++) {
                    Block block = world.getBlockAt(x, y, z);
                    Material m = block.getType();
                    if (m.isAir() || m == Material.CAVE_AIR || m == Material.VOID_AIR) continue;
                    if (m == Material.BEDROCK) continue;
                    if (y == floorY && (m == Material.GRASS_BLOCK || m == Material.DIRT || m == Material.COARSE_DIRT)) {
                        continue;
                    }
                    if (y < floorY) continue;
                    if (isLikelyFarmLeftover(m)) continue;
                    String data = block.getBlockData().getAsString();
                    out.add(new SavedBlock(x - cx, y - floorY, z - cz, m.name(), data));
                }
            }
        }
        return out;
    }

    /** เศษแมพฟาร์มที่ปนในไฟล์ decorations ของ Box */
    public static boolean isLikelyFarmLeftover(Material m) {
        if (m == null) return false;
        if (m == Material.FARMLAND || m == Material.WHEAT || m == Material.HAY_BLOCK
                || m == Material.OAK_FENCE || m == Material.OAK_FENCE_GATE
                || m == Material.STRIPPED_OAK_LOG || m == Material.COMPOSTER
                || m == Material.WATER_CAULDRON || m == Material.BELL
                || m == Material.LILY_PAD || m == Material.SEAGRASS || m == Material.KELP
                || m == Material.KELP_PLANT || m == Material.CLAY
                || m == Material.STONE_BRICK_WALL || m == Material.MOSSY_STONE_BRICK_WALL
                || m == Material.COBBLESTONE_WALL || m == Material.MOSSY_COBBLESTONE_WALL
                || m == Material.SPRUCE_PLANKS || m == Material.OAK_PLANKS
                || m == Material.OAK_LOG || m == Material.OAK_LEAVES
                || m == Material.LANTERN || m == Material.COMPOSTER
                || m == Material.DIRT || m == Material.COARSE_DIRT || m == Material.ROOTED_DIRT
                || m == Material.GRASS_BLOCK || m == Material.PODZOL || m == Material.MYCELIUM
                || m == Material.MUD || m == Material.PACKED_MUD) return true;
        String n = m.name();
        return n.contains("WHEAT") || n.contains("CROPS") || n.contains("CARROT")
                || n.contains("POTATO") || n.contains("BEETROOT") || n.equals("FARMLAND")
                || n.contains("FENCE") || n.endsWith("_CROP");
    }

    /** ดิน/หินกองสูงเหนือพื้น — มักเป็นเพดานเศษที่บังแสง (ไม่ใช่ของแอดมิน) */
    public static boolean isSkyBlockingLeftover(Material m, int dy) {
        if (m == null || dy <= 0) return false;
        if (isLikelyFarmLeftover(m)) return true;
        return m == Material.STONE || m == Material.COBBLESTONE || m == Material.ANDESITE
                || m == Material.DIORITE || m == Material.GRANITE || m == Material.DEEPSLATE
                || m == Material.TUFF || m == Material.NETHERRACK || m == Material.END_STONE
                || m == Material.SANDSTONE || m == Material.RED_SANDSTONE
                || m == Material.GRAVEL || m == Material.SAND || m == Material.RED_SAND;
    }

    public static List<SavedBlock> filterOutFarmLeftovers(List<SavedBlock> blocks) {
        if (blocks == null || blocks.isEmpty()) {
            return blocks == null ? new ArrayList<>() : new ArrayList<>(blocks);
        }
        List<SavedBlock> out = new ArrayList<>(blocks.size());
        for (SavedBlock b : blocks) {
            if (b == null || b.material == null) continue;
            try {
                Material mat = Material.valueOf(b.material);
                if (isLikelyFarmLeftover(mat)) continue;
                if (isSkyBlockingLeftover(mat, b.dy)) continue;
            } catch (IllegalArgumentException ignored) {
                // keep unknown
            }
            out.add(b);
        }
        return out;
    }

    public void paste(World world, int cx, int cz, int floorY, int border, List<SavedBlock> blocks) {
        if (world == null || blocks == null || blocks.isEmpty()) return;
        int pasted = 0;
        for (SavedBlock b : blocks) {
            int x = cx + b.dx;
            int z = cz + b.dz;
            int y = floorY + b.dy;
            // ไม่วางทับพื้นที่เล่น/กำแพง
            if (Math.abs(x - cx) <= border && Math.abs(z - cz) <= border) continue;
            if (y < floorY) continue;
            Material mat;
            try {
                mat = Material.valueOf(b.material);
            } catch (IllegalArgumentException ex) {
                continue;
            }
            if (mat.isAir() || mat == Material.BEDROCK) continue;
            if (isLikelyFarmLeftover(mat)) continue;
            if (isSkyBlockingLeftover(mat, b.dy)) continue;
            Block block = world.getBlockAt(x, y, z);
            try {
                if (b.blockData != null && !b.blockData.isEmpty()) {
                    BlockData data = plugin.getServer().createBlockData(b.blockData);
                    block.setBlockData(data, false);
                } else {
                    block.setType(mat, false);
                }
                pasted++;
            } catch (IllegalArgumentException ex) {
                block.setType(mat, false);
                pasted++;
            }
        }
        plugin.getLogger().info("Restored " + pasted + " decoration blocks outside arena");
    }

    public void replaceCache(List<SavedBlock> blocks) {
        cached = blocks == null ? new ArrayList<>() : new ArrayList<>(blocks);
    }

    public void replaceFarmCache(List<SavedBlock> blocks) {
        farmCached = blocks == null ? new ArrayList<>() : new ArrayList<>(blocks);
    }

    public void replaceFarmCache(List<SavedBlock> blocks, int half) {
        farmCached = blocks == null ? new ArrayList<>() : new ArrayList<>(blocks);
        if (half >= FarmBuilder.MIN_HALF) farmSavedHalf = half;
    }

    /**
     * เลื่อนของตกแต่ง/รั้วให้ตามขอบเมื่อขยาย/ย่อ
     * — ลึกในนา (cheb &lt; oldInner - margin): ไม่ขยับ
     * — แถบติดรั้ว + บนรั้ว + นอกรั้ว: เลื่อนตาม delta
     */
    public static List<SavedBlock> shiftOutwardWithFence(List<SavedBlock> blocks, int oldInner, int newInner) {
        return shiftOutwardWithFence(blocks, oldInner, newInner, FENCE_ATTACH_MARGIN);
    }

    public static List<SavedBlock> shiftOutwardWithFence(List<SavedBlock> blocks, int oldInner, int newInner, int attachMargin) {
        if (blocks == null || blocks.isEmpty()) {
            return blocks == null ? new ArrayList<>() : new ArrayList<>(blocks);
        }
        int delta = newInner - oldInner;
        if (delta == 0) return new ArrayList<>(blocks);
        int margin = Math.max(0, attachMargin);
        int attachFrom = Math.max(0, oldInner - margin);

        List<SavedBlock> out = new ArrayList<>(blocks.size());
        for (SavedBlock b : blocks) {
            int adx = Math.abs(b.dx);
            int adz = Math.abs(b.dz);
            int cheb = Math.max(adx, adz);
            if (cheb < attachFrom) {
                out.add(b);
                continue;
            }
            int ndx = b.dx;
            int ndz = b.dz;
            if (adx >= adz) {
                int sx = b.dx >= 0 ? 1 : -1;
                ndx = sx * (adx + delta);
            }
            if (adz >= adx) {
                int sz = b.dz >= 0 ? 1 : -1;
                ndz = sz * (adz + delta);
            }
            out.add(new SavedBlock(ndx, b.dy, ndz, b.material, b.blockData));
        }
        return out;
    }

    private static boolean isPerimeterStructureMat(String name) {
        if (name == null) return false;
        String n = name.toUpperCase(Locale.ROOT);
        if (n.contains("AIR") || n.equals("WATER") || n.equals("LAVA") || n.equals("WHEAT")) return false;
        if (n.equals("GRASS_BLOCK") || n.equals("DIRT") || n.equals("COARSE_DIRT") || n.equals("FARMLAND")) return false;
        if (n.equals("BEDROCK")) return false;
        return true;
    }

    public void mergeCapture(List<SavedBlock> fresh) {
        if (fresh == null || fresh.isEmpty()) return;
        // ใช้ผลสแกนล่าสุดเป็นต้นทางหลัก (ครอบคลุมทั้งลบและเพิ่มของแอดมิน)
        cached = new ArrayList<>(fresh);
    }

    public void saveToDisk() {
        FileConfiguration yaml = new YamlConfiguration();
        yaml.set("version", 1);
        List<String> lines = new ArrayList<>(cached.size());
        for (SavedBlock b : cached) {
            // dx|dy|dz|MATERIAL|blockdata
            String data = b.blockData == null ? "" : b.blockData.replace('|', '/');
            lines.add(b.dx + "|" + b.dy + "|" + b.dz + "|" + b.material + "|" + data);
        }
        yaml.set("blocks", lines);
        try {
            if (!plugin.getDataFolder().exists() && !plugin.getDataFolder().mkdirs()) {
                plugin.getLogger().warning("Cannot create plugin data folder for decorations");
            }
            yaml.save(file);
            plugin.getLogger().info("Saved " + cached.size() + " decoration blocks → decorations.yml");
        } catch (IOException e) {
            plugin.getLogger().log(Level.WARNING, "Failed to save decorations.yml", e);
        }
    }

    public void loadFromDisk() {
        cached = new ArrayList<>();
        if (!file.exists()) return;
        FileConfiguration yaml = YamlConfiguration.loadConfiguration(file);
        List<String> lines = yaml.getStringList("blocks");
        for (String line : lines) {
            if (line == null || line.isEmpty()) continue;
            String[] p = line.split("\\|", 5);
            if (p.length < 4) continue;
            try {
                int dx = Integer.parseInt(p[0]);
                int dy = Integer.parseInt(p[1]);
                int dz = Integer.parseInt(p[2]);
                String mat = p[3].toUpperCase(Locale.ROOT);
                String data = p.length >= 5 ? p[4] : "";
                cached.add(new SavedBlock(dx, dy, dz, mat, data));
            } catch (NumberFormatException ignored) {
            }
        }
        int before = cached.size();
        cached = filterOutFarmLeftovers(cached);
        if (cached.size() != before) {
            plugin.getLogger().info("Filtered Box decorations " + before + " → " + cached.size()
                    + " (removed farm/dirt sky leftovers)");
            saveToDisk();
        } else {
            plugin.getLogger().info("Loaded " + cached.size() + " decoration blocks from decorations.yml");
        }
    }

    /** สแกนโลกปัจจุบัน → cache + ดิสก์ */
    public int snapshotAndSave(World world, int cx, int cz, int floorY, int border, int pad) {
        List<SavedBlock> captured = captureFromWorld(world, cx, cz, floorY, border, pad);
        replaceCache(captured);
        saveToDisk();
        return captured.size();
    }

    /* ===================== Fish Control decorations ===================== */

    private static boolean isOceanFill(Material m) {
        return m == Material.WATER || m == Material.BUBBLE_COLUMN || m == Material.KELP
                || m == Material.KELP_PLANT || m == Material.SEAGRASS || m == Material.TALL_SEAGRASS
                || m == Material.SAND || m == Material.GRAVEL;
    }

    private static boolean isAirish(Material m) {
        return m.isAir() || m == Material.CAVE_AIR || m == Material.VOID_AIR;
    }

    /**
     * สแกนทั้งท่าเรือ + รอบนอก — รวมรั้ว/พื้น/ไฟที่แอดมินแก้
     * ในโซนท่า: ชั้น deckY+1..deckY+4 เก็บทั้ง AIR (ลบรั้วแล้วไม่กลับมา)
     */
    public List<SavedBlock> captureFishFromWorld(World world, int cx, int cz, int deckY, int pierR, int pad) {
        List<SavedBlock> out = new ArrayList<>();
        if (world == null) return out;
        int pierZone = Math.max(18, pierR + 6); // รวมชานตกปลา / สะพาน
        int outer = pierZone + Math.max(12, pad);
        int minY = deckY - 2;
        int maxY = deckY + 24;
        for (int x = cx - outer; x <= cx + outer; x++) {
            for (int z = cz - outer; z <= cz + outer; z++) {
                double d = Math.hypot(x - cx, z - cz);
                boolean inPier = d <= pierZone + 0.5;
                for (int y = minY; y <= maxY; y++) {
                    Block block = world.getBlockAt(x, y, z);
                    Material m = block.getType();
                    int dy = y - deckY;

                    if (inPier) {
                        if (y < deckY) continue; // โครงใต้น้ำใช้ของ procedural
                        // ชั้นรั้ว/ของตกแต่งใกล้พื้น — เก็บ AIR ด้วย เพื่อจำว่าลบรั้วแล้ว
                        if (dy >= 1 && dy <= 4) {
                            String data = isAirish(m) ? "" : block.getBlockData().getAsString();
                            out.add(new SavedBlock(x - cx, dy, z - cz, m.name(), data));
                            continue;
                        }
                        if (isAirish(m) || isOceanFill(m)) continue;
                        String data = block.getBlockData().getAsString();
                        out.add(new SavedBlock(x - cx, dy, z - cz, m.name(), data));
                        continue;
                    }

                    // นอกท่า: ของตกแต่งเท่านั้น (เกาะดาวเทียม / ธีม)
                    if (isAirish(m) || isOceanFill(m)) continue;
                    String data = block.getBlockData().getAsString();
                    out.add(new SavedBlock(x - cx, dy, z - cz, m.name(), data));
                }
            }
        }
        return out;
    }

    public void pasteFish(World world, int cx, int cz, int deckY, int pierR, List<SavedBlock> blocks) {
        if (world == null || blocks == null || blocks.isEmpty()) return;
        int pasted = 0;
        for (SavedBlock b : blocks) {
            int x = cx + b.dx;
            int z = cz + b.dz;
            int y = deckY + b.dy;
            Material mat;
            try {
                mat = Material.valueOf(b.material);
            } catch (IllegalArgumentException ex) {
                continue;
            }
            Block block = world.getBlockAt(x, y, z);
            try {
                if (isAirish(mat)) {
                    block.setType(Material.AIR, false);
                    pasted++;
                    continue;
                }
                if (b.blockData != null && !b.blockData.isEmpty()) {
                    BlockData data = plugin.getServer().createBlockData(b.blockData);
                    block.setBlockData(data, false);
                } else {
                    block.setType(mat, false);
                }
                pasted++;
            } catch (IllegalArgumentException ex) {
                block.setType(isAirish(mat) ? Material.AIR : mat, false);
                pasted++;
            }
        }
        plugin.getLogger().info("Restored " + pasted + " Fish Control decoration blocks (incl. pier/fences)");
    }

    public int snapshotAndSaveFish(World world, int cx, int cz, int deckY, int pierR, int pad) {
        List<SavedBlock> captured = captureFishFromWorld(world, cx, cz, deckY, pierR, pad);
        fishCached = new ArrayList<>(captured);
        saveFishToDisk();
        return captured.size();
    }

    public void saveFishToDisk() {
        FileConfiguration yaml = new YamlConfiguration();
        yaml.set("version", 2);
        List<String> lines = new ArrayList<>(fishCached.size());
        for (SavedBlock b : fishCached) {
            String data = b.blockData == null ? "" : b.blockData.replace('|', '/');
            lines.add(b.dx + "|" + b.dy + "|" + b.dz + "|" + b.material + "|" + data);
        }
        yaml.set("blocks", lines);
        try {
            if (!plugin.getDataFolder().exists() && !plugin.getDataFolder().mkdirs()) {
                plugin.getLogger().warning("Cannot create plugin data folder for fish decorations");
            }
            yaml.save(fishFile);
            plugin.getLogger().info("Saved " + fishCached.size() + " fish decoration blocks → fish_decorations.yml");
        } catch (IOException e) {
            plugin.getLogger().log(Level.WARNING, "Failed to save fish_decorations.yml", e);
        }
    }

    public void loadFishFromDisk() {
        fishCached = new ArrayList<>();
        if (!fishFile.exists()) return;
        FileConfiguration yaml = YamlConfiguration.loadConfiguration(fishFile);
        List<String> lines = yaml.getStringList("blocks");
        for (String line : lines) {
            if (line == null || line.isEmpty()) continue;
            String[] p = line.split("\\|", 5);
            if (p.length < 4) continue;
            try {
                int dx = Integer.parseInt(p[0]);
                int dy = Integer.parseInt(p[1]);
                int dz = Integer.parseInt(p[2]);
                String mat = p[3].toUpperCase(Locale.ROOT);
                String data = p.length >= 5 ? p[4] : "";
                fishCached.add(new SavedBlock(dx, dy, dz, mat, data));
            } catch (NumberFormatException ignored) {
            }
        }
        plugin.getLogger().info("Loaded " + fishCached.size() + " fish decoration blocks from fish_decorations.yml");
    }

    /* ===================== Farm Control decorations ===================== */

    /** ความสูงสูงสุดที่บันทึก (เหนือพื้น) */
    private static final int FARM_DECOR_MAX_DY = 28;

    /**
     * สแกนทั้งในนา + นอกรั้ว — เก็บบล็อกที่แอดมินแต่ง
     * ข้ามเฉพาะของที่ระบบสร้างใหม่ทุกครั้ง (พื้นมาตรฐาน / ข้าว / หอ / บ่อ)
     */
    public List<SavedBlock> captureFarmFromWorld(World world, int cx, int cz, int floorY, int half, int pad) {
        List<SavedBlock> out = new ArrayList<>();
        if (world == null) return out;
        int outer = half + Math.max(FarmBuilder.OUTER_DIRT_PAD, Math.max(16, pad));
        int maxDy = FARM_DECOR_MAX_DY;
        for (int x = cx - outer; x <= cx + outer; x++) {
            for (int z = cz - outer; z <= cz + outer; z++) {
                int adx = Math.abs(x - cx);
                int adz = Math.abs(z - cz);
                // หอคอย + บ่อน้ำสร้างใหม่เสมอ — ไม่เซฟ (กันทับน้ำ)
                if (FarmBuilder.isTowerPondZone(x, z, cx, cz)) continue;
                for (int y = floorY; y <= floorY + maxDy; y++) {
                    Block block = world.getBlockAt(x, y, z);
                    Material m = block.getType();
                    if (m.isAir() || m == Material.CAVE_AIR || m == Material.VOID_AIR) continue;
                    if (m == Material.BEDROCK) continue;
                    if (m == Material.WHEAT || m == Material.FIRE || m == Material.SOUL_FIRE) continue;

                    int dy = y - floorY;
                    // พื้นมาตรฐานที่ระบบถมเอง — ไม่เซฟ (กันไฟล์พอง)
                    if (dy == 0) {
                        if (m == Material.GRASS_BLOCK || m == Material.DIRT || m == Material.COARSE_DIRT) continue;
                        if (m == Material.FARMLAND) continue;
                    }

                    // รวมรั้ว/ประตู/เสามุมที่แอดมินแต่ง — จะเลื่อนตามตอนขยาย
                    out.add(new SavedBlock(x - cx, dy, z - cz, m.name(), block.getBlockData().getAsString()));
                }
            }
        }
        return out;
    }

    public void pasteFarm(World world, int cx, int cz, int floorY, int half, List<SavedBlock> blocks) {
        if (world == null || blocks == null || blocks.isEmpty()) return;
        int pasted = 0;
        int skipped = 0;
        for (SavedBlock b : blocks) {
            // กันไฟล์เก่าที่เป็นตึกลอยสูงมาก (ไม่ข้ามหิน/อิฐ — ใช้ทำรั้วได้)
            if (b.dy > FARM_DECOR_MAX_DY) { skipped++; continue; }
            int cheb = Math.max(Math.abs(b.dx), Math.abs(b.dz));
            // ไม่แปะรั้ว/ของแต่งที่อยู่นอกรั้วปัจจุบัน — กันรั้วขยายค้างหลังชนะ
            if (half > 0 && cheb > half + FENCE_ATTACH_MARGIN + 2) {
                skipped++;
                continue;
            }
            boolean nearFence = half > 0 && cheb >= half - FENCE_ATTACH_MARGIN && cheb <= half + 2;
            // ไม่แปะทับแนวกำแพงระบบ — ให้กำแพงสม่ำเสมอหลัง restore
            boolean onFenceRing = half > 0 && (
                    (Math.abs(b.dx) == half && Math.abs(b.dz) <= half)
                            || (Math.abs(b.dz) == half && Math.abs(b.dx) <= half)
                            || cheb == half + 1
            );
            if (onFenceRing) {
                skipped++;
                continue;
            }
            if (!nearFence && b.dy > 10 && isHeavyStructureMaterial(b.material)) {
                skipped++;
                continue;
            }
            int x = cx + b.dx;
            int z = cz + b.dz;
            int chebAbs = Math.max(Math.abs(b.dx), Math.abs(b.dz));
            if (half > 0 && chebAbs > half) {
                String matName = b.material != null ? b.material.toUpperCase(java.util.Locale.ROOT) : "";
                if (matName.contains("FENCE") || matName.contains("BRICK") || matName.contains("_WALL")
                        || matName.contains("GLASS") || matName.contains("_LOG")
                        || matName.contains("COBBLESTONE") || matName.contains("CONCRETE")) {
                    skipped++;
                    continue;
                }
            }
            if (plugin.getGameSessionService() != null && plugin.getGameSessionService().isInsideActiveCage(x, z)) {
                skipped++;
                continue;
            }
            int y = floorY + b.dy;
            // ห้ามแปะทับหอ/บ่อน้ำ
            if (FarmBuilder.isTowerPondZone(x, z, cx, cz)) { skipped++; continue; }
            Material mat;
            try {
                mat = Material.valueOf(b.material);
            } catch (IllegalArgumentException ex) {
                continue;
            }
            if (mat.isAir() || mat == Material.BEDROCK || mat == Material.WHEAT) continue;
            // ไม่แปะรั้วไม้เก่าทับกำแพงหินใหม่ (ไฟล์ farm_decorations.yml รุ่นก่อน)
            if (nearFence && isLegacyOakFenceMat(mat)) {
                skipped++;
                continue;
            }
            Block block = world.getBlockAt(x, y, z);
            try {
                if (b.blockData != null && !b.blockData.isEmpty()) {
                    block.setBlockData(plugin.getServer().createBlockData(b.blockData), false);
                } else {
                    block.setType(mat, false);
                }
                pasted++;
            } catch (IllegalArgumentException ex) {
                block.setType(mat, false);
                pasted++;
            }
        }
        plugin.getLogger().info("Restored " + pasted + " farm decoration blocks"
                + (skipped > 0 ? " (skipped " + skipped + " floating/tower)" : ""));
    }

    private static boolean isLegacyOakFenceMat(Material mat) {
        return mat == Material.OAK_FENCE || mat == Material.OAK_FENCE_GATE
                || mat == Material.STRIPPED_OAK_LOG || mat == Material.OAK_LOG
                || mat == Material.SPRUCE_PLANKS;
    }

    private static boolean isHeavyStructureMaterial(String name) {
        if (name == null) return false;
        String n = name.toUpperCase(Locale.ROOT);
        // ไม่รวม STONE_BRICKS / อิฐทั่วไป — แอดมินใช้ทำรั้ว
        return n.contains("DEEPSLATE") || n.contains("BLACKSTONE") || n.contains("BASALT")
                || n.contains("COBBLED")
                || n.equals("POLISHED_ANDESITE") || n.equals("POLISHED_DIORITE") || n.equals("POLISHED_GRANITE")
                || n.contains("NETHER_BRICK") || n.contains("PRISMARINE")
                || n.equals("OBSIDIAN") || n.equals("CRYING_OBSIDIAN") || n.equals("MAGMA_BLOCK")
                || n.equals("NETHERRACK");
    }

    public int snapshotAndSaveFarm(World world, int cx, int cz, int floorY, int half, int pad) {
        List<SavedBlock> captured = captureFarmFromWorld(world, cx, cz, floorY, half, pad);
        farmCached = new ArrayList<>(captured);
        farmSavedHalf = Math.max(FarmBuilder.MIN_HALF, half);
        saveFarmToDisk();
        plugin.getLogger().info("Farm decor snapshot: " + captured.size()
                + " blocks (half=" + farmSavedHalf + " pad=" + pad + " floorY=" + floorY + ")");
        return captured.size();
    }

    public void saveFarmToDisk() {
        FileConfiguration yaml = new YamlConfiguration();
        yaml.set("version", 2);
        yaml.set("half", farmSavedHalf > 0 ? farmSavedHalf : -1);
        List<String> lines = new ArrayList<>(farmCached.size());
        for (SavedBlock b : farmCached) {
            String data = b.blockData == null ? "" : b.blockData.replace('|', '/');
            lines.add(b.dx + "|" + b.dy + "|" + b.dz + "|" + b.material + "|" + data);
        }
        yaml.set("blocks", lines);
        try {
            if (!plugin.getDataFolder().exists()) plugin.getDataFolder().mkdirs();
            yaml.save(farmFile);
            plugin.getLogger().info("Saved " + farmCached.size() + " farm decoration blocks → farm_decorations.yml (half="
                    + farmSavedHalf + ")");
        } catch (IOException e) {
            plugin.getLogger().log(Level.WARNING, "Failed to save farm_decorations.yml", e);
        }
    }

    public void clearFarmDecorations() {
        farmCached = new ArrayList<>();
        farmSavedHalf = -1;
        saveFarmToDisk();
        plugin.getLogger().info("Cleared farm_decorations.yml (prevent floating structures)");
    }

    public void loadFarmFromDisk() {
        farmCached = new ArrayList<>();
        farmSavedHalf = -1;
        if (!farmFile.exists()) return;
        FileConfiguration yaml = YamlConfiguration.loadConfiguration(farmFile);
        farmSavedHalf = yaml.getInt("half", -1);
        for (String line : yaml.getStringList("blocks")) {
            if (line == null || line.isEmpty()) continue;
            String[] p = line.split("\\|", 5);
            if (p.length < 4) continue;
            try {
                farmCached.add(new SavedBlock(
                        Integer.parseInt(p[0]), Integer.parseInt(p[1]), Integer.parseInt(p[2]),
                        p[3].toUpperCase(Locale.ROOT), p.length >= 5 ? p[4] : ""));
            } catch (NumberFormatException ignored) {}
        }
        if (farmSavedHalf < FarmBuilder.MIN_HALF) {
            farmSavedHalf = inferHalfFromCache();
        }
        plugin.getLogger().info("Loaded " + farmCached.size() + " farm decoration blocks from farm_decorations.yml (half="
                + farmSavedHalf + ")");
    }

    /** ประมาณ half จากบล็อกรั้วใน cache (ไฟล์เก่าที่ยังไม่มี field half) */
    private int inferHalfFromCache() {
        if (farmCached == null || farmCached.isEmpty()) return -1;
        int[] hist = new int[Math.min(MAX_INFER_HALF, 257)];
        for (SavedBlock b : farmCached) {
            if (b.dy < 0 || b.dy > 8) continue;
            if (!isPerimeterStructureMat(b.material)) continue;
            int cheb = Math.max(Math.abs(b.dx), Math.abs(b.dz));
            if (cheb < FarmBuilder.MIN_HALF || cheb >= hist.length) continue;
            hist[cheb]++;
        }
        int best = -1;
        int bestCount = 0;
        for (int h = FarmBuilder.MIN_HALF; h < hist.length; h++) {
            if (hist[h] >= bestCount && hist[h] >= 8) {
                bestCount = hist[h];
                best = h;
            }
        }
        return best;
    }

    private static final int MAX_INFER_HALF = 256;
}
