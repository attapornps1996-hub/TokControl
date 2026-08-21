package com.tokcontrol.minecraft;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.World;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Entity;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Player;
import org.bukkit.entity.Villager;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.MerchantRecipe;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Harbor rod shop — villagers trade Fish Tokens (from catches) for upgraded rods.
 */
public final class FishShopHelper {

    public static final String TOKEN_NAME = "§bFish Token";
    public static final String SHOP_TAG = "tc_fish_shop";

    private final TokControlPlugin plugin;
    private final NamespacedKey tokenKey;
    private final List<UUID> shopKeepers = new ArrayList<>();

    public FishShopHelper(TokControlPlugin plugin) {
        this.plugin = plugin;
        this.tokenKey = new NamespacedKey(plugin, "fish_token");
    }

    public NamespacedKey tokenKey() {
        return tokenKey;
    }

    public boolean isFishToken(ItemStack stack) {
        if (stack == null || stack.getType() != Material.COD) return false;
        ItemMeta meta = stack.getItemMeta();
        if (meta == null) return false;
        return meta.getPersistentDataContainer().has(tokenKey, PersistentDataType.BYTE);
    }

    public ItemStack createFishToken(int amount) {
        ItemStack stack = new ItemStack(Material.COD, Math.max(1, Math.min(64, amount)));
        ItemMeta meta = stack.getItemMeta();
        if (meta != null) {
            meta.setDisplayName(TOKEN_NAME);
            meta.setLore(List.of(
                    "§7Caught fish currency",
                    "§eTrade at the harbor shop",
                    "§8TokControl"
            ));
            meta.getPersistentDataContainer().set(tokenKey, PersistentDataType.BYTE, (byte) 1);
            stack.setItemMeta(meta);
        }
        return stack;
    }

    public void giveToken(Player player, int amount) {
        if (player == null || amount <= 0) return;
        player.getInventory().addItem(createFishToken(amount));
    }

    public void clearShopKeepers(World world) {
        for (UUID id : new ArrayList<>(shopKeepers)) {
            Entity e = Bukkit.getEntity(id);
            if (e != null) e.remove();
        }
        shopKeepers.clear();
        if (world != null) {
            for (Entity e : world.getEntities()) {
                if (e.getScoreboardTags().contains(SHOP_TAG)) e.remove();
            }
        }
    }

    /** Stall east of lighthouse + 3 shop villagers with rod upgrades. */
    public void buildShop(World world, int cx, int cz, int deckY) {
        if (world == null) return;
        clearShopKeepers(world);

        int sx = cx + 9;
        int sz = cz - 2;

        // Shop floor + canopy
        for (int x = sx - 2; x <= sx + 2; x++) {
            for (int z = sz - 2; z <= sz + 2; z++) {
                world.getBlockAt(x, deckY, z).setType(Material.STRIPPED_SPRUCE_WOOD, false);
                world.getBlockAt(x, deckY + 1, z).setType(Material.AIR, false);
                world.getBlockAt(x, deckY + 2, z).setType(Material.AIR, false);
                world.getBlockAt(x, deckY + 3, z).setType(Material.AIR, false);
            }
        }
        // Counter
        for (int z = sz - 1; z <= sz + 1; z++) {
            world.getBlockAt(sx - 1, deckY + 1, z).setType(Material.BARREL, false);
        }
        world.getBlockAt(sx - 1, deckY + 1, sz).setType(Material.CRAFTING_TABLE, false);
        // Posts + awning
        world.getBlockAt(sx - 2, deckY + 1, sz - 2).setType(Material.STRIPPED_OAK_LOG, false);
        world.getBlockAt(sx + 2, deckY + 1, sz - 2).setType(Material.STRIPPED_OAK_LOG, false);
        world.getBlockAt(sx - 2, deckY + 1, sz + 2).setType(Material.STRIPPED_OAK_LOG, false);
        world.getBlockAt(sx + 2, deckY + 1, sz + 2).setType(Material.STRIPPED_OAK_LOG, false);
        world.getBlockAt(sx - 2, deckY + 2, sz - 2).setType(Material.STRIPPED_OAK_LOG, false);
        world.getBlockAt(sx + 2, deckY + 2, sz - 2).setType(Material.STRIPPED_OAK_LOG, false);
        world.getBlockAt(sx - 2, deckY + 2, sz + 2).setType(Material.STRIPPED_OAK_LOG, false);
        world.getBlockAt(sx + 2, deckY + 2, sz + 2).setType(Material.STRIPPED_OAK_LOG, false);
        for (int x = sx - 2; x <= sx + 2; x++) {
            for (int z = sz - 2; z <= sz + 2; z++) {
                world.getBlockAt(x, deckY + 3, z).setType(Material.RED_WOOL, false);
            }
        }
        for (int x = sx - 1; x <= sx + 1; x++) {
            for (int z = sz - 1; z <= sz + 1; z++) {
                world.getBlockAt(x, deckY + 3, z).setType(Material.WHITE_WOOL, false);
            }
        }
        world.getBlockAt(sx, deckY + 4, sz).setType(Material.LANTERN, false);
        world.getBlockAt(sx + 2, deckY + 1, sz).setType(Material.CHEST, false);

        spawnShopkeeper(world, sx + 0.5, deckY + 1.0, sz + 0.5, "§6§lRod Merchant", 0);
        spawnShopkeeper(world, sx + 0.5, deckY + 1.0, sz - 1.2, "§e§lTackle Trader", 1);
        spawnShopkeeper(world, sx + 0.5, deckY + 1.0, sz + 1.2, "§b§lMaster Angler", 2);
    }

    private void spawnShopkeeper(World world, double x, double y, double z, String name, int catalog) {
        Location loc = new Location(world, x, y, z, -90f, 0f);
        Villager v = (Villager) world.spawnEntity(loc, EntityType.VILLAGER);
        v.setCustomName(name);
        v.setCustomNameVisible(true);
        v.setAI(false);
        v.setSilent(true);
        v.setInvulnerable(true);
        v.setRemoveWhenFarAway(false);
        v.setCollidable(false);
        v.setPersistent(true);
        v.addScoreboardTag(SHOP_TAG);
        v.addScoreboardTag("tc_fish");
        try {
            v.setProfession(Villager.Profession.FISHERMAN);
            v.setVillagerLevel(5);
            v.setVillagerExperience(100);
        } catch (Exception ignored) {}

        List<MerchantRecipe> recipes = buildRecipes(catalog);
        v.setRecipes(recipes);
        shopKeepers.add(v.getUniqueId());
    }

    private List<MerchantRecipe> buildRecipes(int catalog) {
        List<MerchantRecipe> list = new ArrayList<>();
        if (catalog == 0) {
            list.add(trade(5, rod("§aRookie Rod", 1, 0, 0, false)));
            list.add(trade(12, rod("§bHarbor Rod", 2, 1, 1, false)));
        } else if (catalog == 1) {
            list.add(trade(20, rod("§eCaptain Rod", 3, 2, 2, false)));
            list.add(trade(35, rod("§dMaster Rod", 3, 3, 3, true)));
        } else {
            list.add(trade(50, rod("§6§lLegend Rod", 5, 4, 3, true)));
            list.add(trade(8, rod("§3Lucky Rod", 2, 3, 1, false)));
        }
        return list;
    }

    private MerchantRecipe trade(int tokenCost, ItemStack result) {
        MerchantRecipe recipe = new MerchantRecipe(result, 0, 999, false);
        recipe.addIngredient(createFishToken(tokenCost));
        recipe.setExperienceReward(false);
        return recipe;
    }

    private ItemStack rod(String name, int lure, int luck, int unbreaking, boolean mending) {
        ItemStack rod = new ItemStack(Material.FISHING_ROD, 1);
        ItemMeta meta = rod.getItemMeta();
        if (meta != null) {
            meta.setDisplayName(name);
            List<String> lore = new ArrayList<>();
            lore.add("§7Harbor upgrade");
            lore.add("§8Lure " + lure + (luck > 0 ? " · Luck " + luck : ""));
            lore.add("§8TokControl Shop");
            meta.setLore(lore);
            meta.setUnbreakable(true);
            try {
                if (lure > 0) meta.addEnchant(Enchantment.LURE, Math.min(5, lure), true);
                if (luck > 0) meta.addEnchant(Enchantment.LUCK_OF_THE_SEA, Math.min(5, luck), true);
                if (unbreaking > 0) meta.addEnchant(Enchantment.UNBREAKING, Math.min(3, unbreaking), true);
                if (mending) meta.addEnchant(Enchantment.MENDING, 1, true);
            } catch (Exception ignored) {}
            rod.setItemMeta(meta);
        }
        return rod;
    }
}
