package com.tokcontrol.minecraft;

import com.google.gson.JsonObject;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.entity.TNTPrimed;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.Random;

public final class BlockActionService {

    private final TokControlPlugin plugin;
    private final PathZoneService pathZone;
    private final GameSessionService gameSession;
    private final Random random = new Random();

    public BlockActionService(TokControlPlugin plugin, PathZoneService pathZone, GameSessionService gameSession) {
        this.plugin = plugin;
        this.pathZone = pathZone;
        this.gameSession = gameSession;
    }

    public String handleSync(JsonObject json) {
        String cmd = json.has("cmd") ? json.get("cmd").getAsString() : "";
        String user = json.has("user") ? json.get("user").getAsString() : "viewer";
        if (plugin.isFarmMode() && isBoxArenaCommand(cmd)) {
            throw new IllegalStateException("เซิร์ฟนี้เป็น Farm Control — ปิด Farm แล้วเปิดเซิร์ฟ Box Control ก่อน");
        }
        if (plugin.isFishMode() && isBoxArenaCommand(cmd)) {
            throw new IllegalStateException("เซิร์ฟนี้เป็น Fish Control — เปิดเซิร์ฟ Box Control ก่อน");
        }
        if (plugin.isTowerMode() && isBoxArenaCommand(cmd)) {
            throw new IllegalStateException("เซิร์ฟนี้เป็น Tower Wars — เปิดเซิร์ฟ Box Control ก่อน");
        }
        Player target = plugin.resolveStreamer();
        boolean cmdNeedsPlayer = !cmd.equals("arena_rebuild")
                && !cmd.equals("mc_build_bedrock_map")
                && !cmd.equals("mc_reset_map")
                && !cmd.equals("mc_save_decor")
                && !cmd.equals("mc_load_decor")
                && !cmd.equals("mc_expand_map")
                && !cmd.equals("mc_shrink_map")
                && !cmd.equals("mc_lava_melt")
                && !cmd.equals("mc_villager_help")
                && !cmd.equals("mc_help_one_layer")
                && !cmd.equals("mc_help_ten_rows")
                && !cmd.equals("mc_admin_mode")
                && !cmd.equals("mc_summon_tnt")
                && !cmd.equals("mc_summon_tnt_strong")
                && !cmd.equals("mc_minus_win")
                && !cmd.equals("mc_plus_win")
                && !cmd.equals("tc_announce")
                && !cmd.equals("announce")
                && !cmd.equals("viewer_announce")
                && !cmd.equals("say");
        if (target == null && cmdNeedsPlayer) {
            throw new IllegalStateException("ไม่มีผู้เล่น " + plugin.getStreamerName() + " ออนไลน์ — เข้าเกมด้วยชื่อนี้ก่อน");
        }
        World world = target != null ? target.getWorld() : (Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0));
        if (world == null && isBoxArenaCommand(cmd)) {
            throw new IllegalStateException("ยังไม่มี world — เปิดเซิร์ฟเวอร์ก่อน");
        }
        String placement = json.has("placement") ? json.get("placement").getAsString() : "random_near";

        return switch (cmd) {
            case "place_block" -> {
                Material mat = parseMaterial(json.has("block") ? json.get("block").getAsString() : "minecraft:obsidian");
                int count = json.has("count") ? Math.max(1, json.get("count").getAsInt()) : 1;
                for (int i = 0; i < count; i++) {
                    Location loc = resolvePlacement(target, placement, i);
                    setBlock(world, loc, mat);
                }
                broadcast(target, user, "วาง " + mat.name());
                yield "placed " + count;
            }
            case "place_trap" -> {
                String trap = json.has("trap") ? json.get("trap").getAsString() : "obsidian_pillar";
                applyTrap(target, trap);
                broadcast(target, user, "ทริก " + trap);
                yield "trap " + trap;
            }
            case "fill_line" -> {
                Material mat = parseMaterial(json.has("block") ? json.get("block").getAsString() : "minecraft:obsidian");
                int len = json.has("length") ? Math.max(1, json.get("length").getAsInt()) : 5;
                Location start = resolvePlacement(target, placement, 0);
                var dir = target.getLocation().getDirection();
                int dx = Math.abs(dir.getX()) >= Math.abs(dir.getZ()) ? (dir.getX() >= 0 ? 1 : -1) : 0;
                int dz = dx == 0 ? (dir.getZ() >= 0 ? 1 : -1) : 0;
                for (int i = 0; i < len; i++) {
                    setBlock(world, start.clone().add(dx * i, 0, dz * i), mat);
                }
                broadcast(target, user, "ต่อเส้น " + mat.name());
                yield "line " + len;
            }
            case "block_rain" -> {
                Material mat = parseMaterial(json.has("block") ? json.get("block").getAsString() : "minecraft:anvil");
                int count = json.has("count") ? Math.min(50, Math.max(1, json.get("count").getAsInt())) : 3;
                Location base = target.getLocation().clone().add(0, 8, 0);
                for (int i = 0; i < count; i++) {
                    Location loc = base.clone().add(random.nextInt(5) - 2, random.nextInt(3), random.nextInt(5) - 2);
                    setBlock(world, loc, mat);
                }
                broadcast(target, user, "ฝน " + mat.name());
                yield "rain " + count;
            }
            case "zone_expand" -> {
                int amount = json.has("amount") ? json.get("amount").getAsInt() : 2;
                int size = pathZone.expand(amount);
                broadcast(target, user, "ขยายเขต → " + size);
                yield "expand " + size;
            }
            case "zone_shrink" -> {
                int amount = json.has("amount") ? json.get("amount").getAsInt() : 2;
                int size = pathZone.shrink(amount);
                broadcast(target, user, "ลดเขต → " + size);
                yield "shrink " + size;
            }
            case "path_bridge" -> {
                int length = json.has("length") ? json.get("length").getAsInt() : 5;
                int placed = pathZone.bridge(target, length);
                broadcast(target, user, "ต่อบล็อกชั้น " + (plugin.getArenaState().detectLayerFromY(target.getLocation().getBlockY()) + 1) + " → " + placed + " ช่อง");
                yield "bridge " + placed;
            }
            case "path_build_layer" -> {
                int built = pathZone.buildNextLayer();
                broadcast(target, user, built >= plugin.getArenaState().getLayers()
                        ? "สร้างครบ " + plugin.getArenaState().getLayers() + " ชั้นแล้ว!"
                        : "สร้างชั้นที่ " + built);
                if (pathZone.isTowerComplete() && plugin.getConfig().getBoolean("win.auto-on-fill", true)) {
                    int sec = plugin.getConfig().getInt("win.countdown-seconds", 15);
                    gameSession.startWinCountdown(sec);
                }
                yield "layer " + built;
            }
            case "path_melt_all" -> {
                int melted = pathZone.meltAll();
                broadcast(target, user, "ละลายทางเดินทั้งหมด!");
                yield "melt " + melted;
            }
            case "path_fill_all" -> {
                int filled = pathZone.fillAll();
                int layers = plugin.getArenaState().getLayers();
                broadcast(target, user, "เติมครบ " + layers + " ชั้น!");
                if (pathZone.isTowerComplete() && plugin.getConfig().getBoolean("win.auto-on-fill", true)) {
                    int sec = plugin.getConfig().getInt("win.countdown-seconds", 15);
                    gameSession.startWinCountdown(sec);
                }
                yield "fill " + filled;
            }
            case "zone_tnt" -> {
                int level = json.has("level") ? json.get("level").getAsInt() : 1;
                int blasted = pathZone.tntBlast(level);
                broadcast(target, user, "TNT ระดับ " + level + " → " + blasted + " ช่อง");
                yield "tnt " + blasted;
            }
            case "win_start_countdown" -> {
                int sec = json.has("seconds") ? json.get("seconds").getAsInt() : plugin.getConfig().getInt("win.countdown-seconds", 15);
                gameSession.startWinCountdown(sec);
                broadcast(target, user, "เริ่มนับถอยหลังชนะ " + sec + " วิ");
                yield "win_cd " + sec;
            }
            case "stun_player" -> {
                int sec = json.has("seconds") ? json.get("seconds").getAsInt() : 10;
                gameSession.stunPlayer(sec);
                broadcast(target, user, "ห้องขัง (" + sec + " วิ)");
                yield "stun " + sec;
            }
            case "stun_add" -> {
                int sec = json.has("seconds") ? json.get("seconds").getAsInt() : 10;
                gameSession.addStun(sec);
                broadcast(target, user, "ห้องขัง +" + sec + " วิ");
                yield "stun_add " + sec;
            }
            case "stun_reduce" -> {
                int sec = json.has("seconds") ? json.get("seconds").getAsInt() : 10;
                gameSession.reduceStun(sec);
                broadcast(target, user, "ลดเวลาห้องขัง -" + sec + " วิ");
                yield "stun_reduce " + sec;
            }
            case "arena_rebuild" -> {
                World w = target != null ? target.getWorld() : (Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0));
                if (w == null) throw new IllegalStateException("ยังไม่มี world — เปิดเซิร์ฟเวอร์ก่อน");
                plugin.getConfig().set("arena.expand-level", 4);
                plugin.saveConfig();
                plugin.getArenaBuilder().buildBedrockMap(w, w.getSpawnLocation(), 4, plugin.getConfig().getInt("arena.height", 9), true);
                if (target != null) {
                    target.teleport(plugin.getArenaBuilder().spawnLocation(w));
                    plugin.enablePlayerFlight(target);
                    plugin.giveBuildKit(target);
                }
                broadcast(target, user, "สร้างแมพ Bedrock 9×9");
                yield "arena_rebuild";
            }
            case "mc_build_bedrock_map" -> {
                // ค่าเริ่มต้น Lv.4 = แมพ 9×9 (ปุ่มสร้างแมพ)
                int level = json.has("level") && !json.get("level").isJsonNull()
                        ? json.get("level").getAsInt()
                        : 4;
                if (level < 0) level = 4;
                int height = json.has("height") && !json.get("height").isJsonNull()
                        ? json.get("height").getAsInt()
                        : plugin.getConfig().getInt("arena.height", 9);
                World buildWorld = world != null ? world
                        : (target != null ? target.getWorld() : (Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0)));
                if (buildWorld == null) throw new IllegalStateException("ยังไม่มี world — เปิดเซิร์ฟเวอร์ก่อน");
                Location center = target != null ? target.getLocation() : buildWorld.getSpawnLocation();
                plugin.getArenaBuilder().buildBedrockMap(buildWorld, center, level, height, true);
                if (target != null) {
                    target.teleport(plugin.getArenaBuilder().spawnLocation(buildWorld));
                    plugin.enablePlayerFlight(target);
                    plugin.giveBuildKit(target);
                }
                broadcast(target, user, "สร้างแมพขอบ Bedrock Lv." + plugin.getArenaBuilder().getCurrentExpandLevel()
                        + " (" + plugin.getArenaBuilder().playSizeForLevel(plugin.getArenaBuilder().getCurrentExpandLevel()) + "x"
                        + plugin.getArenaBuilder().playSizeForLevel(plugin.getArenaBuilder().getCurrentExpandLevel()) + ")");
                yield "mc_build_bedrock_map " + plugin.getArenaBuilder().getCurrentExpandLevel();
            }
            case "mc_expand_map" -> {
                java.util.Map<java.util.UUID, int[]> cageRemain = gameSession.snapshotCages();
                gameSession.detachCagesWithoutRestore();
                int level = plugin.getArenaBuilder().expandBedrockMap(world, null);
                gameSession.reapplyCages(cageRemain);
                int size = plugin.getArenaBuilder().playSizeForLevel(level);
                Location sfx = target != null ? target.getLocation()
                        : new Location(world, plugin.getArenaState().getCenterX(),
                        plugin.getArenaState().getFloorY() + 2, plugin.getArenaState().getCenterZ());
                world.playSound(sfx, org.bukkit.Sound.BLOCK_BEACON_ACTIVATE, 1f, 1.3f);
                world.playSound(sfx, org.bukkit.Sound.BLOCK_NOTE_BLOCK_CHIME, 0.8f, 1.6f);
                broadcast(target, user, "ขยายแมพ → " + size + "×" + size);
                yield "mc_expand_map " + level;
            }
            case "mc_shrink_map" -> {
                java.util.Map<java.util.UUID, int[]> cageRemain = gameSession.snapshotCages();
                gameSession.detachCagesWithoutRestore();
                int level = plugin.getArenaBuilder().shrinkBedrockMap(world, null);
                gameSession.reapplyCages(cageRemain);
                int size = plugin.getArenaBuilder().playSizeForLevel(level);
                Location sfx = target != null ? target.getLocation()
                        : new Location(world, plugin.getArenaState().getCenterX(),
                        plugin.getArenaState().getFloorY() + 2, plugin.getArenaState().getCenterZ());
                world.playSound(sfx, org.bukkit.Sound.BLOCK_BEACON_DEACTIVATE, 1f, 1.2f);
                world.playSound(sfx, org.bukkit.Sound.BLOCK_NOTE_BLOCK_BASS, 0.8f, 0.7f);
                broadcast(target, user, "ลดแมพ → " + size + "×" + size);
                yield "mc_shrink_map " + level;
            }
            case "mc_reset_map" -> {
                int level = plugin.getArenaBuilder().resetBedrockMap(world);
                broadcast(target, user, "ล้างบล็อกในแมพ Lv." + level);
                yield "mc_reset_map " + level;
            }
            case "mc_summon_tnt" -> {
                for (Player p : world.getPlayers()) {
                    TNTPrimed tnt = p.getWorld().spawn(p.getLocation().add(0, 3, 0), TNTPrimed.class);
                    tnt.setFuseTicks(35);
                    tnt.setYield(5.5f);
                    tnt.setIsIncendiary(false);
                }
                broadcast(target, user, "เสก TNT บนหัว");
                yield "mc_summon_tnt";
            }
            case "mc_summon_tnt_strong" -> {
                for (Player p : world.getPlayers()) {
                    for (int i = 0; i < 2; i++) {
                        TNTPrimed tnt = p.getWorld().spawn(p.getLocation().add(i - 0.5, 3.5, 0), TNTPrimed.class);
                        tnt.setFuseTicks(30);
                        tnt.setYield(9.0f);
                        tnt.setIsIncendiary(false);
                    }
                }
                broadcast(target, user, "เสก TNT แรง!");
                yield "mc_summon_tnt_strong";
            }
            case "mc_give_blocks" -> {
                int count = json.has("count") ? Math.max(1, json.get("count").getAsInt()) : 16;
                Material mat = parseMaterial(json.has("block") ? json.get("block").getAsString() : "minecraft:amethyst_block");
                for (Player p : world.getPlayers()) {
                    p.getInventory().addItem(new ItemStack(mat, count));
                }
                broadcast(target, user, "แจก " + mat.name() + " x" + count);
                yield "mc_give_blocks " + count;
            }
            case "mc_like_glass" -> {
                int seconds = json.has("seconds") ? Math.max(1, json.get("seconds").getAsInt()) : 10;
                placeTemporaryGlassPlatforms(world, seconds);
                broadcast(target, user, "แท่นกระจกกันตก " + seconds + " วิ");
                yield "mc_like_glass " + seconds;
            }
            case "mc_lava_melt" -> {
                gameSession.startLavaMelt();
                broadcast(target, user, "ลาวาหลอมแมพจากชั้นบน");
                yield "mc_lava_melt";
            }
            case "mc_villager_help" -> {
                gameSession.startVillagerHelp();
                broadcast(target, user, "ช่วยต่อเต็มทันที");
                yield "mc_villager_help";
            }
            case "mc_help_one_layer" -> {
                gameSession.helpFillOneLayer();
                broadcast(target, user, "ช่วยต่อ 1 ชั้น");
                yield "mc_help_one_layer";
            }
            case "mc_help_ten_rows" -> {
                gameSession.helpFillTenRows();
                broadcast(target, user, "ช่วยต่อ 1 แถว");
                yield "mc_help_ten_rows";
            }
            case "mc_minus_win" -> {
                gameSession.playMinusWinAnim();
                broadcast(target, user, "ลบวิน!");
                yield "mc_minus_win";
            }
            case "mc_plus_win" -> {
                gameSession.playPlusWinAnim();
                broadcast(target, user, "บวกวิน!");
                yield "mc_plus_win";
            }
            case "mc_admin_mode" -> {
                if (target == null) throw new IllegalStateException("ไม่มีผู้เล่น");
                // ให้สิทธิ์สตรีมเมอร์อัตโนมัติเมื่อเปิดจาก TokControl
                plugin.ensureStreamerAdmin(target);
                if (plugin.getStreamerName().isEmpty()) plugin.setStreamerName(target.getName());
                boolean on = !json.has("on") || json.get("on").getAsBoolean();
                if (json.has("toggle") && json.get("toggle").getAsBoolean()) {
                    plugin.setAdminDecorateMode(target, !plugin.isAdminDecorateMode(target));
                } else {
                    plugin.setAdminDecorateMode(target, on);
                }
                broadcast(target, user, plugin.isAdminDecorateMode(target) ? "เปิดโหมดแอดมินตกแต่ง" : "ปิดโหมดแอดมิน");
                yield "mc_admin_mode";
            }
            case "mc_save_decor", "save_decor" -> {
                int n = plugin.getArenaBuilder().saveDecorationsNow();
                broadcast(target, user, "บันทึกแมพตกแต่ง " + n + " บล็อก");
                yield "mc_save_decor";
            }
            case "mc_load_decor", "load_decor" -> {
                DecorationStore store = plugin.getDecorationStore();
                store.loadFromDisk();
                World dw = plugin.getArenaState().getWorld();
                if (dw == null && target != null) dw = target.getWorld();
                if (dw == null) throw new IllegalStateException("ไม่มีโลกแมพ");
                int border = plugin.getArenaBuilder().getCurrentExpandLevel() + 1;
                int floorY = plugin.getArenaState().getFloorY();
                int cx = plugin.getArenaState().getCenterX();
                int cz = plugin.getArenaState().getCenterZ();
                store.paste(dw, cx, cz, floorY, border, store.getCached());
                broadcast(target, user, "โหลดแมพตกแต่ง " + store.size() + " บล็อก");
                yield "mc_load_decor";
            }
            case "say" -> {
                String msg = json.has("message") ? json.get("message").getAsString() : ("@" + user);
                plugin.getLogger().info("[TikTok] " + user + ": " + msg);
                ViewerAnnounce.show(user, msg);
                yield "say";
            }
            case "tc_announce", "announce", "viewer_announce" -> {
                String msg = json.has("message") ? json.get("message").getAsString()
                        : (json.has("action") ? json.get("action").getAsString() : "ทริกเกอร์");
                ViewerAnnounce.show(user, msg);
                yield "announce";
            }
            default -> throw new IllegalArgumentException("unknown cmd: " + cmd);
        };
    }

    private void applyTrap(Player target, String trap) {
        World world = target.getWorld();
        Location base = target.getLocation().getBlock().getLocation();
        switch (trap) {
            case "obsidian_pillar" -> {
                for (int y = 0; y < 5; y++) {
                    setBlock(world, base.clone().add(1, y, 0), Material.OBSIDIAN);
                }
            }
            case "lava_pool" -> {
                for (int x = -1; x <= 1; x++) {
                    for (int z = -1; z <= 1; z++) {
                        setBlock(world, base.clone().add(x, -1, z), Material.LAVA);
                    }
                }
            }
            case "bedrock_cage" -> {
                for (int y = 0; y <= 2; y++) {
                    setBlock(world, base.clone().add(1, y, 0), Material.BEDROCK);
                    setBlock(world, base.clone().add(-1, y, 0), Material.BEDROCK);
                    setBlock(world, base.clone().add(0, y, 1), Material.BEDROCK);
                    setBlock(world, base.clone().add(0, y, -1), Material.BEDROCK);
                    setBlock(world, base.clone().add(0, y, 2), Material.BEDROCK);
                }
            }
            case "block_wall" -> {
                for (int x = -1; x <= 1; x++) {
                    for (int y = 0; y <= 2; y++) {
                        setBlock(world, base.clone().add(x, y, 2), Material.OBSIDIAN);
                    }
                }
            }
            default -> setBlock(world, base.clone().add(0, 1, 0), Material.OBSIDIAN);
        }
    }

    private void placeTemporaryGlassPlatforms(World world, int seconds) {
        for (Player player : world.getPlayers()) {
            Location base = player.getLocation().getBlock().getLocation().add(0, -1, 0);
            for (int x = -2; x <= 2; x++) {
                for (int z = -2; z <= 2; z++) {
                    setBlock(world, base.clone().add(x, 0, z), Material.GLASS);
                }
            }
        }
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            for (Player player : world.getPlayers()) {
                Location base = player.getLocation().getBlock().getLocation().add(0, -1, 0);
                for (int x = -2; x <= 2; x++) {
                    for (int z = -2; z <= 2; z++) {
                        Block block = world.getBlockAt(base.clone().add(x, 0, z));
                        if (block.getType() == Material.GLASS) block.setType(Material.AIR, false);
                    }
                }
            }
        }, Math.max(1, seconds) * 20L);
    }

    private Location resolvePlacement(Player player, String placement, int index) {
        Location loc = player.getLocation().clone();
        switch (placement) {
            case "above_player" -> loc.add(0, 2 + index, 0);
            case "in_front" -> {
                var d = loc.getDirection().normalize();
                loc.add(d.getX() * 2, 0, d.getZ() * 2);
            }
            case "near_player" -> loc.add(index % 2 == 0 ? 2 : -2, 0, index % 3 == 0 ? 2 : -2);
            default -> loc.add(random.nextInt(7) - 3, random.nextInt(2), random.nextInt(7) - 3);
        }
        ArenaState state = plugin.getArenaState();
        if (state != null && state.getWorld() != null) {
            int layer = state.detectLayerFromY(player.getLocation().getBlockY());
            loc.setY(state.layerWalkY(layer));
        } else {
            loc.setY(Math.floor(player.getLocation().getY()));
        }
        return loc;
    }

    private static boolean isBoxArenaCommand(String cmd) {
        if (cmd == null) return false;
        if (cmd.startsWith("mc_")) return true;
        return switch (cmd) {
            case "place_block", "place_trap", "fill_line", "block_rain",
                 "arena_rebuild", "path_bridge", "path_build_layer",
                 "path_melt_all", "path_fill_all",
                 "zone_expand", "zone_shrink", "zone_tnt",
                 "win_start_countdown" -> true;
            default -> false;
        };
    }

    private void setBlock(World world, Location loc, Material mat) {
        Block block = world.getBlockAt(loc);
        block.setType(mat, false);
    }

    private Material parseMaterial(String id) {
        String name = id.replace("minecraft:", "").toUpperCase();
        Material m = Material.matchMaterial(name);
        if (m == null || !m.isBlock()) {
            return Material.OBSIDIAN;
        }
        return m;
    }

    private void broadcast(Player target, String user, String action) {
        String who = target != null ? target.getName() : "server";
        plugin.getLogger().info("[TokControl] " + user + " -> " + action + " on " + who);
        ViewerAnnounce.show(user, action);
    }
}
