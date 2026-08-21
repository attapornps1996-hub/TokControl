using System;
using System.Collections.Generic;

namespace TokControlREPOBridge.Commands;

/// <summary>
/// Events that must execute on the lobby host in multiplayer (world/spawn/revive mutations).
/// Exact allowlist — most solo player buffs/debuffs run on the receiving client instead.
/// </summary>
internal static class HostEventPolicy
{
    private static readonly HashSet<string> MustRunOnHost = new(StringComparer.OrdinalIgnoreCase)
    {
        "solo_buff_resurrect", "all_buff_resurrect_rand", "all_buff_resurrect_all", "all_buff_hp_average",
        "all_goal_dec", "all_goal_inc", "solo_debuff_item_boom", "all_debuff_kill_rand", "all_cart_spread",
        "active_nade_stun", "active_nade_shock", "active_nade_expl", "active_nade_duck",
        "spawn_duck", "spawn_spewer", "spawn_upscream", "spawn_alien", "spawn_animal", "spawn_baby",
        "spawn_thinman", "spawn_hidden", "spawn_frog", "spawn_bowtie", "spawn_huntsman", "spawn_head",
        "spawn_trudge", "spawn_clown", "spawn_robe", "spawn_reaper", "spawn_dogo", "spawn_tick",
        "spawn_birthday_boy", "spawn_gambit", "spawn_headgrab", "spawn_heart_hugger", "spawn_cleanup_crew",
        "spawn_bella", "spawn_oogly", "spawn_loom",
        "item_health_small", "item_health_med", "item_health_big", "item_crystal",
        "item_nade_stun", "item_nade_shock", "item_nade_expl", "item_nade_f1", "item_nade_duck_f1",
        "item_mine_stun", "item_mine_shock", "item_mine_expl", "item_rubber_duck",
        "item_book_roll", "item_book_speed", "item_book_energy", "item_book_health", "item_book_range",
        "item_book_strength", "item_book_jump", "item_book_wings", "item_book_rest", "item_book_battery",
        "item_book_climb", "item_drone_roll", "item_drone_gravity", "item_drone_feather", "item_drone_energy",
        "item_drone_shield", "item_sphere_gravity", "item_frying_pan", "item_inflatable_hammer", "item_sword",
        "item_baseball_bat", "item_sledge_hammer", "item_valuable_tracker", "item_extraction_tracker",
        "item_cart_small", "item_cart_medium", "item_cart_cannon", "item_cart_laser", "item_cart_scooter",
        "item_cart_scooter_small", "item_tranq", "item_handgun", "item_shotgun", "item_duck_bucket",
        "item_melee_prodzap", "item_gun_boltzap", "item_gun_pulse", "item_bridge", "item_photon_blaster",
        "item_staff_gravity", "item_staff_torque", "item_staff_void", "item_walkie_talkie", "item_revive",
        "loot_rand_small", "loot_rand_med", "loot_rand_big", "loot_rand_huge", "loot_rand_enemy",
        "loot_rand_beta_small", "loot_rand_beta_med", "loot_money_rain",
        "loot_frog", "loot_bottle", "loot_love_potion", "loot_gramophone", "loot_power_crystal", "loot_fan",
        "loot_clown", "loot_guitar", "loot_propane_tank", "loot_music_box", "loot_television",
        "loot_flamethrower", "loot_saw", "loot_time_glass", "loot_doll", "loot_barrel", "loot_sword",
        "loot_staff", "loot_animal_crate", "loot_creature_leg", "loot_ice_block", "loot_broom",
        "loot_painting", "loot_harp", "loot_grandfather_clock", "loot_golden_statue", "loot_science_station",
        "loot_server_rack", "loot_dinosaur", "loot_griffin_statue", "loot_piano",
        "loot_mug_deluxe", "loot_baby_head", "loot_gem_burger", "loot_ac_gumball", "loot_ac_boombox",
        "loot_milk", "loot_golden_swirl", "loot_ac_blender", "loot_horse", "loot_ac_trafic_light",
        "loot_star_wand", "loot_lev_potion", "loot_jackhammer", "loot_coffin", "loot_tray", "loot_dragon_skull",
        "solo_frogs_around", "solo_poop_diamonds", "solo_poop_mines", "solo_poop_nades",
        "all_stun_enemies", "all_cart_teleport_rand", "all_cart_teleport_start",
        "all_teleport_rand", "solo_teleport_start", "all_teleport_start", "all_teleport_shuffle",
        "solo_upgrade_roll", "solo_upgrade_speed", "solo_upgrade_energy", "solo_upgrade_health",
        "solo_upgrade_range", "solo_upgrade_strength", "solo_upgrade_jump", "solo_upgrade_wings",
        "solo_upgrade_rest",
        // TokControl extras that mutate the world
        "solo_toycars_around", "solo_toyplanes_around", "solo_poop_shock_mines",
        "all_nade_burst", "all_nade_duck", "all_speak_random",
        "spawn_ceiling_eye", "spawn_gnome", "spawn_bang",
        "spawn_item", "spawn_enemy", "spawn_ghost", "spawn_valuable", "spawn_batch"
    };

    public static bool MustRunFromHost(string eventOrCmd)
    {
        if (string.IsNullOrWhiteSpace(eventOrCmd)) return false;
        var key = eventOrCmd.Trim().ToLowerInvariant();
        while (key.StartsWith("repo_", StringComparison.Ordinal))
        {
            key = key.Substring(5);
        }

        return MustRunOnHost.Contains(key);
    }
}
