using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using REPOLib.Modules;
using TokControlREPOBridge.Logging;
using TokControlREPOBridge.Util;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

public sealed partial class GameActions
{
    internal CommandResult SpawnItemLocal(string itemName, int count, string user)
    {
        if (!RunGate.IsReadyForGameEvents())
        {
            return CommandResult.Fail("game_not_ready");
        }

        if (RepoEventMap.TryGetItemInternalName(itemName, out var mappedItem))
        {
            itemName = mappedItem;
        }

        SpawnHelper.GetItemOffsetForName(itemName, out var length, out var height);

        var spawned = 0;
        string? displayName = null;

        for (var i = 0; i < count; i++)
        {
            var pos = SpawnHelper.GetItemSpawnPosition(length, height, i);
            var rot = Quaternion.identity;
            var go = ItemSpawnHelper.TrySpawn(itemName, pos, rot, out var label, scatterIndex: i, holdInPlace: true);
            if (go == null) continue;

            go.transform.position = pos;
            displayName = label ?? itemName;
            spawned++;
        }

        if (spawned == 0)
        {
            ModLog.Warn($"Item not found: {itemName}");
            return CommandResult.Fail($"item_not_found:{itemName}");
        }

        ModLog.Info($"spawn_item '{displayName}' x{count} for @{user} (spawned {spawned})");
        GameNotifier.AnnounceSpawn(user, displayName ?? itemName, spawned, "item");
        return CommandResult.Ok($"spawned_item:{displayName}", $"count={spawned}");
    }

    internal CommandResult SpawnEnemyLocal(string enemyName, int count, string user)
    {
        if (!RunGate.IsReadyForGameEvents())
        {
            return CommandResult.Fail("game_not_ready");
        }

        if (SpawnBlocklist.IsBlockedEnemy(enemyName))
        {
            ModLog.Warn($"Enemy spawn temporarily disabled: {enemyName}");
            return CommandResult.Fail("spawn_disabled_temp");
        }

        enemyName = EnemyRegistry.ResolveInternalName(enemyName);

        if (SpawnBlocklist.IsBlockedEnemy(enemyName))
        {
            ModLog.Warn($"Enemy spawn temporarily disabled: {enemyName}");
            return CommandResult.Fail("spawn_disabled_temp");
        }

        var spawned = 0;
        string? displayName = null;

        for (var i = 0; i < count; i++)
        {
            var pos = SpawnHelper.GetEnemySpawnPosition(i);
            if (EnemySpawnHelper.TrySpawn(enemyName, pos, out var spawnedName))
            {
                displayName = spawnedName ?? enemyName;
                spawned++;
            }
        }

        if (spawned == 0)
        {
            var inMenu = false;
            try { inMenu = SemiFunc.MenuLevel(); } catch { /* ignore */ }

            if (inMenu && RunManager.instance == null)
            {
                ModLog.Warn($"Enemy spawn blocked in menu: {enemyName}");
                return CommandResult.Fail("game_not_ready");
            }

            ModLog.Warn($"Enemy not found: {enemyName}");
            return CommandResult.Fail($"enemy_not_found:{enemyName}");
        }

        ModLog.Info($"spawn_enemy '{displayName}' x{spawned} for @{user}");
        GameNotifier.AnnounceSpawn(user, displayName ?? enemyName, spawned, "enemy");
        return CommandResult.Ok($"spawned_enemy:{displayName}", $"count={spawned}");
    }

    internal CommandResult SpawnBatchLocal(string batchSpec, string user)
    {
        if (!RunGate.IsReadyForGameEvents())
        {
            return CommandResult.Fail("game_not_ready");
        }

        if (string.IsNullOrWhiteSpace(batchSpec))
        {
            return CommandResult.Fail("spawn_batch_empty");
        }

        var spawned = 0;
        var failed = 0;

        foreach (var part in batchSpec.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries))
        {
            var trimmed = part.Trim();
            if (trimmed.Length == 0) continue;

            var colon = trimmed.LastIndexOf(':');
            var eventId = colon > 0 ? trimmed.Substring(0, colon).Trim() : trimmed;
            var count = 1;
            if (colon > 0 && int.TryParse(trimmed.Substring(colon + 1), out var parsed))
            {
                count = Math.Max(1, parsed);
            }

            if (!RepoEventResolver.TryResolve(eventId, out var spawnCmd, out var target))
            {
                failed++;
                continue;
            }

            if (SpawnBlocklist.IsBlockedEventId(eventId)
                || (spawnCmd is "spawn_ghost" or "spawn_enemy" && SpawnBlocklist.IsBlockedEnemy(target)))
            {
                failed++;
                continue;
            }

            CommandResult result;
            if (spawnCmd is "spawn_ghost" or "spawn_enemy")
            {
                result = SpawnEnemyLocal(target, count, user);
            }
            else if (spawnCmd is "spawn_item")
            {
                result = SpawnItemLocal(target, count, user);
            }
            else if (spawnCmd is "spawn_valuable")
            {
                result = SpawnValuableLocal(target, count, user);
            }
            else
            {
                failed++;
                continue;
            }

            if (result.Success) spawned += count;
            else failed++;
        }

        if (spawned == 0)
        {
            return CommandResult.Fail("spawn_batch_failed");
        }

        ModLog.Info($"spawn_batch for @{user}: spawned={spawned}, failed={failed}");
        return CommandResult.Ok("spawn_batch", $"spawned={spawned},failed={failed}");
    }

    internal CommandResult SpawnValuableLocal(string valuableName, int count, string user)
    {
        if (!RunGate.IsReadyForGameEvents())
        {
            return CommandResult.Fail("game_not_ready");
        }

        // Random loot groups
        if (DropGroupCatalog.IsSimpleGroup(valuableName)
            || valuableName.StartsWith("group_", StringComparison.OrdinalIgnoreCase))
        {
            var picked = DropGroupCatalog.PickRandom(valuableName);
            if (string.IsNullOrEmpty(picked))
            {
                return CommandResult.Fail($"drop_group_empty:{valuableName}");
            }

            valuableName = picked!;
        }

        var spawned = 0;
        string? displayName = null;

        for (var i = 0; i < count; i++)
        {
            var pos = SpawnHelper.GetValuableSpawnPosition(i);
            if (!ValuableSpawnHelper.TrySpawn(valuableName, pos, Quaternion.identity, out var label))
            {
                continue;
            }

            displayName = label ?? valuableName;
            spawned++;
        }

        if (spawned == 0)
        {
            ModLog.Warn($"Valuable not found: {valuableName}");
            return CommandResult.Fail($"valuable_not_found:{valuableName}");
        }

        ModLog.Info($"spawn_valuable '{displayName}' x{spawned} for @{user}");
        GameNotifier.AnnounceSpawn(user, displayName ?? valuableName, spawned, "loot");
        return CommandResult.Ok($"spawned_valuable:{displayName}", $"count={spawned}");
    }

    public CommandResult ListItems()
    {
        var list = ItemRegistry.FormatList();
        ModLog.Info($"list_items\n{list}");
        return CommandResult.Ok("list_items", list);
    }

    public CommandResult ListEnemies()
    {
        var sb = new StringBuilder();
        sb.AppendLine("=== REPOLib AllEnemies ===");
        sb.Append(EnemyRegistry.FormatRepolibList());
        sb.AppendLine();
        sb.AppendLine("=== Resources paths (spawn-time load) ===");
        sb.AppendLine("Format: Enemies/Enemy - {name}");
        var list = sb.ToString();
        ModLog.Info($"list_enemies\n{list}");
        return CommandResult.Ok("list_enemies", list);
    }

    private static Item? FindItem(string name)
    {
        return ItemRegistry.Resolve(name);
    }

    private static IEnumerable<string> ExpandItemSearchTerms(string name)
    {
        yield return name;

        var lower = name.ToLowerInvariant();
        if (lower is "gun" or "handgun" or "pistol")
        {
            yield return "gun";
            yield return "handgun";
            yield return "pistol";
        }

        if (lower.Contains("health") || lower.Contains("medkit") || lower.Contains("med"))
        {
            yield return "medkit";
            yield return "health";
        }

        if (lower.Contains("shotgun")) yield return "shotgun";
        if (lower.Contains("grenade") || lower == "expl")
        {
            yield return "Item Grenade Explosive";
            yield return "Grenade Explosive";
            yield return "grenade";
        }
        if (lower.Contains("stun"))
        {
            yield return "Item Grenade Stun";
            yield return "Grenade Stun";
            yield return "stun";
        }
        if (lower.Contains("shock"))
        {
            yield return "Item Grenade Shockwave";
            yield return "Grenade Shockwave";
            yield return "shock";
        }
        if (lower.Contains("rubber") && lower.Contains("duck"))
        {
            yield return "Item Rubber Duck";
            yield return "Rubber Duck";
        }
        if (lower.Contains("flashlight")) yield return "flashlight";
        if (lower.Contains("bat")) yield return "bat";
    }
}
