using System;
using System.Collections.Generic;
using System.Globalization;

namespace TokControlREPOBridge.Commands;

/// <summary>Maps TokControl stream event IDs (spawn_duck, item_handgun, …) to spawn commands.</summary>
public static class RepoEventResolver
{
    private static readonly TextInfo TextInfo = CultureInfo.InvariantCulture.TextInfo;

    private static readonly HashSet<string> ItemSpawnSlugs = new(StringComparer.OrdinalIgnoreCase)
    {
        "gun", "handgun", "shotgun", "medkit", "flashlight", "grenade", "mine", "cart", "drone",
        "bat", "baseball_bat", "energy_drink", "health", "stun", "shock", "sword",
        "tranq", "revive", "crystal", "rubber_duck", "frying_pan", "sledge_hammer"
    };

    public static bool TryResolve(string eventId, out string spawnCmd, out string targetName)
    {
        spawnCmd = "";
        targetName = "";
        if (string.IsNullOrWhiteSpace(eventId))
        {
            return false;
        }

        eventId = eventId.Trim().ToLowerInvariant();

        if (eventId.StartsWith("spawn_", StringComparison.Ordinal))
        {
            var slug = eventId.Substring(6);
            if (ItemSpawnSlugs.Contains(slug))
            {
                spawnCmd = "spawn_item";
                targetName = ItemSearchFromSlug(slug);
            }
            else
            {
                spawnCmd = "spawn_ghost";
                targetName = RepoEventMap.ResolveEnemyInternalName(eventId);
            }

            return true;
        }

        if (eventId.StartsWith("item_", StringComparison.Ordinal))
        {
            spawnCmd = "spawn_item";
            targetName = ItemSearchFromSlug(eventId.Substring(5));
            return true;
        }

        if (eventId.StartsWith("loot_", StringComparison.Ordinal))
        {
            if (eventId.Contains("rand", StringComparison.OrdinalIgnoreCase))
            {
                spawnCmd = "spawn_valuable";
                targetName = DropGroupCatalog.GroupForLootEvent(eventId);
                return true;
            }

            spawnCmd = "spawn_valuable";
            targetName = LootSearchFromId(eventId);
            return true;
        }

        return false;
    }

    private static string ItemSearchFromSlug(string slug)
    {
        var eventKey = slug.Replace(' ', '_').Trim();
        if (!eventKey.StartsWith("item_", StringComparison.Ordinal))
        {
            eventKey = "item_" + eventKey;
        }

        if (RepoEventMap.TryGetItemInternalName(eventKey, out var mappedItem))
        {
            return mappedItem;
        }

        return TitleizeSlug(slug.Replace('_', ' '));
    }

    private static string LootSearchFromId(string eventId)
    {
        if (RepoEventMap.TryGetLootInternalName(eventId, out var valuableId))
        {
            return valuableId;
        }

        var slug = eventId.StartsWith("loot_", StringComparison.Ordinal)
            ? eventId.Substring(5)
            : eventId;

        return "Valuable_" + slug.Replace(' ', '_');
    }

    private static string TitleizeSlug(string slug)
    {
        var parts = slug.Split(new[] { '_', ' ' }, StringSplitOptions.RemoveEmptyEntries);
        for (var i = 0; i < parts.Length; i++)
        {
            if (parts[i].Length > 0)
            {
                parts[i] = TextInfo.ToTitleCase(parts[i]);
            }
        }

        return string.Join(" ", parts);
    }
}
