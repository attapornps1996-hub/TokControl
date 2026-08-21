using System;
using System.Collections.Generic;
using System.Globalization;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

/// <summary>
/// Executes stream-style command strings (from commands.data) using native REPO game APIs.
/// </summary>
internal static class EffectCommandExecutor
{
    public static bool TryExecuteLine(string commandLine)
    {
        if (string.IsNullOrWhiteSpace(commandLine)) return false;

        var ok = true;
        foreach (var part in commandLine.Split(';'))
        {
            var trimmed = part.Trim();
            if (trimmed.Length == 0) continue;
            ok &= TryExecuteSingle(trimmed);
        }

        return ok;
    }

    public static bool TryExecuteEvent(string eventId)
    {
        if (EventCommandCatalog.TryGetCommandLine(eventId, out var commandLine))
        {
            return TryExecuteLine(commandLine);
        }

        if (!RepoEventMap.TryGetEffectCommand(eventId, out commandLine))
        {
            return false;
        }

        return TryExecuteLine(commandLine);
    }

    private static bool TryExecuteSingle(string commandLine)
    {
        try
        {
            var parts = SplitArgs(commandLine);
            if (parts.Count == 0) return false;

            var cmd = parts[0].ToLowerInvariant();
            var args = parts.Count > 1 ? parts.GetRange(1, parts.Count - 1) : new List<string>();

            switch (cmd)
            {
                case "spawn_item":
                {
                    var name = ReadNameThenFloats(args, out var rest);
                    if (string.IsNullOrEmpty(name)) return false;
                    var length = ReadFloat(rest, 0, 0f);
                    var height = ReadFloat(rest, 1, 1f);
                    var pos = SpawnHelper.GetItemSpawnPosition(length, height, 0);
                    return ItemSpawnHelper.TrySpawn(name, pos, Quaternion.identity, out _, 0, true) != null
                           || ValuableSpawnHelper.TrySpawn(name, pos, Quaternion.identity, out _);
                }

                case "spawn_enemy":
                {
                    var name = ReadNameThenFloats(args, out _);
                    if (string.IsNullOrEmpty(name)) return false;
                    name = EnemyRegistry.ResolveInternalName(name);
                    var pos = SpawnHelper.GetEnemySpawnPosition(0);
                    if (!EnemySpawnHelper.TrySpawn(name, pos, out var spawnedName))
                    {
                        // Retry once near the player if map-point spawn failed.
                        pos = SpawnHelper.GetEnemyFallbackSpawnNearPlayer(0);
                        if (!EnemySpawnHelper.TrySpawn(name, pos, out spawnedName))
                        {
                            return false;
                        }
                    }

                    ModLog.Info($"spawn_enemy ok '{spawnedName}' at {pos}");
                    return true;
                }

                case "tok_active_nade":
                {
                    var kind = ReadString(args, 0, "stun");
                    var count = Math.Max(1, EventContext.StackCount);
                    return SpecialEffectHelper.SpawnPrimedActiveNades(kind, count);
                }

                case "spawn_active_item":
                {
                    var name = ReadNameThenFloats(args, out var rest);
                    if (string.IsNullOrEmpty(name)) return false;
                    // Map known active throwables onto the primed path.
                    var kind = MapActiveItemToNadeKind(name);
                    if (kind != null)
                    {
                        return SpecialEffectHelper.SpawnPrimedActiveNade(kind);
                    }

                    var length = ReadFloat(rest, 0, 1f);
                    var height = ReadFloat(rest, 1, 1f);
                    var pos = SpawnHelper.GetItemSpawnPosition(length, height, 0);
                    var go = ItemSpawnHelper.TrySpawn(name, pos, Quaternion.identity, out _, 0, true, skipGrenadeDormant: true);
                    if (go == null) return false;
                    SpecialEffectHelper.ActivateSpawnedActiveItem(go);
                    return true;
                }

                case "spawn_simple_item_group":
                {
                    var group = ReadString(args, 0, "group_loot_rand_small");
                    var length = ReadFloat(args, 1, 0f);
                    var height = ReadFloat(args, 2, 1f);
                    var picked = DropGroupCatalog.PickRandom(group);
                    if (string.IsNullOrEmpty(picked)) return false;
                    var pos = SpawnHelper.GetItemSpawnPosition(length, height, 0);
                    return ValuableSpawnHelper.TrySpawn(picked!, pos, Quaternion.identity, out _)
                           || ItemSpawnHelper.TrySpawn(picked!, pos, Quaternion.identity, out _, 0, true) != null;
                }

                case "spawn_item_group":
                {
                    var group = ReadString(args, 0, "group_single_item");
                    var length = ReadFloat(args, 1, 0f);
                    var height = ReadFloat(args, 2, 1f);
                    var items = DropGroupCatalog.PickRandomVariantItems(group);
                    if (items.Length == 0) return false;
                    var any = false;
                    for (var i = 0; i < items.Length; i++)
                    {
                        var pos = SpawnHelper.GetItemSpawnPosition(length + i * 0.1f, height, i);
                        if (ValuableSpawnHelper.TrySpawn(items[i], pos, Quaternion.identity, out _)
                            || ItemSpawnHelper.TrySpawn(items[i], pos, Quaternion.identity, out _, i, true) != null)
                        {
                            any = true;
                        }
                    }

                    return any;
                }

                case "upgrade_player_tumble_launch":
                    return ApplyUpgradeEvent("solo_upgrade_roll");
                case "upgrade_player_sprint_speed":
                    return ApplyUpgradeEvent("solo_upgrade_speed");
                case "upgrade_player_stamina":
                    return ApplyUpgradeEvent("solo_upgrade_energy");
                case "upgrade_player_health":
                    return ApplyUpgradeEvent("solo_upgrade_health");
                case "upgrade_player_grab_range":
                    return ApplyUpgradeEvent("solo_upgrade_range");
                case "upgrade_player_grab_strength":
                    return ApplyUpgradeEvent("solo_upgrade_strength");
                case "upgrade_player_extra_jump":
                    return ApplyUpgradeEvent("solo_upgrade_jump");
                case "upgrade_player_wings":
                    return ApplyUpgradeEvent("solo_upgrade_wings");
                case "upgrade_player_crouch_rest":
                    return ApplyUpgradeEvent("solo_upgrade_rest");

                case "disable_player_aiming":
                    return PlayerEffectHelper.DisableAiming(ReadDuration(args, 0, 30f));

                case "disable_player_movement":
                    return PlayerEffectHelper.DisableMovement(ReadDuration(args, 0, 10f));

                case "disable_input":
                    return PlayerEffectHelper.DisableInputKey(ReadString(args, 1, "Grab"), ReadDuration(args, 0, 10f));

                case "hold_input":
                    return PlayerEffectHelper.HoldInputKey(ReadString(args, 1, "Crouch"), ReadDuration(args, 0, 45f));

                case "shuffle_player_movement":
                    return PlayerEffectHelper.ShuffleMovement(ReadDuration(args, 0, 45f));

                case "hurt_player_amount":
                    return PlayerEffectHelper.HurtPlayerAmount(
                        ReadBool(args, 0, false),
                        ReadInt(args, 1, 10),
                        ReadBool(args, 2, true));

                case "slap_all_room":
                    return PlayerEffectHelper.SlapAllRoom(ReadInt(args, 0, 10));

                case "heal_player_amount":
                    return PlayerEffectHelper.HealPlayerAmount(ReadBool(args, 0, false), ReadInt(args, 1, 25));

                case "explode_player":
                    return PlayerEffectHelper.ExplodeLocalPlayer();

                case "explode_random_player":
                    return SpecialEffectHelper.ExplodeRandomPlayer();

                case "explode_closest_item":
                    return SpecialEffectHelper.ExplodeClosestItem(
                        ReadFloat(args, 0, 13f),
                        ReadFloat(args, 1, 13f),
                        ReadFloat(args, 2, 5f));

                case "avg_players_hp":
                    return SpecialEffectHelper.AveragePlayersHp();

                case "drop_inventory":
                    return PlayerEffectHelper.DropInventory();

                case "resurrect_player":
                    return SpecialEffectHelper.ResurrectPlayers(false, false);

                case "resurrect_all_players":
                    return SpecialEffectHelper.ResurrectPlayers(true, false);

                case "resurrect_random_player":
                    return SpecialEffectHelper.ResurrectPlayers(true, true);

                case "resurrect_closest_player":
                    return SpecialEffectHelper.ResurrectClosestDeadPlayer();

                case "teleport_player_rnd_point_start_room":
                    return SpecialEffectHelper.TeleportPlayerRandomPoint(true, ReadBool(args, 0, false));

                case "teleport_player_rnd_point_rnd_room":
                    return SpecialEffectHelper.TeleportPlayerRandomPoint(false, ReadBool(args, 0, false));

                case "teleport_shuffle_players":
                    return SpecialEffectHelper.TeleportShufflePlayers();

                case "shuffle_players_hp":
                    return SpecialEffectHelper.ShufflePlayersHp();

                case "change_extract_goal_percents":
                    return SpecialEffectHelper.ChangeExtractGoalPercent(ReadFloat(args, 0, 1f));

                case "shake_cart_items_delayed":
                    return SpecialEffectHelper.ShakeCartItems(
                        ReadFloat(args, 0, 0.5f),
                        ReadFloat(args, 1, 1.5f),
                        ReadFloat(args, 2, 35f),
                        ReadFloat(args, 3, 55f));

                case "teleport_carts_to_start":
                    return SpecialEffectHelper.TeleportCarts(true);

                case "teleport_carts_to_random_room":
                    return SpecialEffectHelper.TeleportCarts(false);

                case "stun_enemies":
                    return SpecialEffectHelper.StunEnemies(ReadFloat(args, 0, 7f));

                case "spawn_items_around_player":
                    return SpecialEffectHelper.SpawnItemsAroundPlayer(
                        ReadString(args, 0, "Valuable_Manor_Frog"),
                        ReadFloat(args, 1, 1f),
                        ReadFloat(args, 2, 1f),
                        ReadInt(args, 3, 6));

                case "spawn_toycars_around":
                    return SpecialEffectHelper.SpawnToyCarsAroundPlayer(ReadInt(args, 0, 5));

                case "spawn_toyplanes_around":
                    return SpecialEffectHelper.SpawnToyPlanesAroundPlayer(ReadInt(args, 0, 5));

                case "spawn_items_from_player":
                    return SpecialEffectHelper.SpawnItemsFromPlayer(
                        ReadString(args, 0, ""),
                        ReadFloat(args, 1, 15f),
                        ReadFloat(args, 2, 0.5f),
                        ReadFloat(args, 3, 0.3f),
                        ReadFloat(args, 4, 0.5f),
                        ReadFloat(args, 5, 90f));

                case "random_player_speak":
                case "all_players_speak":
                    return SpecialEffectHelper.AllPlayersSpeak();

                case "nade_from_all_players":
                    return SpecialEffectHelper.SpawnNadesFromAllPlayers(
                        ReadString(args, 0, "expl"),
                        ReadInt(args, 1, 1));

                case "restore_stamina":
                    return PlayerEffectHelper.RestoreStamina();

                case "infinite_player_stamina":
                    return PlayerEffectHelper.InfiniteStamina(ReadDuration(args, 0, 60f));

                case "drain_player_stamina":
                    return PlayerEffectHelper.DrainStamina(ReadDuration(args, 0, 30f), ReadFloat(args, 1, 20f));

                case "invincible_player":
                    return PlayerEffectHelper.Invincible(ReadDuration(args, 0, 60f));

                case "set_player_speed_mult":
                    return PlayerEffectHelper.SetSpeedMultiplier(ReadDuration(args, 0, 45f), ReadFloat(args, 1, 0.33f));

                case "set_player_jump_power":
                    return PlayerEffectHelper.SetJumpPower(ReadDuration(args, 0, 60f), ReadFloat(args, 1, 40f));

                case "enable_anti_gravity":
                    return PlayerEffectHelper.EnableAntiGravity(ReadDuration(args, 0, 60f));

                case "set_player_gravity":
                    return PlayerEffectHelper.SetHeavyGravity(ReadDuration(args, 0, 45f), ReadFloat(args, 1, 120f));

                case "knockdown_player":
                    return PlayerEffectHelper.Knockdown(ReadDuration(args, 0, 10f), ReadFloat(args, 1, 10f));

                case "rel_force_move":
                    return PlayerEffectHelper.RelativeForceMove(ReadFloat(args, 0, 0f), ReadFloat(args, 1, 0f), 20f);

                case "force_rb":
                    return PlayerEffectHelper.ForceRigidBody(
                        ReadFloat(args, 0, 0f),
                        ReadFloat(args, 1, 0f),
                        ReadFloat(args, 2, 0f),
                        ReadFloat(args, 3, 10f));

                case "player_set_health_pc":
                    return PlayerEffectHelper.SetHealthPercent(ReadBool(args, 0, false), ReadFloat(args, 1, 100f));

                default:
                    ModLog.Warn($"Effect command not implemented: {cmd}");
                    return false;
            }
        }
        catch (Exception ex)
        {
            ModLog.Error($"Effect command failed '{commandLine}': {ex.Message}");
            return false;
        }
    }

    private static string? MapActiveItemToNadeKind(string itemName)
    {
        var n = (itemName ?? "").ToLowerInvariant();
        // Duct-taped grenade is NOT rubber duck — check before any "duck" heuristic.
        if (n.Contains("duct")) return null;
        if (n.Contains("explosive") || n.Contains("expl") || n.Contains("human"))
        {
            if (n.Contains("human")) return null; // frag grenade — use plain spawn path
            return "expl";
        }
        if (n.Contains("shock")) return "shock";
        if (n.Contains("stun") && n.Contains("grenade")) return "stun";
        if (n.Contains("rubber_duck") || n.Contains("rubber duck")
            || (n.Contains("duck") && !n.Contains("bucket") && !n.Contains("duct")))
            return "duck";
        return null;
    }

    private static bool ApplyUpgradeEvent(string eventId)
    {
        try
        {
            if (PunManager.instance == null) return false;
            var player = EventContext.SoloTarget();
            if (player == null || PlayerTargeting.IsPlayerDead(player)) return false;
            var steamId = SemiFunc.PlayerGetSteamID(player);
            switch (eventId)
            {
                case "solo_upgrade_energy": PunManager.instance.UpgradePlayerEnergy(steamId, 1); break;
                case "solo_upgrade_health": PunManager.instance.UpgradePlayerHealth(steamId, 1); break;
                case "solo_upgrade_speed": PunManager.instance.UpgradePlayerSprintSpeed(steamId, 1); break;
                case "solo_upgrade_range": PunManager.instance.UpgradePlayerGrabRange(steamId, 1); break;
                case "solo_upgrade_strength": PunManager.instance.UpgradePlayerGrabStrength(steamId, 1); break;
                case "solo_upgrade_jump": PunManager.instance.UpgradePlayerExtraJump(steamId, 1); break;
                case "solo_upgrade_roll": PunManager.instance.UpgradePlayerTumbleLaunch(steamId, 1); break;
                case "solo_upgrade_wings": PunManager.instance.UpgradePlayerTumbleWings(steamId, 1); break;
                case "solo_upgrade_rest": PunManager.instance.UpgradePlayerCrouchRest(steamId, 1); break;
                default: return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            ModLog.Debug($"Upgrade failed: {ex.Message}");
            return false;
        }
    }

    /// <summary>First token is the asset id; remaining tokens are numeric offsets.</summary>
    private static string ReadNameThenFloats(IReadOnlyList<string> args, out List<string> rest)
    {
        rest = new List<string>();
        if (args.Count == 0) return "";

        var name = args[0];
        for (var i = 1; i < args.Count; i++) rest.Add(args[i]);
        return name.Trim();
    }

    private static List<string> SplitArgs(string line)
    {
        var result = new List<string>();
        var current = "";
        var inQuotes = false;

        foreach (var ch in line)
        {
            if (ch == '"')
            {
                inQuotes = !inQuotes;
                continue;
            }

            if (char.IsWhiteSpace(ch) && !inQuotes)
            {
                if (current.Length > 0)
                {
                    result.Add(current);
                    current = "";
                }

                continue;
            }

            current += ch;
        }

        if (current.Length > 0) result.Add(current);
        return result;
    }

    private static float ReadFloat(IReadOnlyList<string> args, int index, float fallback) =>
        index < args.Count && float.TryParse(args[index], NumberStyles.Float, CultureInfo.InvariantCulture, out var v)
            ? v
            : fallback;

    /// <summary>Duration scaled by gift combo stacks (EventContext.StackCount).</summary>
    private static float ReadDuration(IReadOnlyList<string> args, int index, float fallback) =>
        Mathf.Max(0.1f, ReadFloat(args, index, fallback) * Mathf.Max(1, EventContext.StackCount));

    private static int ReadInt(IReadOnlyList<string> args, int index, int fallback) =>
        index < args.Count && int.TryParse(args[index], NumberStyles.Integer, CultureInfo.InvariantCulture, out var v)
            ? v
            : fallback;

    private static bool ReadBool(IReadOnlyList<string> args, int index, bool fallback) =>
        index < args.Count && bool.TryParse(args[index], out var v) ? v : fallback;

    private static string ReadString(IReadOnlyList<string> args, int index, string fallback) =>
        index < args.Count && !string.IsNullOrWhiteSpace(args[index]) ? args[index] : fallback;
}

