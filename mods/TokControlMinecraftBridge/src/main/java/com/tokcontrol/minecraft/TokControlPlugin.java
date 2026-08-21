package com.tokcontrol.minecraft;

import org.bukkit.Bukkit;
import org.bukkit.GameMode;
import org.bukkit.World;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.plugin.java.JavaPlugin;

public final class TokControlPlugin extends JavaPlugin implements Listener {

    private BridgeHttpServer httpServer;
    private static final String DEFAULT_STREAMER = "Puncheroo";

    private ArenaState arenaState;
    private ArenaBuilder arenaBuilder;
    private FishPierBuilder fishPierBuilder;
    private FishControlService fishControlService;
    private FishShopHelper fishShopHelper;
    private TowerCastleBuilder towerCastleBuilder;
    private TowerWarsService towerWarsService;
    private FarmBuilder farmBuilder;
    private FarmControlService farmControlService;
    private PathZoneService pathZoneService;
    private GameSessionService gameSessionService;
    private BlockActionService blockActions;
    private DecorationStore decorationStore;
    private String streamerName;
    private boolean fishMode;
    private boolean towerMode;
    private boolean farmMode;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        reloadLocalConfig();

        arenaState = new ArenaState();
        decorationStore = new DecorationStore(this);
        arenaBuilder = new ArenaBuilder(this, arenaState);
        fishPierBuilder = new FishPierBuilder(this);
        fishShopHelper = new FishShopHelper(this);
        fishControlService = new FishControlService(this);
        towerCastleBuilder = new TowerCastleBuilder(this);
        towerWarsService = new TowerWarsService(this, towerCastleBuilder);
        farmBuilder = new FarmBuilder(this);
        farmControlService = new FarmControlService(this, farmBuilder);
        pathZoneService = new PathZoneService(this, arenaBuilder, arenaState);
        gameSessionService = new GameSessionService(this, pathZoneService);
        blockActions = new BlockActionService(this, pathZoneService, gameSessionService);
        getServer().getPluginManager().registerEvents(gameSessionService, this);
        getServer().getPluginManager().registerEvents(towerWarsService, this);
        getServer().getPluginManager().registerEvents(farmControlService, this);
        getServer().getPluginManager().registerEvents(this, this);

        int port = getConfig().getInt("http-port", 8081);
        String bridgeToken = getConfig().getString("bridge-token", "");
        httpServer = new BridgeHttpServer(this, port, blockActions, bridgeToken);
        try {
            httpServer.start();
            getLogger().info("TokControl bridge listening on http://127.0.0.1:" + port);
        } catch (Exception e) {
            getLogger().severe("Failed to start HTTP bridge: " + e.getMessage());
        }

        Bukkit.getScheduler().runTaskLater(this, () -> {
            World world = Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0);
            if (world == null) return;
            String mode = getConfig().getString("game-mode", "auto");
            // ถ้า launcher ตั้ง game-mode ชัดเจน — ใช้ค่านั้นเป็นหลัก (กันโลกชื่อ farm ค้างในโฟลเดอร์ box)
            boolean modeForced = mode != null && !mode.isBlank() && !"auto".equalsIgnoreCase(mode);
            if (modeForced) {
                farmMode = "farm".equalsIgnoreCase(mode);
                fishMode = "fish".equalsIgnoreCase(mode);
                towerMode = "tower".equalsIgnoreCase(mode);
            } else {
                fishMode = FishPierBuilder.isFishWorld(world);
                towerMode = TowerCastleBuilder.isTowerWorld(world);
                farmMode = FarmBuilder.isFarmWorld(world);
            }
            if (farmMode) {
                fishMode = false;
                towerMode = false;
                getLogger().info("Farm Control mode — build farm + datapack");
                farmControlService.start(world);
            } else if (towerMode) {
                fishMode = false;
                getLogger().info("Tower Wars mode — build castles + kings");
                towerWarsService.start(world);
            } else if (fishMode) {
                getLogger().info("Fish Control mode — skip Box arena, build pier");
                fishPierBuilder.buildPier(world);
            } else if (getConfig().getBoolean("arena.build-on-start", true)) {
                farmMode = false;
                getLogger().info("Box Control mode — build bedrock arena");
                arenaBuilder.buildArena(world);
            }
        }, 40L);

        getLogger().info("TokControl Minecraft Bridge enabled");
    }

    @Override
    public void onDisable() {
        if (towerWarsService != null) towerWarsService.shutdown();
        if (farmControlService != null) farmControlService.shutdown();
        if (fishControlService != null) fishControlService.shutdown();
        if (httpServer != null) {
            httpServer.stop();
        }
    }

    public void reloadLocalConfig() {
        reloadConfig();
        String raw = getConfig().getString("streamer-name", DEFAULT_STREAMER);
        streamerName = (raw == null || raw.isBlank()) ? DEFAULT_STREAMER : raw.trim();
        if (!streamerName.equals(raw == null ? "" : raw.trim())) {
            getConfig().set("streamer-name", streamerName);
            saveConfig();
        } else if (raw == null || raw.isBlank()) {
            getConfig().set("streamer-name", streamerName);
            saveConfig();
        }
    }

    /** เปิดโหมดบินใน Survival (ดับเบิลกระโดด) */
    public void enablePlayerFlight(Player player) {
        if (player == null || !player.isOnline()) return;
        if (!getConfig().getBoolean("allow-flight", true)) return;
        if (player.getGameMode() == GameMode.SPECTATOR) return;
        player.setAllowFlight(true);
        if (!player.isFlying() && !player.isOnGround()) {
            player.setFlying(true);
        }
        player.setFlySpeed(0.1f);
    }

    public boolean isFishMode() {
        return fishMode;
    }

    public boolean isTowerMode() {
        return towerMode;
    }

    public boolean isFarmMode() {
        return farmMode;
    }

    public TowerWarsService getTowerWarsService() {
        return towerWarsService;
    }

    public FarmControlService getFarmControlService() {
        return farmControlService;
    }

    public FarmBuilder getFarmBuilder() {
        return farmBuilder;
    }

    public TowerCastleBuilder getTowerCastleBuilder() {
        return towerCastleBuilder;
    }

    public FishPierBuilder getFishPierBuilder() {
        return fishPierBuilder;
    }

    public FishControlService getFishControlService() {
        return fishControlService;
    }

    public FishShopHelper getFishShopHelper() {
        return fishShopHelper;
    }

    /** 1) คริสตัล x1 ไม่หมด  2) สโนว์บอล x1 ไม่หมด — เฉพาะ Box Control */
    public void giveBuildKit(Player player) {
        if (player == null || !player.isOnline()) return;
        if (isFishMode() || FishPierBuilder.isFishWorld(player.getWorld())) return;
        if (isTowerMode() || TowerCastleBuilder.isTowerWorld(player.getWorld())) return;
        if (isFarmMode() || FarmBuilder.isFarmWorld(player.getWorld())) return;
        if (isAdminDecorateMode(player)) return;
        player.getInventory().setItem(0, new org.bukkit.inventory.ItemStack(org.bukkit.Material.AMETHYST_BLOCK, 1));
        player.getInventory().setItem(1, new org.bukkit.inventory.ItemStack(org.bukkit.Material.SNOWBALL, 1));
    }

    public void giveFishKit(Player player) {
        if (player == null || !player.isOnline()) return;
        if (fishPierBuilder != null) fishPierBuilder.prepareFisher(player);
    }

    private final java.util.Set<java.util.UUID> adminDecorate = new java.util.HashSet<>();

    public boolean isAdminDecorateMode(Player player) {
        return player != null && adminDecorate.contains(player.getUniqueId());
    }

    public boolean canUseAdminTools(Player player) {
        if (player == null) return false;
        // สร้าง/แต่งแมพได้เฉพาะชื่อสตรีมเมอร์ (ค่าเริ่มต้น Puncheroo) เท่านั้น
        return getStreamerName().equalsIgnoreCase(player.getName());
    }

    public void ensureStreamerAdmin(Player player) {
        if (player == null) return;
        if (!player.isOp()) {
            player.setOp(true);
            getLogger().info("Granted OP to streamer " + player.getName() + " for Box Control admin tools");
        }
    }

    public void setAdminDecorateMode(Player player, boolean on) {
        if (player == null) return;
        boolean fish = isFishMode() || FishPierBuilder.isFishWorld(player.getWorld());
        boolean farm = isFarmMode() || FarmBuilder.isFarmWorld(player.getWorld());
        if (on) {
            boolean allowed = canUseAdminTools(player)
                    || Bukkit.getOnlinePlayers().size() <= 1;
            if (!allowed) {
                player.sendMessage("§cสร้าง/แต่งแมพได้เฉพาะ §f" + getStreamerName()
                        + " §cหรือคนเดียวในเซิร์ฟ");
                return;
            }
            // จำชื่อคนที่เปิดโหมดแต่ง (ถ้ายังไม่ใช่สตรีมเมอร์ที่ตั้งไว้)
            if (!canUseAdminTools(player) && Bukkit.getOnlinePlayers().size() <= 1) {
                setStreamerName(player.getName());
            }
            ensureStreamerAdmin(player);
            adminDecorate.add(player.getUniqueId());
            player.setGameMode(GameMode.CREATIVE);
            player.setAllowFlight(true);
            player.setFlying(true);
            player.getInventory().addItem(new org.bukkit.inventory.ItemStack(org.bukkit.Material.DIAMOND_PICKAXE, 1));
            player.getInventory().addItem(new org.bukkit.inventory.ItemStack(org.bukkit.Material.STONE, 64));
            if (farm) {
                player.getInventory().addItem(new org.bukkit.inventory.ItemStack(org.bukkit.Material.STONE_BRICKS, 64));
                player.getInventory().addItem(new org.bukkit.inventory.ItemStack(org.bukkit.Material.MOSSY_STONE_BRICKS, 64));
                player.getInventory().addItem(new org.bukkit.inventory.ItemStack(org.bukkit.Material.STONE_BRICK_WALL, 64));
                player.getInventory().addItem(new org.bukkit.inventory.ItemStack(org.bukkit.Material.LANTERN, 16));
                player.getInventory().addItem(new org.bukkit.inventory.ItemStack(org.bukkit.Material.COBBLESTONE, 64));
                player.sendMessage("§a§lโหมดแอดมินตกแต่ง Farm §f— แก้กำแพงหิน/ในนา/นอกรั้วได้ · §e/tokcontrol save");
                player.sendTitle("§a§lADMIN FARM", "§7แต่งกำแพงหิน · save เพื่อเก็บ", 5, 50, 10);
            } else if (fish) {
                player.sendMessage("§a§lโหมดแอดมินตกแต่ง Fish §f— แต่งรอบนอกท่าเรือ/เกาะดาวเทียม · §e/tokcontrol save");
                player.sendTitle("§a§lADMIN FISH", "§7แต่งธีมแมพ · save เก็บไว้", 5, 50, 10);
            } else {
                player.sendMessage("§a§lโหมดแอดมินตกแต่ง §f— วางรอบนอกกำแพง · §e/tokcontrol save §f· กด T พิมพ์คำสั่งได้");
                player.sendTitle("§a§lADMIN", "§7ตกแต่งแมพ · T = พิมพ์คำสั่ง", 5, 50, 10);
            }
        } else {
            adminDecorate.remove(player.getUniqueId());
            int n;
            if (farm && farmBuilder != null) {
                n = farmBuilder.saveDecorationsNow();
                player.setGameMode(GameMode.SURVIVAL);
                if (farmControlService != null) farmControlService.giveFarmKit(player);
                player.sendMessage("§eออกจากโหมดแอดมิน — บันทึก Farm decor §f" + n + " §eบล็อก");
            } else if (fish && fishPierBuilder != null) {
                n = fishPierBuilder.saveDecorationsNow();
                player.setGameMode(GameMode.SURVIVAL);
                giveFishKit(player);
                player.sendMessage("§eออกจากโหมดแอดมิน — บันทึก Fish decor §f" + n + " §eบล็อก");
            } else {
                n = arenaBuilder.saveDecorationsNow();
                player.setGameMode(GameMode.SURVIVAL);
                enablePlayerFlight(player);
                giveBuildKit(player);
                player.sendMessage("§eออกจากโหมดแอดมิน — บันทึกตกแต่งแล้ว §f" + n + " §eบล็อก");
            }
            player.sendTitle("§ePLAY", "§7โหมดเล่นปกติ", 5, 30, 10);
        }
    }

    public DecorationStore getDecorationStore() {
        return decorationStore;
    }

    @EventHandler
    public void onPlayerJoin(PlayerJoinEvent event) {
        event.setJoinMessage(null);
        Player player = event.getPlayer();
        Bukkit.getScheduler().runTaskLater(this, () -> {
            if (!player.isOnline()) return;
            boolean fish = isFishMode() || FishPierBuilder.isFishWorld(player.getWorld());
            boolean tower = isTowerMode() || TowerCastleBuilder.isTowerWorld(player.getWorld());
            boolean farm = isFarmMode() || FarmBuilder.isFarmWorld(player.getWorld());
            if (tower) {
                towerMode = true;
                if (towerWarsService != null && !towerWarsService.isActive()) {
                    towerWarsService.start(player.getWorld());
                } else if (towerWarsService != null) {
                    towerWarsService.prepareJoiningPlayer(player);
                }
            } else if (farm) {
                farmMode = true;
                if (farmControlService != null && !farmControlService.isActive()) {
                    farmControlService.start(player.getWorld());
                } else if (farmControlService != null) {
                    farmControlService.giveFarmKit(player);
                    if (farmBuilder.getFarmSpawn() != null) player.teleport(farmBuilder.getFarmSpawn());
                }
                enablePlayerFlight(player);
            } else if (fish) {
                fishMode = true;
                if (fishPierBuilder != null && !fishPierBuilder.isBuilt()) {
                    fishPierBuilder.buildPier(player.getWorld());
                }
                giveFishKit(player);
            } else {
                enablePlayerFlight(player);
                if (!isAdminDecorateMode(player)) giveBuildKit(player);
            }
            if (canUseAdminTools(player)) {
                ensureStreamerAdmin(player);
            }
            if (!fish && !tower && !farm && arenaState.getWorld() != null && player.getWorld().equals(arenaState.getWorld())) {
                int floor = arenaState.getFloorY();
                if (player.getLocation().getY() > floor + arenaState.getLayerHeight() + 10
                        || player.getLocation().getY() < floor - 5) {
                    player.teleport(arenaBuilder.spawnLocation(player.getWorld()));
                    enablePlayerFlight(player);
                }
            }
        }, 15L);
    }

    public String getStreamerName() {
        if (streamerName == null || streamerName.isBlank()) return DEFAULT_STREAMER;
        return streamerName;
    }

    public void setStreamerName(String name) {
        String next = name == null ? "" : name.trim();
        streamerName = next.isEmpty() ? DEFAULT_STREAMER : next;
        getConfig().set("streamer-name", streamerName);
        saveConfig();
    }

    public Player resolveStreamer() {
        String name = getStreamerName();
        Player p = Bukkit.getPlayerExact(name);
        if (p != null && p.isOnline()) return p;
        // หาแบบไม่สนตัวพิมพ์ใหญ่-เล็ก
        for (Player online : Bukkit.getOnlinePlayers()) {
            if (online.getName().equalsIgnoreCase(name)) return online;
        }
        // ถ้าสตรีมเมอร์ยังไม่ออนไลน์ แต่มีคนเดียวในเซิร์ฟ — ใช้คนนั้น (เปิดโหมดแต่งจากแอปได้)
        if (Bukkit.getOnlinePlayers().size() == 1) {
            return Bukkit.getOnlinePlayers().iterator().next();
        }
        return null;
    }

    /**
     * เป้าหมายโหมดแต่งแมพ — สตรีมเมอร์ (ค่าเริ่มต้น Puncheroo) หรือคนเดียวในเซิร์ฟ
     * ปุ่ม TokControl ส่งผ่าน RCON = คอนโซล
     */
    public Player resolveDecorateTarget(CommandSender sender, String namedPlayer) {
        if (namedPlayer != null && !namedPlayer.isBlank()) {
            String want = namedPlayer.trim();
            for (Player online : Bukkit.getOnlinePlayers()) {
                if (online.getName().equalsIgnoreCase(want)) return online;
            }
            return null;
        }
        if (sender instanceof Player player) {
            if (canUseAdminTools(player)) return player;
            // คนเดียวในเซิร์ฟ: อนุญาตแต่งแมพ
            if (Bukkit.getOnlinePlayers().size() <= 1) return player;
            return null;
        }
        return resolveStreamer();
    }

    public ArenaState getArenaState() {
        return arenaState;
    }

    public ArenaBuilder getArenaBuilder() {
        return arenaBuilder;
    }

    public PathZoneService getPathZoneService() {
        return pathZoneService;
    }

    public GameSessionService getGameSessionService() {
        return gameSessionService;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!command.getName().equalsIgnoreCase("tokcontrol")) return false;
        // สตรีมเมอร์ (Puncheroo) ได้ OP อัตโนมัติ — คนอื่นยังใช้คำสั่งทั่วไปได้
        if (sender instanceof Player player) {
            if (canUseAdminTools(player)) {
                ensureStreamerAdmin(player);
            }
        } else if (!sender.hasPermission("tokcontrol.admin")) {
            sender.sendMessage("§cไม่มีสิทธิ์ใช้คำสั่งนี้");
            return true;
        }
        if (args.length == 0) {
            sender.sendMessage("§e/tokcontrol setplayer [ชื่อ] §7— ตั้งสตรีมเมอร์");
            sender.sendMessage("§e/tokcontrol goto §7— วาร์ปจุดเริ่ม");
            sender.sendMessage("§e/tokcontrol rebuild §7— สร้างแมพใหม่");
            sender.sendMessage("§e/tokcontrol fish … §7— Fish Control");
            sender.sendMessage("§e/tokcontrol tower … §7— Tower Wars");
            sender.sendMessage("§e/tokcontrol farm … §7— Farm Control");
            sender.sendMessage("§e/tokcontrol admin §7— โหมดแอดมินตกแต่งแมพ");
            sender.sendMessage("§e/tokcontrol fly §7— เปิด/ปิดโหมดบิน");
            return true;
        }
        String sub = args[0].toLowerCase();
        if (sub.equals("announce") || sub.equals("sayuser") || sub.equals("viewer")) {
            // /tokcontrol announce <user> <message...>
            String user = args.length > 1 ? args[1] : "viewer";
            StringBuilder msg = new StringBuilder();
            for (int i = 2; i < args.length; i++) {
                if (msg.length() > 0) msg.append(' ');
                msg.append(args[i]);
            }
            if (msg.length() == 0) msg.append("ทริกเกอร์");
            ViewerAnnounce.show(user, msg.toString());
            sender.sendMessage("§aAnnounce §e" + user + " §7· §f" + msg);
            return true;
        }
        if (sub.equals("fish")) {
            return handleFishCommand(sender, args);
        }
        if (sub.equals("tower") || sub.equals("tw") || sub.equals("castle")) {
            return handleTowerCommand(sender, args);
        }
        if (sub.equals("farm") || sub.equals("fm") || sub.equals("wheat")) {
            return handleFarmCommand(sender, args);
        }
        if (sub.equals("admin") || sub.equals("decorate")) {
            String named = args.length > 1 ? args[1] : null;
            Player player = resolveDecorateTarget(sender, named);
            if (player == null) {
                sender.sendMessage(named != null && !named.isBlank()
                        ? ("§cได้เฉพาะ §f" + getStreamerName() + " §c— ไม่พบหรือชื่อไม่ตรง")
                        : ("§cต้องเข้าเกมด้วยชื่อ §f" + getStreamerName() + " §cก่อน"));
                return true;
            }
            setAdminDecorateMode(player, !isAdminDecorateMode(player));
            if (!(sender instanceof Player)) {
                sender.sendMessage("§aโหมดแต่งแมพสลับให้ §f" + player.getName()
                        + (isAdminDecorateMode(player) ? " §a(เปิด)" : " §e(ปิด)"));
            }
            return true;
        }
        if (sub.equals("save") || sub.equals("savedecor") || sub.equals("savedeco")) {
            boolean fish = isFishMode() || (sender instanceof Player p && FishPierBuilder.isFishWorld(p.getWorld()));
            boolean farm = isFarmMode() || (sender instanceof Player p2 && FarmBuilder.isFarmWorld(p2.getWorld()));
            int n;
            if (farm && farmBuilder != null) {
                n = farmBuilder.saveDecorationsNow();
                sender.sendMessage("§aบันทึก Farm decor แล้ว §f" + n + " §aบล็อก → farm_decorations.yml");
            } else if (fish && fishPierBuilder != null) {
                n = fishPierBuilder.saveDecorationsNow();
                sender.sendMessage("§aบันทึก Fish decor แล้ว §f" + n + " §aบล็อก → fish_decorations.yml");
            } else {
                n = arenaBuilder.saveDecorationsNow();
                sender.sendMessage("§aบันทึกแมพตกแต่งแล้ว §f" + n + " §aบล็อก (อยู่รอบนอกกำแพง)");
            }
            return true;
        }
        if (sub.equals("load") || sub.equals("loaddecor") || sub.equals("loaddeco")) {
            boolean fish = isFishMode() || (sender instanceof Player p && FishPierBuilder.isFishWorld(p.getWorld()));
            boolean farm = isFarmMode() || (sender instanceof Player p2 && FarmBuilder.isFarmWorld(p2.getWorld()));
            World w = arenaState.getWorld();
            if (w == null && sender instanceof Player p) w = p.getWorld();
            if (w == null) {
                sender.sendMessage("§cยังไม่มีโลกแมพ");
                return true;
            }
            if (farm && farmBuilder != null) {
                farmBuilder.restoreDecorations(w);
                sender.sendMessage("§aโหลด Farm decor แล้ว §f" + decorationStore.farmSize() + " §aบล็อก");
            } else if (fish && fishPierBuilder != null) {
                fishPierBuilder.restoreDecorations(w);
                sender.sendMessage("§aโหลด Fish decor แล้ว §f" + decorationStore.fishSize() + " §aบล็อก");
            } else {
                decorationStore.loadFromDisk();
                int border = arenaBuilder.getCurrentExpandLevel() + 1;
                int floorY = arenaState.getFloorY() > 0 ? arenaState.getFloorY() : arenaBuilder.resolveFloorY(w);
                int cx = arenaState.getWorld() != null ? arenaState.getCenterX() : (sender instanceof Player p ? p.getLocation().getBlockX() : 0);
                int cz = arenaState.getWorld() != null ? arenaState.getCenterZ() : (sender instanceof Player p ? p.getLocation().getBlockZ() : 0);
                decorationStore.paste(w, cx, cz, floorY, border, decorationStore.getCached());
                sender.sendMessage("§aโหลดแมพตกแต่งแล้ว §f" + decorationStore.size() + " §aบล็อก");
            }
            return true;
        }
        if (sub.equals("setplayer")) {
            if (sender instanceof Player p && !canUseAdminTools(p) && !p.isOp()) {
                sender.sendMessage("§cตั้งสตรีมเมอร์ได้เฉพาะ §f" + getStreamerName() + " §cหรือ OP / คอนโซล");
                return true;
            }
            String target = args.length > 1 ? args[1] : (sender instanceof Player ? ((Player) sender).getName() : "");
            if (target.isEmpty()) {
                sender.sendMessage("§cระบุชื่อผู้เล่น");
                return true;
            }
            setStreamerName(target);
            sender.sendMessage("§aตั้งสตรีมเมอร์เป็น §f" + target + " §7(สร้าง/แต่งแมพได้เฉพาะชื่อนี้)");
            Player p = Bukkit.getPlayerExact(target);
            if (p != null && p.isOnline()) {
                ensureStreamerAdmin(p);
                var world = p.getWorld();
                if (arenaState.getWorld() == null) arenaBuilder.buildArena(world);
                p.teleport(arenaBuilder.spawnLocation(world));
                enablePlayerFlight(p);
                giveBuildKit(p);
                p.sendMessage("§eวาร์ปมาจุดเริ่มแล้ว §7| เป็น OP แล้ว · ดับเบิลกระโดดเพื่อบิน · §a/tokcontrol admin §7แต่งแมพ");
            }
            return true;
        }
        if (sub.equals("goto") || sub.equals("tp")) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage("§cใช้ในเกมเท่านั้น");
                return true;
            }
            if (isTowerMode() || TowerCastleBuilder.isTowerWorld(player.getWorld())) {
                if (towerWarsService != null) towerWarsService.prepareJoiningPlayer(player);
                sender.sendMessage("§aวาร์ปกลางสนาม Tower Wars — พิมพ์ 1/A หรือ 2/B");
                return true;
            }
            if (isFarmMode() || FarmBuilder.isFarmWorld(player.getWorld())) {
                if (farmBuilder.getFarmSpawn() != null) player.teleport(farmBuilder.getFarmSpawn());
                if (farmControlService != null) farmControlService.giveFarmKit(player);
                sender.sendMessage("§aวาร์ปมาฟาร์มแล้ว — Snowball ปลูก · ขวดน้ำดับไฟ");
                return true;
            }
            if (isFishMode() || FishPierBuilder.isFishWorld(player.getWorld())) {
                giveFishKit(player);
                sender.sendMessage("§aวาร์ปมาท่าเรือแล้ว");
                return true;
            }
            if (arenaState.getWorld() == null) arenaBuilder.buildArena(player.getWorld());
            player.teleport(arenaBuilder.spawnLocation(player.getWorld()));
            enablePlayerFlight(player);
            player.sendMessage("§aวาร์ปมาจุดเริ่มแล้ว §7(ดับเบิลกระโดดเพื่อบิน)");
            return true;
        }
        if (sub.equals("rebuild")) {
            var world = Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0);
            if (world == null) {
                sender.sendMessage("§cยังไม่มี world");
                return true;
            }
            if (TowerCastleBuilder.isTowerWorld(world) || isTowerMode()
                    || "tower".equalsIgnoreCase(getConfig().getString("game-mode", ""))) {
                towerMode = true;
                if (towerWarsService != null) towerWarsService.start(world);
                sender.sendMessage("§aสร้างแมพ Tower Wars ใหม่แล้ว");
                return true;
            }
            if (FishPierBuilder.isFishWorld(world) || isFishMode()) {
                fishMode = true;
                fishPierBuilder.buildPier(world);
                sender.sendMessage("§aสร้างท่าเรือ Fish Control ใหม่แล้ว");
                if (sender instanceof Player player) giveFishKit(player);
                return true;
            }
            getConfig().set("arena.expand-level", 4);
            saveConfig();
            arenaBuilder.buildBedrockMap(world, world.getSpawnLocation(), 4, getConfig().getInt("arena.height", 9), true);
            sender.sendMessage("§aสร้างแมพ Bedrock 9×9 ที่พื้น (y=" + arenaState.getFloorY() + ")");
            if (sender instanceof Player player) {
                player.teleport(arenaBuilder.spawnLocation(world));
                enablePlayerFlight(player);
                giveBuildKit(player);
            }
            return true;
        }
        if (sub.equals("fly")) {
            if (!(sender instanceof Player player)) {
                sender.sendMessage("§cใช้ในเกมเท่านั้น");
                return true;
            }
            boolean next = !player.getAllowFlight();
            getConfig().set("allow-flight", next);
            saveConfig();
            if (next) {
                enablePlayerFlight(player);
                player.setFlying(true);
                player.sendMessage("§aเปิดโหมดบินแล้ว");
            } else {
                player.setFlying(false);
                player.setAllowFlight(false);
                player.sendMessage("§eปิดโหมดบินแล้ว");
            }
            return true;
        }
        if (sub.equals("status")) {
            Player sp = resolveStreamer();
            sender.sendMessage("§6TokControl §7| bridge §aport " + getConfig().getInt("http-port", 8081));
            sender.sendMessage("§7สตรีมเมอร์: §f" + (getStreamerName().isEmpty() ? "(ยังไม่ตั้ง)" : getStreamerName()));
            sender.sendMessage("§7ผู้เล่นเป้าหมาย: §f" + (sp != null ? sp.getName() : "ออฟไลน์"));
            if (isTowerMode() && towerWarsService != null) {
                sender.sendMessage("§7โหมด: §dTower Wars §7| เลือกฝั่งพิมพ์ §e1/A §7หรือ §c2/B");
            } else if (isFishMode() && fishControlService != null) {
                sender.sendMessage("§7โหมด: §bFish Control §7| เป้า §e" + fishControlService.getGoal()
                        + " §7ตกแล้ว §e" + fishControlService.getCaught()
                        + " §7เหลือ §e" + fishControlService.getRemaining());
            } else {
                sender.sendMessage("§7แมพ: §fBedrock Border Lv." + arenaBuilder.getCurrentExpandLevel()
                        + " §7พื้นที่เล่น §f" + arenaState.getSize() + "x" + arenaState.getSize()
                        + " §7y=§f" + arenaState.getFloorY());
            }
            sender.sendMessage("§7บิน: §f" + (getConfig().getBoolean("allow-flight", true) ? "เปิด" : "ปิด"));
            return true;
        }
        sender.sendMessage("§cคำสั่งไม่รู้จัก");
        return true;
    }

    private boolean handleFishCommand(CommandSender sender, String[] args) {
        if (fishControlService == null) {
            sender.sendMessage("§cFish Control ยังไม่พร้อม");
            return true;
        }
        fishMode = true;
        String act = args.length > 1 ? args[1].toLowerCase() : "status";
        int n = 1;
        if (args.length > 2) {
            try { n = Integer.parseInt(args[2]); } catch (Exception ignored) {}
        }
        switch (act) {
            case "add", "addgoal", "inc" -> {
                fishControlService.addGoal(n);
                sender.sendMessage("§a+เป้าหมาย §e" + n);
            }
            case "sub", "dec", "remove" -> {
                fishControlService.subGoal(n);
                sender.sendMessage("§a-เป้าหมาย §e" + n);
            }
            case "goal", "set" -> {
                fishControlService.setGoal(Math.max(0, n));
                sender.sendMessage("§aตั้งเป้าหมาย §e" + fishControlService.getGoal());
            }
            case "zombie", "zombies", "mob" -> {
                int c = fishControlService.spawnZombies(Math.max(1, n));
                sender.sendMessage("§cเสกซอมบี้ §e" + c);
            }
            case "golem", "iron" -> {
                int c = fishControlService.spawnGolems(null, Math.max(1, n));
                sender.sendMessage("§aเสกโกเลมช่วยตี §e" + c + " §aตัว · 20วิ");
            }
            case "cleargolem", "cleargolems", "rmgolem" -> {
                fishControlService.clearGolems();
                sender.sendMessage("§7เคลียร์โกเลมแล้ว");
            }
            case "autofish", "boost", "help", "fast" -> {
                int sec = n > 1 ? n : FishControlService.AUTO_FISH_SEC;
                fishControlService.startAutoFishHelp(sec);
                sender.sendMessage("§dช่วยตก §e" + sec + "§d วิ");
            }
            case "villager", "villagers", "npc", "helpfish" -> {
                int amt = Math.max(1, Math.min(20, n > 0 ? n : 1));
                fishControlService.spawnVillagerHelp(amt);
                sender.sendMessage("§eชาวบ้านช่วยตก §f×" + amt);
            }
            case "wall", "walls", "seal", "blockfish" -> {
                int sec = n > 1 ? n : FishControlService.FISHING_WALL_SEC;
                boolean ok = fishControlService.startFishingWall(sec);
                sender.sendMessage(ok ? "§cกำแพงท่าเรือ §e" + sec + "§c วิ" : "§cล้มเหลว — สร้างท่าเรือก่อน");
            }
            case "unwall", "openwall", "clearwall" -> {
                fishControlService.releaseFishingWall();
                sender.sendMessage("§aเปิดกำแพงแล้ว");
            }
            case "multi", "multicatch", "xcatch", "double", "upgrade" -> {
                int steps = n > 0 ? n : 1;
                fishControlService.upgradeCatchYield(steps);
                sender.sendMessage("§aอัพเกรดตก §ex" + fishControlService.getCatchYield()
                        + " §7(+ " + steps + " · จนชนะ)");
            }
            case "demulti", "unmulti", "multidown", "downgrade" -> {
                int steps = n > 0 ? n : 1;
                fishControlService.downgradeCatchYield(steps);
                sender.sendMessage("§cลดอัพเกรด §ex" + fishControlService.getCatchYield()
                        + " §7(- " + steps + " · จนชนะ)");
            }
            case "pluswin", "winplus", "+win", "addwin" -> {
                int amt = n > 0 ? n : 1;
                fishControlService.giftPlusWin(amt);
                sender.sendMessage("§a+วิน §e" + amt + " §7(Allay)");
            }
            case "minuswin", "winminus", "-win", "subwin", "removewin" -> {
                int amt = n > 0 ? n : 1;
                fishControlService.giftMinusWin(amt);
                sender.sendMessage("§c-วิน §e" + amt + " §7(Drowned)");
            }
            case "reset" -> {
                World w = Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0);
                if (fishPierBuilder != null && w != null) fishPierBuilder.buildPier(w);
                sender.sendMessage("§aรีเซ็ตท่าเรือ + เป้า " + FishControlService.DEFAULT_GOAL);
            }
            case "status" -> sender.sendMessage("§bปลา §7เป้า §e" + fishControlService.getGoal()
                    + " §7ตกแล้ว §e" + fishControlService.getCaught()
                    + " §7เหลือ §e" + fishControlService.getRemaining()
                    + (fishControlService.isFishingBlocked()
                        ? " §c[กำแพง " + fishControlService.fishingWallSecondsLeft() + "วิ]" : "")
                    + (fishControlService.isMultiCatchActive()
                        ? " §a[x" + fishControlService.getCatchYield() + "/ครั้ง]" : ""));
            default -> sender.sendMessage("§e/tokcontrol fish add|sub|pluswin|minuswin|zombie|golem|autofish|multi|demulti|villager|wall|reset|status");
        }
        return true;
    }

    private boolean handleTowerCommand(CommandSender sender, String[] args) {
        if (towerWarsService == null) {
            sender.sendMessage("§cTower Wars ไม่พร้อม");
            return true;
        }
        World world = Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0);
        if (args.length < 2) {
            sender.sendMessage("§e/tokcontrol tower start|status|fly|spawn|blue|red|wave|…");
            return true;
        }
        String act = args[1].toLowerCase();
        towerMode = true;

        // tokcontrol tower blue|red [small|medium|large|cavalry|archer|tnt|defender|mix]
        if (act.equals("blue") || act.equals("red") || act.equals("spawn")) {
            TowerWarsService.Team team;
            String kind;
            if (act.equals("spawn")) {
                if (args.length < 4) {
                    sender.sendMessage("§e/tokcontrol tower spawn blue|red small|medium|large|cavalry|archer");
                    return true;
                }
                team = parseTeam(args[2]);
                kind = args[3].toLowerCase();
            } else {
                team = act.equals("blue") ? TowerWarsService.Team.BLUE : TowerWarsService.Team.RED;
                kind = args.length > 2 ? args[2].toLowerCase() : "mix";
            }
            if (team == null) {
                sender.sendMessage("§cทีมไม่ถูกต้อง");
                return true;
            }
            var r = switch (kind) {
                case "tnt" -> towerWarsService.spawnWave(team, "tnt", true);
                case "defender", "golem" -> towerWarsService.spawnDefender(team, true);
                case "small", "medium", "large", "cavalry", "archer", "fire", "mix", "boss" ->
                        towerWarsService.spawnWave(team, kind, true);
                default -> towerWarsService.spawnWave(team, "mix", true);
            };
            sender.sendMessage(r.ok ? "§aOK §e" + r.count + " §7" + team : "§c" + r.error);
            return true;
        }

        switch (act) {
            case "start", "build", "rebuild", "reset" -> {
                if (world == null) {
                    sender.sendMessage("§cยังไม่มี world");
                    return true;
                }
                int prep = args.length > 2 ? parseIntSafe(args[2], 60) : 60;
                towerWarsService.start(world, prep);
                sender.sendMessage("§aแมพพร้อม · เตรียมตัว §e" + prep + "§a วิ · ส่งมอนรอได้");
            }
            case "prep", "prepare" -> {
                int prep = args.length > 2 ? parseIntSafe(args[2], 60) : 60;
                var r = towerWarsService.startPrep(prep);
                sender.sendMessage(r.ok ? "§aเตรียมตัว §e" + prep + "§a วิ" : "§c" + r.error);
            }
            case "begin", "go", "fight", "live" -> {
                var r = towerWarsService.beginBattle();
                sender.sendMessage(r.ok ? "§aเริ่มนับถอยหลังศึก!" : "§c" + r.error);
            }
            case "status", "hud", "json" -> sender.sendMessage(towerWarsService.statusJson());
            case "fly", "spectate", "look" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage("§cใช้ในเกม");
                    return true;
                }
                towerWarsService.enableSpectatorFly(player);
            }
            case "wave", "normal", "mob" -> {
                boolean test = args.length > 2 && "test".equalsIgnoreCase(args[2]);
                var r = towerWarsService.spawnWave("normal", test);
                sender.sendMessage(r.ok ? "§aเสกคลื่น §e" + r.count : "§c" + needTeamMsg(r.error));
            }
            case "tnt" -> {
                boolean test = args.length > 2 && "test".equalsIgnoreCase(args[2]);
                var r = towerWarsService.spawnWave("tnt", test);
                sender.sendMessage(r.ok ? "§aTNT" : "§c" + needTeamMsg(r.error));
            }
            case "boss" -> {
                boolean test = args.length > 2 && "test".equalsIgnoreCase(args[2]);
                var r = towerWarsService.spawnWave("boss", test);
                sender.sendMessage(r.ok ? "§aทหารใหญ่" : "§c" + needTeamMsg(r.error));
            }
            case "debuff" -> {
                towerWarsService.applyDebuff();
                sender.sendMessage("§aDebuff");
            }
            case "buff" -> {
                var r = towerWarsService.applyBuff();
                sender.sendMessage(r.ok ? "§aBuff" : "§c" + r.error);
            }
            case "supply", "resources" -> {
                var r = towerWarsService.supply();
                sender.sendMessage(r.ok ? "§aSupply" : "§c" + r.error);
            }
            case "defender", "golem" -> {
                boolean test = args.length > 2 && "test".equalsIgnoreCase(args[2]);
                var r = towerWarsService.spawnDefender(test);
                sender.sendMessage(r.ok ? "§aGolem" : "§c" + needTeamMsg(r.error));
            }
            case "big" -> {
                var r = towerWarsService.bigGift();
                sender.sendMessage(r.ok ? "§aBig" : "§c" + r.error);
            }
            case "team" -> {
                if (!(sender instanceof Player player)) {
                    sender.sendMessage("§cใช้ในเกม");
                    return true;
                }
                if (args.length < 3) {
                    sender.sendMessage("§e/tokcontrol tower team blue|red");
                    return true;
                }
                TowerWarsService.Team team = parseTeam(args[2]);
                if (team == null) team = TowerWarsService.Team.RED;
                towerWarsService.setTeam(player, team);
            }
            default -> sender.sendMessage("§e/tokcontrol tower start|prep|begin|status|fly|blue|red|spawn|wave|team");
        }
        return true;
    }

    private boolean handleFarmCommand(CommandSender sender, String[] args) {
        if (farmControlService == null) {
            sender.sendMessage("§cFarm service ไม่พร้อม");
            return true;
        }
        World world = Bukkit.getWorlds().isEmpty() ? null : Bukkit.getWorlds().get(0);
        if (sender instanceof Player p) world = p.getWorld();
        if (args.length < 2) {
            sender.sendMessage("§e/tokcontrol farm start|expand|shrink|snowman|blaze|fire|…");
            return true;
        }
        String act = args[1].toLowerCase();
        switch (act) {
            case "start", "build", "rebuild", "reset" -> {
                if (world == null) {
                    sender.sendMessage("§cยังไม่มี world");
                    return true;
                }
                farmControlService.start(world);
                int fy = farmBuilder != null ? farmBuilder.getFloorY() : FarmBuilder.resolveFlatFloorY(world);
                sender.sendMessage("§aสร้างแมพฟาร์มแบนราบ §7(Y=" + fy + " ล็อก · ขยายเฉพาะ X/Z)");
            }
            case "expand", "grow", "big" -> {
                int n = args.length > 2 ? parseIntSafe(args[2], 1) : 1;
                boolean ok = farmControlService.expandFarm(n);
                sender.sendMessage(ok ? "§aขยายฟาร์ม!" : "§cล้มเหลว");
            }
            case "shrink", "small", "reduce" -> {
                int n = args.length > 2 ? parseIntSafe(args[2], 1) : 1;
                boolean ok = farmControlService.shrinkFarm(n);
                sender.sendMessage(ok ? "§eลดขนาดฟาร์ม!" : "§cล้มเหลว");
            }
            case "snowman", "golem", "helper_snow" -> {
                boolean ok = farmControlService.spawnSnowmanHelper();
                sender.sendMessage(ok ? "§bสโนแมนช่วยปลูก!" : "§cล้มเหลว");
            }
            case "blaze", "pyro", "flamethrower", "firethrower" -> {
                boolean ok = farmControlService.spawnBlazeThrower();
                sender.sendMessage(ok ? "§cตัวพ่นไฟ!" : "§cล้มเหลว");
            }
            case "win", "winfx", "abundance", "goldenwheat" -> {
                boolean ok = farmControlService.playWinAbundanceCutscene();
                sender.sendMessage(ok ? "§6คัทซีนวิน: รวงข้าวทองคำแห่งความอุดมสมบูรณ์" : "§cล้มเหลว");
            }
            case "lose", "losefx", "kalpa", "burnout" -> {
                boolean ok = farmControlService.playLoseKalpaCutscene();
                sender.sendMessage(ok ? "§4คัทซีนแพ้: เพลิงกัลป์ล้างผืนนา" : "§cล้มเหลว");
            }
            case "admin", "decorate" -> {
                String named = args.length > 2 ? args[2] : null;
                Player player = resolveDecorateTarget(sender, named);
                if (player == null) {
                    sender.sendMessage(named != null && !named.isBlank()
                            ? ("§cได้เฉพาะ §f" + getStreamerName() + " §c— ไม่พบหรือชื่อไม่ตรง")
                            : ("§cต้องเข้าเกมด้วยชื่อ §f" + getStreamerName() + " §cก่อน"));
                    return true;
                }
                setAdminDecorateMode(player, !isAdminDecorateMode(player));
                if (!(sender instanceof Player)) {
                    sender.sendMessage("§aโหมดแต่งแมพสลับให้ §f" + player.getName()
                            + (isAdminDecorateMode(player) ? " §a(เปิด Creative+บิน)" : " §e(ปิด)"));
                }
            }
            case "save" -> {
                int n = farmBuilder != null ? farmBuilder.saveDecorationsNow() : 0;
                sender.sendMessage("§aบันทึก Farm decor §f" + n);
            }
            case "load" -> {
                if (world != null && farmBuilder != null) farmBuilder.restoreDecorations(world);
                sender.sendMessage("§aโหลด Farm decor");
            }
            case "fire", "disaster", "burn" -> {
                boolean ok = farmControlService.fireDisaster();
                sender.sendMessage(ok ? "§6ไฟไหม้นา!" : "§cล้มเหลว");
            }
            case "cow", "cows" -> {
                boolean ok = farmControlService.cowEvent();
                sender.sendMessage(ok ? "§eวัวบุกนา!" : "§cล้มเหลว");
            }
            case "villager", "villagers", "helper" -> {
                boolean ok = farmControlService.villagerHelper();
                sender.sendMessage(ok ? "§aชาวบ้านช่วยปลูก!" : "§cล้มเหลว");
            }
            case "plant", "plant_full", "instant", "fullgrow", "growall" -> {
                boolean ok = farmControlService.plantAllFull();
                sender.sendMessage(ok ? "§aปลูกข้าวเต็มทันที!" : "§cล้มเหลว");
            }
            case "wipe", "clear", "alarm" -> {
                boolean ok = farmControlService.wipe();
                sender.sendMessage(ok ? "§cล้างนา!" : "§cล้มเหลว");
            }
            case "flood", "drown", "tsunami" -> {
                boolean ok = farmControlService.flood();
                sender.sendMessage(ok ? "§bน้ำท่วมนา — ดับไฟ!" : "§cล้มเหลว");
            }
            case "dragon", "draco", "enderdragon" -> {
                boolean ok = farmControlService.dragonBurn();
                sender.sendMessage(ok ? "§5มังกรพ่นไฟ!" : "§cล้มเหลว");
            }
            case "jail", "cage", "stun", "glass" -> {
                int sec = args.length > 2 ? parseIntSafe(args[2], 10) : 10;
                if (gameSessionService != null) {
                    gameSessionService.stunPlayer(sec);
                    sender.sendMessage("§6ห้องขังกระจก §f" + sec + "§6 วิ");
                } else sender.sendMessage("§cห้องขังไม่พร้อม");
            }
            case "jail_add", "cage_add", "stun_add" -> {
                int sec = args.length > 2 ? parseIntSafe(args[2], 10) : 10;
                if (gameSessionService != null) {
                    gameSessionService.addStun(sec);
                    sender.sendMessage("§6ห้องขัง +" + sec + " วิ");
                } else sender.sendMessage("§cห้องขังไม่พร้อม");
            }
            case "jail_sub", "jail_reduce", "cage_sub", "stun_reduce" -> {
                int sec = args.length > 2 ? parseIntSafe(args[2], 10) : 10;
                if (gameSessionService != null) {
                    gameSessionService.reduceStun(sec);
                    sender.sendMessage("§eลดเวลาห้องขัง -" + sec + " วิ");
                } else sender.sendMessage("§cห้องขังไม่พร้อม");
            }
            case "water", "bottle", "splash" -> {
                farmControlService.giveWater();
                sender.sendMessage("§bแจก Splash Water Bottle");
            }
            case "snow", "snowball", "balls", "kit" -> {
                if (sender instanceof Player p) farmControlService.giveFarmKit(p);
                else farmControlService.giveSnowballs();
                farmControlService.giveWater();
                sender.sendMessage("§aแจก Snowball + ขวดน้ำ");
            }
            case "clearsky", "sky", "debris", "floatclear" -> {
                int n = 0;
                int holes = 0;
                if (farmBuilder != null && world != null) {
                    n = farmBuilder.clearFloatingDebris(world);
                    farmBuilder.purgeOrphanFarmland(world, farmBuilder.getCenterX(), farmBuilder.getCenterZ(),
                            farmBuilder.getFloorY(), farmBuilder.getHalf());
                    holes = farmBuilder.fillSurfaceHoles(world);
                    if (decorationStore != null) decorationStore.clearFarmDecorations();
                }
                sender.sendMessage("§aลบโครงสร้างลอย §f" + n + " §a· เติมหลุม §f" + holes);
            }
            case "fillholes", "holes", "fixdirt" -> {
                int holes = farmBuilder != null ? farmBuilder.fillSurfaceHoles(world) : 0;
                sender.sendMessage("§aเติมหลุมดิน §f" + holes + " §aจุด");
            }
            case "status", "hud", "json" -> sender.sendMessage(farmControlService.statusJson());
            case "function", "fn", "run" -> {
                if (args.length < 3) {
                    sender.sendMessage("§e/tokcontrol farm function events/fire_disaster");
                    return true;
                }
                String path = args[2];
                boolean ok = farmControlService.runFunction(path);
                sender.sendMessage(ok ? "§afunction " + path : "§cล้มเหลว " + path);
            }
            case "datapack", "pack" -> {
                if (world != null) farmControlService.installDatapack(world);
                runConsoleSafe("datapack enable \"file/tokcontrol_farm\"");
                sender.sendMessage("§aติดตั้ง/เปิด datapack tokcontrol_farm");
            }
            default -> sender.sendMessage("§e/tokcontrol farm start|expand|shrink|snowman|blaze|admin|save|fire|…");
        }
        return true;
    }

    private void runConsoleSafe(String cmd) {
        try {
            Bukkit.dispatchCommand(Bukkit.getConsoleSender(), cmd);
        } catch (Exception ignored) {}
    }

    private static int parseIntSafe(String raw, int fallback) {
        try { return Integer.parseInt(raw.trim()); } catch (Exception e) { return fallback; }
    }

    private static String needTeamMsg(String err) {
        return "need_team".equals(err) ? "ต้องพิมพ์ 1/A หรือ 2/B ในเกมก่อน" : String.valueOf(err);
    }

    private static TowerWarsService.Team parseTeam(String raw) {
        if (raw == null) return null;
        String t = raw.toLowerCase().trim();
        if (t.equals("1") || t.equals("a") || t.equals("blue") || t.equals("ฟ้า") || t.equals("bule")) {
            return TowerWarsService.Team.BLUE;
        }
        if (t.equals("2") || t.equals("b") || t.equals("red") || t.equals("แดง")) {
            return TowerWarsService.Team.RED;
        }
        return null;
    }
}
