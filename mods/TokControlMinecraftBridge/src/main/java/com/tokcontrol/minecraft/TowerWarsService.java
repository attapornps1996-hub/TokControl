package com.tokcontrol.minecraft;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.title.Title;
import org.bukkit.Bukkit;
import org.bukkit.Color;
import org.bukkit.GameMode;
import org.bukkit.GameRule;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.attribute.Attribute;
import org.bukkit.boss.BarColor;
import org.bukkit.boss.BarStyle;
import org.bukkit.boss.BossBar;
import org.bukkit.entity.Blaze;
import org.bukkit.entity.Drowned;
import org.bukkit.entity.EnderCrystal;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Horse;
import org.bukkit.entity.Husk;
import org.bukkit.entity.IronGolem;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Mob;
import org.bukkit.entity.PiglinBrute;
import org.bukkit.entity.Player;
import org.bukkit.entity.Skeleton;
import org.bukkit.entity.Zombie;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.entity.EntityTargetLivingEntityEvent;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.inventory.EntityEquipment;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.LeatherArmorMeta;
import org.bukkit.NamespacedKey;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.scheduler.BukkitTask;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Tower Wars — สตรีมเมอร์ลอยดู · ทหารหลายแบบ · UI ซ้ายแดง/ขวาฟ้า · พังกำแพงตามเลือด
 */
public final class TowerWarsService implements Listener {

    public enum Team { BLUE, RED }

    public enum Phase { PREP, COUNTDOWN, LIVE }

    public enum TroopType {
        SMALL, MEDIUM, LARGE, CAVALRY, ARCHER, FIRE
    }

    private static final double KING_MAX_HP = 200.0;
    private static final double[] THRESHOLDS = { 0.70, 0.50, 0.30, 0.10, 0.0 };
    private static final int DEFAULT_PREP_SEC = 60;
    private static final int DEFAULT_COUNTDOWN_SEC = 5;

    private final TokControlPlugin plugin;
    private final TowerCastleBuilder builder;
    private final NamespacedKey keyRole;
    private final NamespacedKey keyTeam;
    private final NamespacedKey keyLink;

    private final Map<UUID, Team> playerTeams = new HashMap<>();
    private LivingEntity blueKing;
    private LivingEntity redKing;
    private final List<EnderCrystal> blueCrystals = new ArrayList<>();
    private final List<EnderCrystal> redCrystals = new ArrayList<>();
    private int blueCrystalIdx;
    private int redCrystalIdx;
    private int blueWallStage = -1;
    private int redWallStage = -1;
    private boolean blueDead;
    private boolean redDead;
    private boolean roundOver;
    private BossBar blueBar;
    private BossBar redBar;
    private BukkitTask tickTask;
    private boolean active;
    private Phase phase = Phase.PREP;
    private int prepSecondsLeft;
    private int countdownLeft;
    private int tickCounter;

    public TowerWarsService(TokControlPlugin plugin, TowerCastleBuilder builder) {
        this.plugin = plugin;
        this.builder = builder;
        this.keyRole = new NamespacedKey(plugin, "tw_role");
        this.keyTeam = new NamespacedKey(plugin, "tw_team");
        this.keyLink = new NamespacedKey(plugin, "tw_link");
    }

    public TowerCastleBuilder getBuilder() { return builder; }
    public boolean isActive() { return active; }
    public boolean isRoundOver() { return roundOver; }
    public Phase getPhase() { return phase; }
    public boolean isCombatLive() { return phase == Phase.LIVE; }

    public void start(World world) {
        start(world, DEFAULT_PREP_SEC);
    }

    public void start(World world, int prepSec) {
        if (world == null) return;
        clearTagged(world);
        builder.buildArena(world);
        try {
            world.setGameRule(GameRule.DO_DAYLIGHT_CYCLE, false);
            world.setGameRule(GameRule.DO_MOB_SPAWNING, false);
            world.setTime(6000L);
        } catch (Exception ignored) {}
        spawnKingsAndCrystals(world);
        startHud();
        roundOver = false;
        blueDead = false;
        redDead = false;
        blueCrystalIdx = 0;
        redCrystalIdx = 0;
        blueWallStage = -1;
        redWallStage = -1;
        active = true;
        phase = Phase.PREP;
        prepSecondsLeft = Math.max(15, Math.min(600, prepSec));
        countdownLeft = 0;
        tickCounter = 0;
        setKingsInvulnerable(true);
        if (tickTask != null) tickTask.cancel();
        tickTask = Bukkit.getScheduler().runTaskTimer(plugin, this::tick, 10L, 10L);

        for (Player p : Bukkit.getOnlinePlayers()) {
            prepareJoiningPlayer(p);
        }
        broadcast("§6§lTower Wars §f— ช่วงเตรียมตัว §e" + prepSecondsLeft + "§f วิ");
        broadcast("§7ส่งมอนรอทั้ง 2 ฝั่งได้ · กดเริ่มศึกเมื่อพร้อม · มอนไม่ไหม้แดด");
        titleAll("เตรียมตัว", "ส่งทหารรอในแมพ · " + prepSecondsLeft + " วิ");
    }

    public ActionResult beginBattle() {
        if (!active) return ActionResult.fail("not_active");
        if (roundOver) return ActionResult.fail("round_over");
        if (phase == Phase.LIVE) return ActionResult.fail("already_live");
        if (phase == Phase.COUNTDOWN) return ActionResult.ok(null);
        phase = Phase.COUNTDOWN;
        countdownLeft = DEFAULT_COUNTDOWN_SEC;
        prepSecondsLeft = 0;
        broadcast("§6§lเริ่มศึกในอีก §e" + countdownLeft + "§6 วิ!");
        titleAll("เตรียมบุก!", String.valueOf(countdownLeft));
        return ActionResult.ok(null);
    }

    public ActionResult startPrep(int seconds) {
        if (!active) return ActionResult.fail("not_active");
        phase = Phase.PREP;
        prepSecondsLeft = Math.max(10, Math.min(600, seconds));
        countdownLeft = 0;
        setKingsInvulnerable(true);
        freezeAllTroops(true);
        broadcast("§eช่วงเตรียมตัว §f" + prepSecondsLeft + " วิ — ส่งมอนรอได้");
        return ActionResult.ok(null);
    }

    private void goLive() {
        phase = Phase.LIVE;
        setKingsInvulnerable(false);
        freezeAllTroops(false);
        assignAllCombatTargets();
        broadcast("§a§lศึกเริ่มแล้ว! §fมอนทั้งสองฝ่ายบุกปราสาท");
        titleAll("เริ่มศึก!", "บุกปราสาทฝั่งตรงข้าม");
        updateHud();
    }

    private void titleAll(String main, String sub) {
        for (Player p : Bukkit.getOnlinePlayers()) {
            p.showTitle(Title.title(
                    Component.text(main, NamedTextColor.GOLD),
                    Component.text(sub, NamedTextColor.WHITE),
                    Title.Times.times(Duration.ofMillis(100), Duration.ofSeconds(2), Duration.ofMillis(300))
            ));
        }
    }

    private void setKingsInvulnerable(boolean on) {
        if (blueKing != null && blueKing.isValid()) blueKing.setInvulnerable(on);
        if (redKing != null && redKing.isValid()) redKing.setInvulnerable(on);
    }

    public void prepareJoiningPlayer(Player player) {
        if (player == null || !active) return;
        boolean streamer = isStreamerOrSolo(player);
        if (streamer) {
            enableSpectatorFly(player);
        } else {
            Location mid = builder.getMidSpawn();
            if (mid != null) player.teleport(mid);
            player.setGameMode(GameMode.SURVIVAL);
            player.getInventory().clear();
            giveStarterKit(player);
        }
        player.sendMessage("§6§l[Tower Wars] §fพิมพ์ §b1/A §f= ทีมฟ้า · §c2/B §f= ทีมแดง ก่อนส่งทหาร");
    }

    private boolean isStreamerOrSolo(Player player) {
        if (player == null) return false;
        if (player.isOp() || player.hasPermission("tokcontrol.admin")) return true;
        String sn = plugin.getStreamerName();
        if (!sn.isEmpty() && sn.equalsIgnoreCase(player.getName())) return true;
        return Bukkit.getOnlinePlayers().size() <= 1;
    }

    /** สตรีมเมอร์ลอยดูเหนือสนาม */
    public void enableSpectatorFly(Player player) {
        if (player == null) return;
        plugin.ensureStreamerAdmin(player);
        Location look = builder.getOverlook();
        if (look == null) look = builder.getMidSpawn();
        if (look != null) {
            Location up = look.clone();
            up.setY(builder.getFloorY() + 28);
            player.teleport(up);
        }
        player.setGameMode(GameMode.SURVIVAL);
        player.setAllowFlight(true);
        player.setFlying(true);
        player.setFlySpeed(0.15f);
        player.setInvulnerable(true);
        player.getInventory().clear();
        player.sendMessage("§a§lโหมดลอยดู §f— บินเหนือสนาม · พิมพ์ 1/A หรือ 2/B ถ้าจะลงไปเล่น");
        player.showTitle(Title.title(
                Component.text("SPECTATE", NamedTextColor.GOLD),
                Component.text("ลอยดู · พิมพ์ 1/A หรือ 2/B เพื่อเข้าทีม", NamedTextColor.GRAY),
                Title.Times.times(Duration.ofMillis(100), Duration.ofSeconds(3), Duration.ofMillis(400))
        ));
    }

    private void giveStarterKit(Player player) {
        player.getInventory().addItem(new ItemStack(Material.IRON_SWORD, 1));
        player.getInventory().addItem(new ItemStack(Material.SHIELD, 1));
        player.getInventory().addItem(new ItemStack(Material.BOW, 1));
        player.getInventory().addItem(new ItemStack(Material.ARROW, 32));
        player.getInventory().addItem(new ItemStack(Material.COOKED_BEEF, 16));
        player.getInventory().addItem(new ItemStack(Material.COBBLESTONE, 64));
        player.getInventory().setHelmet(new ItemStack(Material.IRON_HELMET));
        player.getInventory().setChestplate(new ItemStack(Material.IRON_CHESTPLATE));
        player.getInventory().setLeggings(new ItemStack(Material.IRON_LEGGINGS));
        player.getInventory().setBoots(new ItemStack(Material.IRON_BOOTS));
        player.setInvulnerable(false);
        player.setAllowFlight(false);
        player.setFlying(false);
    }

    private void spawnKingsAndCrystals(World world) {
        clearTagged(world);
        Location bk = builder.getBlueKingPos();
        Location rk = builder.getRedKingPos();
        if (bk == null || rk == null) return;
        bk = groundAt(world, bk.getBlockX(), bk.getBlockZ(), builder.getFloorY() + 3);
        rk = groundAt(world, rk.getBlockX(), rk.getBlockZ(), builder.getFloorY() + 3);

        blueKing = world.spawn(bk, Drowned.class, e -> {
            e.setCustomName("§b§lราชาฟ้า");
            e.setCustomNameVisible(true);
            e.setRemoveWhenFarAway(false);
            e.setPersistent(true);
            e.setAdult();
            var max = e.getAttribute(Attribute.GENERIC_MAX_HEALTH);
            if (max != null) max.setBaseValue(KING_MAX_HP);
            e.setHealth(KING_MAX_HP);
            e.addPotionEffect(new PotionEffect(PotionEffectType.RESISTANCE, Integer.MAX_VALUE, 1, false, false));
            e.addPotionEffect(new PotionEffect(PotionEffectType.FIRE_RESISTANCE, Integer.MAX_VALUE, 0, false, false));
            tag(e, "king", Team.BLUE);
            try { e.setShouldBurnInDay(false); } catch (Throwable ignored) {}
        });

        redKing = world.spawn(rk, PiglinBrute.class, e -> {
            e.setCustomName("§c§lราชาแดง");
            e.setCustomNameVisible(true);
            e.setRemoveWhenFarAway(false);
            e.setPersistent(true);
            e.setImmuneToZombification(true);
            var max = e.getAttribute(Attribute.GENERIC_MAX_HEALTH);
            if (max != null) max.setBaseValue(KING_MAX_HP);
            e.setHealth(KING_MAX_HP);
            e.addPotionEffect(new PotionEffect(PotionEffectType.RESISTANCE, Integer.MAX_VALUE, 1, false, false));
            e.addPotionEffect(new PotionEffect(PotionEffectType.FIRE_RESISTANCE, Integer.MAX_VALUE, 0, false, false));
            tag(e, "king", Team.RED);
        });

        blueCrystals.clear();
        redCrystals.clear();
        spawnCrystalRing(world, bk, Team.BLUE, blueCrystals);
        spawnCrystalRing(world, rk, Team.RED, redCrystals);
    }

    private void spawnCrystalRing(World world, Location king, Team team, List<EnderCrystal> out) {
        double r = 3.5;
        for (int i = 0; i < 5; i++) {
            double ang = Math.toRadians(i * 72.0);
            double x = king.getX() + Math.cos(ang) * r;
            double z = king.getZ() + Math.sin(ang) * r;
            int gy = builder.findGroundY(world, (int) Math.floor(x), (int) Math.floor(z)) + 1;
            EnderCrystal crystal = world.spawn(new Location(world, x, gy + 0.5, z), EnderCrystal.class, c -> {
                c.setShowingBottom(false);
                c.setInvulnerable(true);
                tag(c, "crystal", team);
            });
            out.add(crystal);
        }
    }

    private Location groundAt(World world, int x, int z, int preferY) {
        int y = builder.findGroundY(world, x, z) + 1;
        if (Math.abs(y - preferY) > 8) y = preferY;
        return new Location(world, x + 0.5, y, z + 0.5);
    }

    private void tag(Entity e, String role, Team team) {
        e.getPersistentDataContainer().set(keyRole, PersistentDataType.STRING, role);
        e.getPersistentDataContainer().set(keyTeam, PersistentDataType.STRING, team.name());
    }

    private String roleOf(Entity e) {
        return e.getPersistentDataContainer().getOrDefault(keyRole, PersistentDataType.STRING, "");
    }

    private Team teamOf(Entity e) {
        String t = e.getPersistentDataContainer().getOrDefault(keyTeam, PersistentDataType.STRING, "");
        if ("BLUE".equals(t)) return Team.BLUE;
        if ("RED".equals(t)) return Team.RED;
        return null;
    }

    private void clearTagged(World world) {
        for (Entity e : world.getEntities()) {
            String role = roleOf(e);
            if ("king".equals(role) || "crystal".equals(role) || "troop".equals(role) || "defender".equals(role)) {
                e.remove();
            }
        }
        blueKing = null;
        redKing = null;
        blueCrystals.clear();
        redCrystals.clear();
    }

    private void startHud() {
        if (blueBar != null) blueBar.removeAll();
        if (redBar != null) redBar.removeAll();
        // ซ้าย = แดง, ขวา = ฟ้า (เรียง bossbar: แดงก่อนแล้วฟ้า)
        redBar = Bukkit.createBossBar("§c⚔ แดง", BarColor.RED, BarStyle.SEGMENTED_10);
        blueBar = Bukkit.createBossBar("§b⚔ ฟ้า", BarColor.BLUE, BarStyle.SEGMENTED_10);
        redBar.setVisible(true);
        blueBar.setVisible(true);
        for (Player p : Bukkit.getOnlinePlayers()) {
            redBar.addPlayer(p);
            blueBar.addPlayer(p);
        }
        updateHud();
    }

    public int countTroops(Team team) {
        World world = builder.getMidSpawn() != null ? builder.getMidSpawn().getWorld() : null;
        if (world == null) return 0;
        int n = 0;
        for (Entity e : world.getEntities()) {
            if (!"troop".equals(roleOf(e)) && !"defender".equals(roleOf(e))) continue;
            if (teamOf(e) == team && e instanceof LivingEntity living && living.isValid() && !living.isDead()) n++;
        }
        return n;
    }

    public double castleHpPct(Team team) {
        LivingEntity king = team == Team.BLUE ? blueKing : redKing;
        if (king == null || !king.isValid() || king.isDead()) return 0;
        return Math.max(0, Math.min(1, king.getHealth() / KING_MAX_HP));
    }

    public int castleHp(Team team) {
        LivingEntity king = team == Team.BLUE ? blueKing : redKing;
        if (king == null || !king.isValid() || king.isDead()) return 0;
        return (int) Math.round(king.getHealth());
    }

    /** JSON สำหรับแผง TokControl / RCON */
    public String statusJson() {
        int bt = countTroops(Team.BLUE);
        int rt = countTroops(Team.RED);
        double bp = castleHpPct(Team.BLUE);
        double rp = castleHpPct(Team.RED);
        return "{"
                + "\"ok\":true,"
                + "\"active\":" + active + ","
                + "\"roundOver\":" + roundOver + ","
                + "\"phase\":\"" + phase.name() + "\","
                + "\"prepLeft\":" + prepSecondsLeft + ","
                + "\"countdown\":" + countdownLeft + ","
                + "\"blue\":{\"troops\":" + bt + ",\"castleHp\":" + castleHp(Team.BLUE)
                + ",\"castlePct\":" + Math.round(bp * 100) + ",\"maxHp\":" + (int) KING_MAX_HP + "},"
                + "\"red\":{\"troops\":" + rt + ",\"castleHp\":" + castleHp(Team.RED)
                + ",\"castlePct\":" + Math.round(rp * 100) + ",\"maxHp\":" + (int) KING_MAX_HP + "}"
                + "}";
    }

    private void updateHud() {
        int bt = countTroops(Team.BLUE);
        int rt = countTroops(Team.RED);
        double bp = castleHpPct(Team.BLUE);
        double rp = castleHpPct(Team.RED);

        if (redBar != null) {
            redBar.setProgress(Math.max(0, Math.min(1, rp)));
            redBar.setTitle("§c⚔ แดง · ทหาร " + rt + " · ปราสาท " + Math.round(rp * 100) + "% (" + castleHp(Team.RED) + ")");
        }
        if (blueBar != null) {
            blueBar.setProgress(Math.max(0, Math.min(1, bp)));
            blueBar.setTitle("§b⚔ ฟ้า · ทหาร " + bt + " · ปราสาท " + Math.round(bp * 100) + "% (" + castleHp(Team.BLUE) + ")");
        }
    }

    private void tick() {
        if (!active || roundOver) return;
        tickCounter++;
        // ทุก ~1 วินาที (task 10 ticks)
        if (tickCounter % 2 == 0) {
            if (phase == Phase.PREP && prepSecondsLeft > 0) {
                prepSecondsLeft--;
                if (prepSecondsLeft == 30 || prepSecondsLeft == 10 || prepSecondsLeft <= 5 && prepSecondsLeft > 0) {
                    broadcast("§eเตรียมตัวเหลือ §f" + prepSecondsLeft + " §eวิ");
                }
                if (prepSecondsLeft <= 0) {
                    beginBattle();
                }
            } else if (phase == Phase.COUNTDOWN) {
                if (countdownLeft > 0) {
                    titleAll(String.valueOf(countdownLeft), "เตรียมบุก!");
                    countdownLeft--;
                } else {
                    goLive();
                }
            }
        }
        if (phase == Phase.LIVE) {
            checkCrystalsAndWalls(Team.BLUE);
            checkCrystalsAndWalls(Team.RED);
            if (tickCounter % 4 == 0) assignAllCombatTargets();
        }
        updateHud();
    }

    private void checkCrystalsAndWalls(Team team) {
        LivingEntity king = team == Team.BLUE ? blueKing : redKing;
        if (king == null || !king.isValid() || king.isDead()) return;
        double pct = king.getHealth() / KING_MAX_HP;
        int idx = team == Team.BLUE ? blueCrystalIdx : redCrystalIdx;
        while (idx < THRESHOLDS.length && pct <= THRESHOLDS[idx] + 1e-6) {
            explodeCrystal(team, idx);
            applyWallBreach(team, idx);
            idx++;
            if (team == Team.BLUE) blueCrystalIdx = idx;
            else redCrystalIdx = idx;
        }
    }

    private void applyWallBreach(Team team, int stage) {
        int cur = team == Team.BLUE ? blueWallStage : redWallStage;
        if (stage <= cur) return;
        if (team == Team.BLUE) blueWallStage = stage;
        else redWallStage = stage;
        World world = builder.getMidSpawn() != null ? builder.getMidSpawn().getWorld() : null;
        if (world == null) return;
        builder.breachWall(world, team == Team.BLUE, stage);
        String color = team == Team.BLUE ? "§b" : "§c";
        broadcast(color + "§lกำแพงพัง! §fปราสาท" + (team == Team.BLUE ? "ฟ้า" : "แดง") + " ถูกบุก (ขั้น " + (stage + 1) + "/5)");
    }

    private void explodeCrystal(Team team, int index) {
        List<EnderCrystal> crystals = team == Team.BLUE ? blueCrystals : redCrystals;
        if (index < 0 || index >= crystals.size()) return;
        EnderCrystal c = crystals.get(index);
        if (c == null || !c.isValid()) return;
        Location loc = c.getLocation();
        c.setInvulnerable(false);
        c.remove();
        loc.getWorld().createExplosion(loc, 2.8f, false, false);
        String color = team == Team.BLUE ? "§b" : "§c";
        broadcast(color + "End Crystal §fระเบิด! §7เหลือ " + Math.max(0, 5 - index - 1));
        if (index == THRESHOLDS.length - 1) {
            LivingEntity king = team == Team.BLUE ? blueKing : redKing;
            if (king != null && king.isValid() && !king.isDead()) king.setHealth(0);
        }
    }

    private void onKingDefeated(Team deadTeam) {
        if (roundOver) return;
        if (deadTeam == Team.BLUE) {
            if (blueDead) return;
            blueDead = true;
            while (blueCrystalIdx < 5) {
                explodeCrystal(Team.BLUE, blueCrystalIdx);
                applyWallBreach(Team.BLUE, blueCrystalIdx);
                blueCrystalIdx++;
            }
            declareWinner(Team.RED);
        } else {
            if (redDead) return;
            redDead = true;
            while (redCrystalIdx < 5) {
                explodeCrystal(Team.RED, redCrystalIdx);
                applyWallBreach(Team.RED, redCrystalIdx);
                redCrystalIdx++;
            }
            declareWinner(Team.BLUE);
        }
    }

    private void declareWinner(Team winner) {
        roundOver = true;
        String title = winner == Team.BLUE ? "§b§lทีมฟ้าชนะ!" : "§c§lทีมแดงชนะ!";
        broadcast(title);
        for (Player p : Bukkit.getOnlinePlayers()) {
            p.showTitle(Title.title(
                    Component.text(winner == Team.BLUE ? "ทีมฟ้าชนะ!" : "ทีมแดงชนะ!",
                            winner == Team.BLUE ? NamedTextColor.AQUA : NamedTextColor.RED),
                    Component.text("ปราสาทฝ่ายตรงข้ามล่ม", NamedTextColor.WHITE),
                    Title.Times.times(Duration.ofMillis(300), Duration.ofSeconds(5), Duration.ofSeconds(1))
            ));
        }
        updateHud();
    }

    public Team getTeam(Player player) {
        return player == null ? null : playerTeams.get(player.getUniqueId());
    }

    public boolean setTeam(Player player, Team team) {
        if (player == null || team == null) return false;
        playerTeams.put(player.getUniqueId(), team);
        player.setInvulnerable(false);
        player.setAllowFlight(false);
        player.setFlying(false);
        player.setGameMode(GameMode.SURVIVAL);
        Location spawn = team == Team.BLUE ? builder.getBlueSpawn() : builder.getRedSpawn();
        if (spawn != null) {
            Location g = groundAt(player.getWorld(), spawn.getBlockX(), spawn.getBlockZ(), builder.getFloorY() + 2);
            g.setYaw(spawn.getYaw());
            player.teleport(g);
        }
        giveStarterKit(player);
        player.sendMessage(team == Team.BLUE
                ? "§b§lเข้าร่วมทีมฟ้า (1/A)"
                : "§c§lเข้าร่วมทีมแดง (2/B)");
        return true;
    }

    public Team resolveAttackerTeam() {
        Player streamer = plugin.resolveStreamer();
        if (streamer != null) {
            Team t = getTeam(streamer);
            if (t != null) return t;
        }
        for (Player p : Bukkit.getOnlinePlayers()) {
            Team t = getTeam(p);
            if (t != null) return t;
        }
        return null;
    }

    @EventHandler(priority = EventPriority.LOWEST)
    public void onChat(AsyncPlayerChatEvent event) {
        if (!active) return;
        String msg = event.getMessage().trim();
        String low = msg.toLowerCase();
        Team pick = null;
        if (msg.equals("1") || low.equals("a") || low.equals("blue") || low.equals("ฟ้า")) pick = Team.BLUE;
        else if (msg.equals("2") || low.equals("b") || low.equals("red") || low.equals("แดง")) pick = Team.RED;
        if (pick == null) return;
        event.setCancelled(true);
        Team finalPick = pick;
        Bukkit.getScheduler().runTask(plugin, () -> setTeam(event.getPlayer(), finalPick));
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        if (!active) return;
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            Player p = event.getPlayer();
            if (!p.isOnline()) return;
            prepareJoiningPlayer(p);
            if (redBar != null) redBar.addPlayer(p);
            if (blueBar != null) blueBar.addPlayer(p);
        }, 20L);
    }

    @EventHandler
    public void onKingDamage(EntityDamageEvent event) {
        if (!active || !(event.getEntity() instanceof LivingEntity living)) return;
        String role = roleOf(living);
        if (!"king".equals(role) && !"troop".equals(role) && !"defender".equals(role)) return;

        // มอน/ราชาไม่โดนไฟแดด / ไฟไหม้จากกลางวัน
        EntityDamageEvent.DamageCause cause = event.getCause();
        if (cause == EntityDamageEvent.DamageCause.FIRE
                || cause == EntityDamageEvent.DamageCause.FIRE_TICK
                || cause == EntityDamageEvent.DamageCause.HOT_FLOOR
                || cause == EntityDamageEvent.DamageCause.LAVA) {
            // พลเพลิงฝั่งศัตรูยังทำดาเมจผ่าน EntityDamageByEntity ได้ — บล็อกแค่ไฟสภาพแวดล้อม
            if (!(event instanceof EntityDamageByEntityEvent)) {
                event.setCancelled(true);
                living.setFireTicks(0);
                return;
            }
        }

        if ("king".equals(role)) {
            if (phase != Phase.LIVE) {
                event.setCancelled(true);
                return;
            }
            Bukkit.getScheduler().runTaskLater(plugin, () -> {
                Team team = teamOf(living);
                if (team != null) checkCrystalsAndWalls(team);
                updateHud();
            }, 1L);
        }
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onFriendlyFire(EntityDamageByEntityEvent event) {
        if (!active) return;
        Entity victim = event.getEntity();
        Entity damager = event.getDamager();
        if (damager instanceof org.bukkit.entity.Projectile proj && proj.getShooter() instanceof Entity shooter) {
            damager = shooter;
        }
        Team vt = teamOf(victim);
        Team dt = teamOf(damager);
        if (vt != null && vt == dt) {
            event.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onTarget(EntityTargetLivingEntityEvent event) {
        if (!active) return;
        Entity mob = event.getEntity();
        LivingEntity target = event.getTarget();
        if (target == null) return;
        Team mt = teamOf(mob);
        Team tt = teamOf(target);
        if (mt != null && mt == tt) {
            event.setCancelled(true);
            return;
        }
        // ช่วงเตรียมตัว — ห้ามตั้งเป้า
        if (phase != Phase.LIVE && ("troop".equals(roleOf(mob)) || "defender".equals(roleOf(mob)))) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onDeath(EntityDeathEvent event) {
        if (!active) return;
        LivingEntity e = event.getEntity();
        String role = roleOf(e);
        if ("king".equals(role)) {
            event.getDrops().clear();
            event.setDroppedExp(0);
            Team team = teamOf(e);
            if (team != null) onKingDefeated(team);
        } else if ("troop".equals(role) || "defender".equals(role)) {
            event.getDrops().clear();
            event.setDroppedExp(0);
            killLinkedPartner(e);
            Bukkit.getScheduler().runTaskLater(plugin, this::updateHud, 2L);
        }
    }

    /** ม้า↔ไรเดอร์ ตายด้วยกัน */
    private void killLinkedPartner(LivingEntity dead) {
        String link = dead.getPersistentDataContainer().get(keyLink, PersistentDataType.STRING);
        if (link == null || link.isEmpty()) return;
        try {
            UUID id = UUID.fromString(link);
            Entity other = Bukkit.getEntity(id);
            if (other instanceof LivingEntity living && living.isValid() && !living.isDead()) {
                living.getPersistentDataContainer().remove(keyLink);
                living.setHealth(0);
            }
        } catch (Exception ignored) {}
    }

    private void linkPair(Entity a, Entity b) {
        a.getPersistentDataContainer().set(keyLink, PersistentDataType.STRING, b.getUniqueId().toString());
        b.getPersistentDataContainer().set(keyLink, PersistentDataType.STRING, a.getUniqueId().toString());
    }

    // ─── Spawn troops ─────────────────────────────────────────

    public ActionResult spawnTroops(Team team, TroopType type, int count, boolean allowDefault) {
        if (!active) return ActionResult.fail("not_active");
        if (roundOver) return ActionResult.fail("round_over");
        Team t = team;
        if (t == null) {
            t = resolveAttackerTeam();
            if (t == null) {
                if (!allowDefault) {
                    broadcast("§e⚠ พิมพ์ §b1/A §eหรือ §c2/B §eก่อนส่งทหาร");
                    return ActionResult.fail("need_team");
                }
                t = Team.BLUE;
            }
        }
        final Team attackTeam = t;
        World world = builder.getMidSpawn().getWorld();
        Location base = builder.troopSpawnFor(world, attackTeam == Team.BLUE);
        if (base == null) return ActionResult.fail("no_spawn");

        int n = Math.max(1, Math.min(12, count));
        int spawned = 0;
        for (int i = 0; i < n; i++) {
            Location s = offsetGround(world, base, (i % 4) - 1.5, i / 4);
            if (spawnOne(world, s, attackTeam, type)) spawned++;
        }
        if (phase == Phase.LIVE) {
            assignCombatTargets(attackTeam);
        } else {
            freezeAllTroops(true);
        }
        String label = troopLabel(type);
        String wait = phase == Phase.LIVE ? "" : " §7(รอในค่าย · ยังไม่บุก)";
        broadcast((attackTeam == Team.BLUE ? "§b" : "§c") + "เสก" + label + " §fx" + spawned
                + " §7ทีม" + (attackTeam == Team.BLUE ? "ฟ้า" : "แดง") + wait);
        updateHud();
        return ActionResult.ok(attackTeam, spawned);
    }

    private String troopLabel(TroopType type) {
        return switch (type) {
            case SMALL -> "ทหารเล็ก";
            case MEDIUM -> "ทหารกลาง";
            case LARGE -> "ทหารใหญ่";
            case CAVALRY -> "ทหารขี่ม้า";
            case ARCHER -> "พลธนู";
            case FIRE -> "พลเพลิง";
        };
    }

    private ItemStack dyed(Material mat, Color color) {
        ItemStack item = new ItemStack(mat);
        if (item.getItemMeta() instanceof LeatherArmorMeta meta) {
            meta.setColor(color);
            item.setItemMeta(meta);
        }
        return item;
    }

    private void paintTeamArmor(LivingEntity e, Team team) {
        Color c = team == Team.BLUE ? Color.fromRGB(40, 120, 220) : Color.fromRGB(200, 40, 40);
        EntityEquipment eq = e.getEquipment();
        if (eq == null) return;
        eq.setHelmet(dyed(Material.LEATHER_HELMET, c));
        eq.setChestplate(dyed(Material.LEATHER_CHESTPLATE, c));
        eq.setLeggings(dyed(Material.LEATHER_LEGGINGS, c));
        eq.setBoots(dyed(Material.LEATHER_BOOTS, c));
        eq.setHelmetDropChance(0f);
        eq.setChestplateDropChance(0f);
        eq.setLeggingsDropChance(0f);
        eq.setBootsDropChance(0f);
    }

    private void protectFromSun(LivingEntity e) {
        e.setFireTicks(0);
        e.addPotionEffect(new PotionEffect(PotionEffectType.FIRE_RESISTANCE, Integer.MAX_VALUE, 0, false, false));
        if (e instanceof Zombie z) {
            try { z.setShouldBurnInDay(false); } catch (Throwable ignored) {}
        }
        if (e instanceof Skeleton sk) {
            try { sk.setShouldBurnInDay(false); } catch (Throwable ignored) {}
        }
        if (e instanceof Husk h) {
            try { h.setShouldBurnInDay(false); } catch (Throwable ignored) {}
        }
    }

    private void applyTroopAiState(LivingEntity e) {
        if (!(e instanceof Mob mob)) return;
        boolean freeze = phase != Phase.LIVE;
        try { mob.setAware(!freeze); } catch (Throwable ignored) {}
        if (freeze) {
            mob.setTarget(null);
            mob.setAI(false);
        } else {
            mob.setAI(true);
        }
    }

    private void freezeAllTroops(boolean freeze) {
        World world = builder.getMidSpawn() != null ? builder.getMidSpawn().getWorld() : null;
        if (world == null) return;
        for (Entity e : world.getEntities()) {
            String role = roleOf(e);
            if (!"troop".equals(role) && !"defender".equals(role)) continue;
            if (!(e instanceof Mob mob)) continue;
            try { mob.setAware(!freeze); } catch (Throwable ignored) {}
            if (freeze) {
                mob.setTarget(null);
                mob.setAI(false);
            } else {
                mob.setAI(true);
            }
        }
    }

    private boolean spawnOne(World world, Location s, Team team, TroopType type) {
        String prefix = team == Team.BLUE ? "§b" : "§c";
        try {
            LivingEntity spawned = null;
            switch (type) {
                case SMALL -> {
                    Zombie z = world.spawn(s, Zombie.class, e -> {
                        e.setBaby();
                        e.setCustomName(prefix + "ทหารเล็ก");
                        e.setCustomNameVisible(true);
                        e.setRemoveWhenFarAway(false);
                    });
                    spawned = z;
                }
                case MEDIUM -> {
                    Zombie z = world.spawn(s, Zombie.class, e -> {
                        e.setAdult();
                        e.setCustomName(prefix + "ทหารกลาง");
                        e.setCustomNameVisible(true);
                        e.setRemoveWhenFarAway(false);
                    });
                    spawned = z;
                }
                case LARGE -> {
                    Husk h = world.spawn(s, Husk.class, e -> {
                        e.setAdult();
                        e.setCustomName(prefix + "§lทหารใหญ่");
                        e.setCustomNameVisible(true);
                        e.setRemoveWhenFarAway(false);
                        var max = e.getAttribute(Attribute.GENERIC_MAX_HEALTH);
                        if (max != null) { max.setBaseValue(40); e.setHealth(40); }
                        var scale = e.getAttribute(Attribute.GENERIC_SCALE);
                        if (scale != null) scale.setBaseValue(1.35);
                    });
                    spawned = h;
                }
                case CAVALRY -> {
                    Horse horse = world.spawn(s, Horse.class, h -> {
                        h.setTamed(true);
                        h.setAdult();
                        h.getInventory().setSaddle(new ItemStack(Material.SADDLE));
                        h.setColor(team == Team.BLUE ? Horse.Color.WHITE : Horse.Color.CHESTNUT);
                        h.setCustomName(prefix + "ม้าศึก");
                        h.setCustomNameVisible(true);
                        h.setRemoveWhenFarAway(false);
                    });
                    Skeleton rider = world.spawn(s, Skeleton.class, sk -> {
                        sk.setCustomName(prefix + "ทหารขี่");
                        sk.setCustomNameVisible(true);
                        sk.setRemoveWhenFarAway(false);
                        sk.getEquipment().setItemInMainHand(new ItemStack(Material.IRON_SWORD));
                    });
                    horse.addPassenger(rider);
                    tag(horse, "troop", team);
                    tag(rider, "troop", team);
                    linkPair(horse, rider);
                    paintTeamArmor(rider, team);
                    protectFromSun(rider);
                    protectFromSun(horse);
                    applyTroopAiState(rider);
                    applyTroopAiState(horse);
                    return true;
                }
                case ARCHER -> {
                    Skeleton sk = world.spawn(s, Skeleton.class, e -> {
                        e.setCustomName(prefix + "พลธนู");
                        e.setCustomNameVisible(true);
                        e.setRemoveWhenFarAway(false);
                        e.getEquipment().setItemInMainHand(new ItemStack(Material.BOW));
                    });
                    spawned = sk;
                }
                case FIRE -> {
                    Blaze blaze = world.spawn(s, Blaze.class, e -> {
                        e.setCustomName(prefix + "§6พลเพลิง");
                        e.setCustomNameVisible(true);
                        e.setRemoveWhenFarAway(false);
                    });
                    // หมวกหนังสีทีม (Blaze ไม่ใส่เกราะเต็มตัว)
                    EntityEquipment beq = blaze.getEquipment();
                    if (beq != null) {
                        Color c = team == Team.BLUE ? Color.fromRGB(40, 120, 220) : Color.fromRGB(200, 40, 40);
                        beq.setHelmet(dyed(Material.LEATHER_HELMET, c));
                        beq.setHelmetDropChance(0f);
                    }
                    spawned = blaze;
                }
            }
            if (spawned == null) return false;
            tag(spawned, "troop", team);
            if (!(spawned instanceof Blaze)) paintTeamArmor(spawned, team);
            protectFromSun(spawned);
            applyTroopAiState(spawned);
            return true;
        } catch (Exception ex) {
            plugin.getLogger().warning("spawn troop: " + ex.getMessage());
            return false;
        }
    }

    private void assignAllCombatTargets() {
        assignCombatTargets(Team.BLUE);
        assignCombatTargets(Team.RED);
    }

    private void assignCombatTargets(Team team) {
        World world = builder.getMidSpawn() != null ? builder.getMidSpawn().getWorld() : null;
        if (world == null) return;
        LivingEntity enemyKing = team == Team.BLUE ? redKing : blueKing;
        for (Entity e : world.getEntities()) {
            if (!"troop".equals(roleOf(e)) && !"defender".equals(roleOf(e))) continue;
            if (teamOf(e) != team) continue;
            if (!(e instanceof Mob mob)) continue;
            LivingEntity target = findNearestEnemy(mob, team);
            if (target == null) target = (enemyKing != null && enemyKing.isValid() && !enemyKing.isDead()) ? enemyKing : null;
            if (target != null) mob.setTarget(target);
        }
    }

    private LivingEntity findNearestEnemy(Mob self, Team myTeam) {
        LivingEntity best = null;
        double bestDist = 48 * 48;
        for (Entity e : self.getWorld().getNearbyEntities(self.getLocation(), 48, 24, 48)) {
            if (!(e instanceof LivingEntity living) || living.isDead()) continue;
            Team t = teamOf(living);
            if (t == null || t == myTeam) continue;
            String role = roleOf(living);
            if (!"troop".equals(role) && !"defender".equals(role) && !"king".equals(role)) continue;
            double d = living.getLocation().distanceSquared(self.getLocation());
            // เน้นมอนศัตรูก่อนราชา (ระยะใกล้)
            if ("king".equals(role)) d += 8;
            if (d < bestDist) {
                bestDist = d;
                best = living;
            }
        }
        return best;
    }

    private void retargetTroops(Team team, LivingEntity target) {
        if (phase != Phase.LIVE) return;
        assignCombatTargets(team);
    }

    /** ของขวัญปกติ → ทหารกลาง ; test ระบุทีม */
    public ActionResult spawnWave(String type, boolean allowDefault) {
        return spawnWave(null, type, allowDefault);
    }

    public ActionResult spawnWave(Team forcedTeam, String type, boolean allowDefault) {
        String t = type == null ? "normal" : type.toLowerCase();
        if ("tnt".equals(t)) {
            Team team = forcedTeam != null ? forcedTeam : resolveAttackerTeam();
            if (team == null) {
                if (!allowDefault) return ActionResult.fail("need_team");
                team = Team.BLUE;
            }
            return spawnTnt(team);
        }
        if ("boss".equals(t) || "large".equals(t)) {
            return spawnTroops(forcedTeam, TroopType.LARGE, 2, allowDefault);
        }
        if ("small".equals(t)) return spawnTroops(forcedTeam, TroopType.SMALL, 4, allowDefault);
        if ("cavalry".equals(t) || "horse".equals(t)) return spawnTroops(forcedTeam, TroopType.CAVALRY, 2, allowDefault);
        if ("archer".equals(t) || "bow".equals(t)) return spawnTroops(forcedTeam, TroopType.ARCHER, 3, allowDefault);
        if ("fire".equals(t) || "blaze".equals(t) || "pyro".equals(t)) {
            return spawnTroops(forcedTeam, TroopType.FIRE, 2, allowDefault);
        }
        if ("mix".equals(t)) {
            ActionResult a = spawnTroops(forcedTeam, TroopType.SMALL, 2, allowDefault);
            spawnTroops(forcedTeam, TroopType.MEDIUM, 2, true);
            spawnTroops(forcedTeam, TroopType.ARCHER, 1, true);
            spawnTroops(forcedTeam, TroopType.FIRE, 1, true);
            return a;
        }
        return spawnTroops(forcedTeam, TroopType.MEDIUM, 4, allowDefault);
    }

    private ActionResult spawnTnt(Team team) {
        World world = builder.getMidSpawn().getWorld();
        Location spawn = builder.troopSpawnFor(world, team == Team.BLUE);
        Location enemy = team == Team.BLUE ? builder.getRedKingPos() : builder.getBlueKingPos();
        Location drop = spawn.clone().add(0, 6, team == Team.BLUE ? 10 : -10);
        if (enemy != null) {
            drop = groundAt(world, (spawn.getBlockX() + enemy.getBlockX()) / 2,
                    (spawn.getBlockZ() + enemy.getBlockZ()) / 2, builder.getFloorY() + 8);
        }
        var tnt = world.spawn(drop, org.bukkit.entity.TNTPrimed.class);
        tnt.setFuseTicks(40);
        tag(tnt, "troop", team);
        broadcast((team == Team.BLUE ? "§b" : "§c") + "TNT!");
        return ActionResult.ok(team, 1);
    }

    public ActionResult spawnDefender(boolean allowDefault) {
        return spawnDefender(null, allowDefault);
    }

    public ActionResult spawnDefender(Team forced, boolean allowDefault) {
        Team team = forced != null ? forced : resolveAttackerTeam();
        if (team == null) {
            if (!allowDefault) return ActionResult.fail("need_team");
            team = Team.BLUE;
        }
        final Team defendTeam = team;
        World world = builder.getMidSpawn().getWorld();
        Location base = defendTeam == Team.BLUE ? builder.getBlueSpawn() : builder.getRedSpawn();
        Location s = offsetGround(world, base, 0, defendTeam == Team.BLUE ? -2 : 2);
        IronGolem golem = world.spawn(s, IronGolem.class, g -> {
            g.setCustomName((defendTeam == Team.BLUE ? "§b" : "§c") + "ผู้พิทักษ์");
            g.setCustomNameVisible(true);
            g.setPlayerCreated(true);
        });
        tag(golem, "defender", defendTeam);
        paintTeamArmor(golem, defendTeam);
        protectFromSun(golem);
        applyTroopAiState(golem);
        if (phase == Phase.LIVE) assignCombatTargets(defendTeam);
        broadcast((defendTeam == Team.BLUE ? "§b" : "§c") + "Iron Golem!");
        updateHud();
        return ActionResult.ok(defendTeam, 1);
    }

    public ActionResult applyDebuff() {
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (isStreamerOrSolo(p) && getTeam(p) == null) continue;
            p.addPotionEffect(new PotionEffect(PotionEffectType.SLOWNESS, 100, 2));
            p.addPotionEffect(new PotionEffect(PotionEffectType.BLINDNESS, 60, 0));
        }
        broadcast("§5Debuff!");
        return ActionResult.ok(null, 0);
    }

    public ActionResult applyBuff() {
        Team team = resolveAttackerTeam();
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (team != null && getTeam(p) != team) continue;
            p.addPotionEffect(new PotionEffect(PotionEffectType.STRENGTH, 200, 1));
            p.addPotionEffect(new PotionEffect(PotionEffectType.REGENERATION, 200, 2));
        }
        broadcast("§dBUFF!");
        return ActionResult.ok(team, 0);
    }

    public ActionResult supply() {
        Team team = resolveAttackerTeam();
        for (Player p : Bukkit.getOnlinePlayers()) {
            if (team != null && getTeam(p) != null && getTeam(p) != team) continue;
            p.getInventory().addItem(new ItemStack(Material.COBBLESTONE, 16));
            p.getInventory().addItem(new ItemStack(Material.ARROW, 16));
        }
        broadcast("§aเสบียง!");
        return ActionResult.ok(team, 0);
    }

    public ActionResult bigGift() {
        if (Math.random() < 0.5) return spawnWave(null, "boss", true);
        return spawnWave(null, "mix", true);
    }

    public ActionResult requireTeamOrFail() {
        Team team = resolveAttackerTeam();
        if (team == null) {
            broadcast("§e⚠ พิมพ์ §b1/A §eหรือ §c2/B §eก่อน");
            return ActionResult.fail("need_team");
        }
        return ActionResult.ok(team);
    }

    private Location offsetGround(World world, Location base, double ox, double oz) {
        if (base == null) return null;
        int x = (int) Math.floor(base.getX() + ox);
        int z = (int) Math.floor(base.getZ() + oz);
        int y = builder.findGroundY(world, x, z) + 1;
        return new Location(world, x + 0.5, y, z + 0.5, base.getYaw(), 0f);
    }

    private void broadcast(String msg) {
        // ไม่ยิงเข้าแชทมุมซ้าย — ลด UI รก (เก็บใน log)
        plugin.getLogger().info(msg.replaceAll("§.", ""));
    }

    public void shutdown() {
        active = false;
        if (tickTask != null) { tickTask.cancel(); tickTask = null; }
        World world = builder.getMidSpawn() != null ? builder.getMidSpawn().getWorld() : null;
        if (world != null) clearTagged(world);
        if (blueBar != null) { blueBar.removeAll(); blueBar = null; }
        if (redBar != null) { redBar.removeAll(); redBar = null; }
        for (Player p : Bukkit.getOnlinePlayers()) {
            p.setInvulnerable(false);
        }
        playerTeams.clear();
    }

    public static final class ActionResult {
        public final boolean ok;
        public final String error;
        public final Team team;
        public final int count;

        private ActionResult(boolean ok, String error, Team team, int count) {
            this.ok = ok;
            this.error = error;
            this.team = team;
            this.count = count;
        }

        static ActionResult ok(Team team) { return new ActionResult(true, null, team, 0); }
        static ActionResult ok(Team team, int count) { return new ActionResult(true, null, team, count); }
        static ActionResult fail(String error) { return new ActionResult(false, error, null, 0); }
    }
}
