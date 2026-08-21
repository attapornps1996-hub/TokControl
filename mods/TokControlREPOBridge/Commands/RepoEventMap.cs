using System;
using System.Collections.Generic;

namespace TokControlREPOBridge.Commands;

/// <summary>
/// Internal game IDs from Internal game IDs for stream spawn events (enemy / item / active item).
/// Display names in UI/wiki differ from these runtime identifiers.
/// </summary>
internal static class RepoEventMap
{
    private static readonly Dictionary<string, string> EnemyByEventId =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["spawn_duck"] = "Duck",
            ["spawn_spewer"] = "Slow_Mouth",
            ["spawn_upscream"] = "Upscream",
            ["spawn_alien"] = "Floater",
            ["spawn_animal"] = "Animal",
            ["spawn_baby"] = "Valuable_Thrower",
            ["spawn_thinman"] = "Thin_Man",
            ["spawn_hidden"] = "Hidden",
            ["spawn_frog"] = "Tumbler",
            ["spawn_bowtie"] = "Bowtie",
            ["spawn_huntsman"] = "Hunter",
            ["spawn_head"] = "Head",
            ["spawn_trudge"] = "Slow_Walker",
            ["spawn_clown"] = "Beamer",
            ["spawn_robe"] = "Robe",
            ["spawn_reaper"] = "Runner",
            ["spawn_dogo"] = "Elsa",
            ["spawn_tick"] = "Tick",
            ["spawn_birthday_boy"] = "Birthday_boy",
            ["spawn_gambit"] = "Spinny",
            ["spawn_headgrab"] = "Head_Grabber",
            ["spawn_heart_hugger"] = "Heart_Hugger",
            ["spawn_cleanup_crew"] = "Bomb_Thrower",
            ["spawn_bella"] = "Tricycle",
            ["spawn_oogly"] = "Oogly",
            ["spawn_loom"] = "Shadow",
            ["spawn_ceiling_eye"] = "Ceiling Eye",
            ["spawn_gnome"] = "Gnome",
            ["spawn_bang"] = "Bang"
        };

    private static readonly Dictionary<string, string> ActiveItemByEventId =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["active_nade_stun"] = "Item_Grenade_Stun",
            ["active_nade_shock"] = "Item_Grenade_Shockwave",
            ["active_nade_expl"] = "Item_Grenade_Explosive",
            ["active_nade_duck"] = "Item_Rubber_Duck"
        };

    private static readonly Dictionary<string, string> ItemByEventId =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["item_health_small"] = "Item_Health_Pack_Small",
            ["item_health_med"] = "Item_Health_Pack_Medium",
            ["item_health_big"] = "Item_Health_Pack_Large",
            ["item_crystal"] = "Item_Power_Crystal",
            ["item_nade_stun"] = "Item_Grenade_Stun",
            ["item_nade_shock"] = "Item_Grenade_Shockwave",
            ["item_nade_expl"] = "Item_Grenade_Explosive",
            ["item_nade_f1"] = "Item_Grenade_Human",
            ["item_nade_duck_f1"] = "Item_Grenade_Duct_Taped",
            ["item_mine_stun"] = "Item_Mine_Stun",
            ["item_mine_shock"] = "Item_Mine_Shockwave",
            ["item_mine_expl"] = "Item_Mine_Explosive",
            ["item_rubber_duck"] = "Item_Rubber_Duck",
            ["item_handgun"] = "Item_Gun_Handgun",
            ["item_shotgun"] = "Item_Gun_Shotgun",
            ["item_tranq"] = "Item_Gun_Tranq",
            ["item_frying_pan"] = "Item_Melee_Frying_Pan",
            ["item_baseball_bat"] = "Item_Melee_Baseball_Bat",
            ["item_sledge_hammer"] = "Item_Melee_Sledge_Hammer",
            ["item_sword"] = "Item_Melee_Sword",
            ["item_duck_bucket"] = "Item_Duck_Bucket",
            ["item_photon_blaster"] = "Item_Gun_Laser",
            ["item_revive"] = "Item_ReviveItem",
            ["item_book_roll"] = "Item_Upgrade_Player_Tumble_Launch",
            ["item_book_speed"] = "Item_Upgrade_Player_Sprint_Speed",
            ["item_book_energy"] = "Item_Upgrade_Player_Energy",
            ["item_book_health"] = "Item_Upgrade_Player_Health",
            ["item_book_range"] = "Item_Upgrade_Player_Grab_Range",
            ["item_book_strength"] = "Item_Upgrade_Player_Grab_Strength",
            ["item_book_jump"] = "Item_Upgrade_Player_Extra_Jump",
            ["item_book_wings"] = "Item_Upgrade_Player_Tumble_Wings",
            ["item_book_rest"] = "Item_Upgrade_Player_Crouch_Rest",
            ["item_book_battery"] = "Item_Upgrade_Death_Head_Battery",
            ["item_book_climb"] = "Item_Upgrade_Player_Tumble_Climb",
            ["item_drone_roll"] = "Item_Drone_Torque",
            ["item_drone_gravity"] = "Item_Drone_Zero_Gravity",
            ["item_drone_feather"] = "Item_Drone_Feather",
            ["item_drone_energy"] = "Item_Drone_Battery",
            ["item_drone_shield"] = "Item_Drone_Indestructible",
            ["item_sphere_gravity"] = "Item_Orb_Zero_Gravity",
            ["item_inflatable_hammer"] = "Item_Melee_Inflatable_Hammer",
            ["item_valuable_tracker"] = "Item_Valuable_Tracker",
            ["item_extraction_tracker"] = "Item_Extraction_Tracker",
            ["item_cart_small"] = "Item_Cart_Small",
            ["item_cart_medium"] = "Item_Cart_Medium",
            ["item_cart_cannon"] = "Item_Cart_Cannon",
            ["item_cart_laser"] = "Item_Cart_Laser",
            ["item_cart_scooter"] = "Item_Vehicle_Semiscooter",
            ["item_cart_scooter_small"] = "Item_Vehicle_Semiscooter_Small",
            ["item_bridge"] = "Item_Phase_Bridge",
            ["item_melee_prodzap"] = "Item_Melee_Stun_Baton",
            ["item_gun_boltzap"] = "Item_Gun_Stun",
            ["item_gun_pulse"] = "Item_Gun_Shockwave",
            ["item_staff_gravity"] = "Item_Staff_Zero_Gravity",
            ["item_staff_torque"] = "Item_Staff_Torque",
            ["item_staff_void"] = "Item_Staff_Void",
            ["item_walkie_talkie"] = "Item_WalkieTalkieBox"
        };

    private static readonly Dictionary<string, string> EffectByEventId =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["solo_debuff_camera"] = "disable_player_aiming 30",
            ["solo_debuff_freez"] = "disable_player_aiming 10; disable_player_movement 10; disable_input 10 Movement; disable_input 10 Jump; disable_input 10 Crouch; disable_input 10 Grab",
            ["solo_debuff_grab"] = "disable_input 45 Grab",
            ["solo_debuff_crouch"] = "hold_input 45 Crouch",
            ["solo_debuff_wasd"] = "shuffle_player_movement 30",
            ["solo_debuff_hurt"] = "hurt_player_amount false 10 true; rel_force_move -15 0",
            ["solo_debuff_energy"] = "drain_player_stamina 30 20",
            ["solo_debuff_knockdown"] = "knockdown_player 10 10",
            ["solo_debuff_slow"] = "set_player_speed_mult 45 0.33",
            ["solo_debuff_gravity"] = "set_player_gravity 45 120",
            ["solo_debuff_push_up"] = "force_rb 0 100 0 10",
            ["solo_debuff_push_front"] = "rel_force_move 100 0 20",
            ["solo_debuff_push_back"] = "rel_force_move -100 0 20",
            ["solo_debuff_kill"] = "explode_player",
            ["solo_buff_heal"] = "heal_player_amount false 25",
            ["solo_buff_energy"] = "restore_stamina",
            ["solo_buff_full_restore"] = "player_set_health_pc false 100; restore_stamina",
            ["solo_buff_speed"] = "set_player_speed_mult 60 3",
            ["solo_buff_jump"] = "set_player_jump_power 60 40",
            ["solo_buff_energymode"] = "infinite_player_stamina 60",
            ["solo_buff_godmode"] = "invincible_player 60",
            ["solo_buff_gravity"] = "enable_anti_gravity 60",
            ["all_buff_heal"] = "heal_player_amount true 25",
            ["all_buff_full_restore"] = "player_set_health_pc true 100",
            ["all_debuff_hurt"] = "slap_all_room 999; rel_force_move -15 0",
            ["all_debuff_kill_rand"] = "explode_random_player",
            ["solo_teleport_start"] = "teleport_player_rnd_point_start_room false",
            ["solo_teleport_rand"] = "teleport_player_rnd_point_rnd_room false",
            ["solo_buff_resurrect"] = "resurrect_player",
            ["solo_frogs_around"] = "spawn_items_around_player Valuable_Manor_Frog 1 1 6",
            ["solo_toycars_around"] = "spawn_toycars_around 5",
            ["solo_toyplanes_around"] = "spawn_toyplanes_around 5",
            ["solo_poop_diamonds"] = "spawn_items_from_player Valuable_Wizard_Diamond 15 0.5 0.3 0.5 90",
            ["solo_poop_mines"] = "spawn_items_from_player Item_Mine_Explosive 15 1 0.3 1 1",
            ["solo_poop_shock_mines"] = "spawn_items_from_player Item_Mine_Shockwave 15 1 0.3 1 1",
            ["solo_poop_nades"] = "spawn_items_from_player group_item_rand_nades 15 1 0.3 0.75 10",
            ["all_debuff_hp_shuffle"] = "shuffle_players_hp",
            ["all_goal_dec"] = "change_extract_goal_percents 0.75",
            ["all_goal_inc"] = "change_extract_goal_percents 1.25",
            ["all_teleport_shuffle"] = "teleport_shuffle_players",
            ["all_teleport_start"] = "teleport_player_rnd_point_start_room true",
            ["all_teleport_rand"] = "teleport_player_rnd_point_rnd_room true",
            ["all_cart_spread"] = "shake_cart_items_delayed 0 0.05 45 70 0 0 0.2 5",
            ["all_cart_teleport_start"] = "teleport_carts_to_start",
            ["all_cart_teleport_rand"] = "teleport_carts_to_random_room",
            ["all_buff_resurrect_rand"] = "resurrect_random_player",
            ["all_buff_resurrect_all"] = "resurrect_all_players",
            ["item_revive"] = "spawn_item Item_ReviveItem 0 1",
            ["all_stun_enemies"] = "stun_enemies 7",
            ["all_speak_random"] = "all_players_speak",
            ["all_nade_burst"] = "nade_from_all_players expl 1",
            ["all_nade_duck"] = "nade_from_all_players duck 2"
        };

    private static readonly Dictionary<string, string> LootByEventId =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["loot_frog"] = "Valuable_Manor_Frog",
            ["loot_bottle"] = "Valuable_Manor_Bottle",
            ["loot_love_potion"] = "Valuable_Wizard_Love_Potion",
            ["loot_gramophone"] = "Valuable_Manor_Gramophone",
            ["loot_power_crystal"] = "Valuable_Wizard_Power_Crystal",
            ["loot_fan"] = "Valuable_Arctic_Fan",
            ["loot_clown"] = "Valuable_Manor_Clown",
            ["loot_guitar"] = "Valuable_Arctic_Guitar",
            ["loot_propane_tank"] = "Valuable_Arctic_Propane_Tank",
            ["loot_music_box"] = "Valuable_Manor_Music_Box",
            ["loot_television"] = "Valuable_Manor_Television",
            ["loot_flamethrower"] = "Valuable_Arctic_Flamethrower",
            ["loot_saw"] = "Valuable_Arctic_Ice_Saw",
            ["loot_time_glass"] = "Valuable_Wizard_Time_Glass",
            ["loot_doll"] = "Valuable_Manor_Scream_Doll",
            ["loot_barrel"] = "Valuable_Arctic_Barrel",
            ["loot_sword"] = "Valuable_Wizard_Sword",
            ["loot_staff"] = "Valuable_Wizard_Dumgolfs_Staff",
            ["loot_animal_crate"] = "Valuable_Manor_Animal_Crate",
            ["loot_creature_leg"] = "Valuable_Arctic_Creature_Leg",
            ["loot_ice_block"] = "Valuable_Arctic_Ice_Block",
            ["loot_broom"] = "Valuable_Wizard_Broom",
            ["loot_painting"] = "Valuable_Manor_Painting",
            ["loot_harp"] = "Valuable_Manor_Harp",
            ["loot_grandfather_clock"] = "Valuable_Manor_Grandfather_Clock",
            ["loot_golden_statue"] = "Valuable_Manor_Golden_Statue",
            ["loot_science_station"] = "Valuable_Arctic_Science_Station",
            ["loot_server_rack"] = "Valuable_Arctic_Server_Rack",
            ["loot_dinosaur"] = "Valuable_Manor_Dinosaur",
            ["loot_griffin_statue"] = "Valuable_Wizard_Griffin_Statue",
            ["loot_piano"] = "Valuable_Manor_Piano",
            ["loot_mug_deluxe"] = "Valuable_Museum_Uranium_Mug_Deluxe",
            ["loot_baby_head"] = "Valuable_Museum_Baby_Head",
            ["loot_gem_burger"] = "Valuable_Museum_Gem_Burger",
            ["loot_ac_gumball"] = "Valuable_Museum_Gumball",
            ["loot_ac_boombox"] = "Valuable_Museum_Boombox",
            ["loot_milk"] = "Valuable_Museum_Milk",
            ["loot_golden_swirl"] = "Valuable_Museum_Golden_Swirl",
            ["loot_ac_blender"] = "Valuable_Museum_Blender",
            ["loot_horse"] = "Valuable_Museum_Horse",
            ["loot_ac_trafic_light"] = "Valuable_Museum_Traffic_Light",
            ["loot_star_wand"] = "Valuable_Wizard_Star_Wand",
            ["loot_lev_potion"] = "Valuable_Wizard_Levitation_Potion",
            ["loot_jackhammer"] = "Valuable_Arctic_Jackhammer",
            ["loot_coffin"] = "Valuable_Manor_Coffin",
            ["loot_tray"] = "Valuable_Museum_Tray",
            ["loot_dragon_skull"] = "Valuable_Wizard_Dragon_Skull"
        };

    public static IEnumerable<string> ExpandEnemyResourceNames(string internalName)
    {
        if (string.IsNullOrWhiteSpace(internalName)) yield break;

        yield return internalName;
        yield return internalName.Replace('_', ' ');

        var underscored = internalName.Replace(' ', '_');
        if (!string.Equals(underscored, internalName, StringComparison.Ordinal))
        {
            yield return underscored;
        }
    }

    public static bool TryGetEffectCommand(string eventId, out string commandLine)
    {
        if (EventCommandCatalog.TryGetCommandLine(eventId, out commandLine))
        {
            return true;
        }

        commandLine = "";
        if (string.IsNullOrWhiteSpace(eventId)) return false;
        return EffectByEventId.TryGetValue(NormalizeEventId(eventId), out commandLine!);
    }

    public static bool TryGetLootInternalName(string eventId, out string valuableId)
    {
        valuableId = "";
        if (string.IsNullOrWhiteSpace(eventId)) return false;
        return LootByEventId.TryGetValue(NormalizeEventId(eventId), out valuableId!);
    }

    public static bool TryGetEnemyInternalName(string eventOrSlug, out string internalName)
    {
        internalName = "";
        if (string.IsNullOrWhiteSpace(eventOrSlug)) return false;

        var key = NormalizeEventId(eventOrSlug);
        if (EnemyByEventId.TryGetValue(key, out internalName!)) return true;

        var slug = key.StartsWith("spawn_", StringComparison.Ordinal) ? key.Substring(6) : key;
        foreach (var pair in EnemyByEventId)
        {
            if (!pair.Key.EndsWith("_" + slug, StringComparison.Ordinal) &&
                !string.Equals(pair.Key, "spawn_" + slug, StringComparison.Ordinal))
            {
                continue;
            }

            internalName = pair.Value;
            return true;
        }

        return false;
    }

    public static string ResolveEnemyInternalName(string eventOrSlug)
    {
        if (TryGetEnemyInternalName(eventOrSlug, out var internalName))
        {
            return internalName;
        }

        return eventOrSlug.Trim().Replace(" ", "_");
    }

    public static bool TryGetActiveItem(string eventId, out string itemId)
    {
        itemId = "";
        if (string.IsNullOrWhiteSpace(eventId)) return false;
        return ActiveItemByEventId.TryGetValue(NormalizeEventId(eventId), out itemId!);
    }

    public static bool TryGetItemInternalName(string eventOrSlug, out string itemId)
    {
        itemId = "";
        if (string.IsNullOrWhiteSpace(eventOrSlug)) return false;

        var key = NormalizeEventId(eventOrSlug);
        if (ItemByEventId.TryGetValue(key, out itemId!)) return true;

        if (key.StartsWith("item_", StringComparison.Ordinal))
        {
            itemId = "Item_" + key.Substring(5);
            return true;
        }

        return false;
    }

    public static IEnumerable<string> ExpandItemSearchIds(string itemId)
    {
        yield return itemId;
        yield return itemId.Replace("_", " ");

        if (itemId.StartsWith("Item_", StringComparison.Ordinal))
        {
            var rest = itemId.Substring(5).Replace("_", " ");
            yield return "Item " + rest;
        }
    }

    private static string NormalizeEventId(string value)
    {
        value = value.Trim().ToLowerInvariant().Replace(' ', '_');
        while (value.StartsWith("repo_", StringComparison.Ordinal))
        {
            value = value.Substring(5);
        }

        while (value.Contains("__", StringComparison.Ordinal))
        {
            value = value.Replace("__", "_", StringComparison.Ordinal);
        }

        return value;
    }
}

