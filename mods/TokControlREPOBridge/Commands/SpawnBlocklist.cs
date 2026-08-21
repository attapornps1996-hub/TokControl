using System;
using System.Collections.Generic;

namespace TokControlREPOBridge.Commands;

/// <summary>Temporary blocklist for unstable enemy spawns (Gnome / Bang).</summary>
internal static class SpawnBlocklist
{
    private static readonly HashSet<string> BlockedEventIds = new(StringComparer.OrdinalIgnoreCase)
    {
        "spawn_gnome",
        "spawn_bang",
        "spawn_banger"
    };

    private static readonly HashSet<string> BlockedEnemySlugs = new(StringComparer.OrdinalIgnoreCase)
    {
        "gnome",
        "bang",
        "banger"
    };

    public static bool IsBlockedEventId(string? eventId)
    {
        if (string.IsNullOrWhiteSpace(eventId)) return false;

        var key = eventId.Trim().ToLowerInvariant();
        if (BlockedEventIds.Contains(key)) return true;

        if (key.StartsWith("spawn_", StringComparison.Ordinal))
        {
            return BlockedEnemySlugs.Contains(key.Substring(6));
        }

        return false;
    }

    public static bool IsBlockedEnemy(string? enemyName)
    {
        if (string.IsNullOrWhiteSpace(enemyName)) return false;

        if (IsBlockedEventId(enemyName)) return true;

        var resolved = EnemyRegistry.ResolveInternalName(enemyName);
        foreach (var name in new[] { enemyName, resolved })
        {
            if (string.IsNullOrWhiteSpace(name)) continue;

            var slug = name.Trim().ToLowerInvariant().Replace(' ', '_');
            if (BlockedEnemySlugs.Contains(slug)) return true;
        }

        return false;
    }
}
