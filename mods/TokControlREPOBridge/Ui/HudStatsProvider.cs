using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text;
using TokControlREPOBridge.Commands;
using UnityEngine;

namespace TokControlREPOBridge.Ui;

internal static class HudStatsProvider
{
    private const float MapInterval = 0.5f;
    private const float CartInterval = 0.55f;
    private const float CosmeticInterval = 1.35f;
    private const float EnemyInterval = 0.6f;

    private static readonly Dictionary<string, string> RarityColors = new(StringComparer.OrdinalIgnoreCase)
    {
        ["common"] = "#55FF55",
        ["uncommon"] = "#5599FF",
        ["rare"] = "#BB55FF",
        ["ultrarare"] = "#FF8800",
        ["ultra"] = "#FF8800",
        ["ultra rare"] = "#FF8800"
    };

    private static readonly string[] RarityOrder = { "common", "uncommon", "rare", "ultrarare" };

    private static float _cachedMap;
    private static float _cachedCart;
    private static int _cachedEnemies;
    private static string _cachedCosmetics = string.Empty;
    private static bool _hasCosmetics;

    private static float _mapNext;
    private static float _cartNext;
    private static float _cosmeticNext;
    private static float _enemyNext;

    internal static void InvalidateCache()
    {
        _mapNext = 0f;
        _cartNext = 0f;
        _cosmeticNext = 0f;
        _enemyNext = 0f;
    }

    internal static void TickCache()
    {
        var now = Time.unscaledTime;
        if (now >= _mapNext)
        {
            _cachedMap = ScanMapValue();
            _mapNext = now + MapInterval;
        }

        if (now >= _cartNext)
        {
            _cachedCart = ScanCartValue();
            _cartNext = now + CartInterval;
        }

        if (now >= _cosmeticNext)
        {
            _hasCosmetics = ScanCosmeticIconLine(out _cachedCosmetics);
            _cosmeticNext = now + CosmeticInterval;
        }

        if (now >= _enemyNext)
        {
            _cachedEnemies = EnemyRoomCounter.ScanLiveCountInCurrentRooms();
            _enemyNext = now + EnemyInterval;
        }
    }

    internal static float GetMapValue() => _cachedMap;

    internal static float GetCartValue() => _cachedCart;

    internal static int GetEnemyCount() => _cachedEnemies;

    internal static bool TryBuildCosmeticIconLine(out string line)
    {
        line = _cachedCosmetics;
        return _hasCosmetics;
    }

    private static float ScanMapValue()
    {
        var total = 0f;
        var cartItems = GetCartPhysObjects();

        foreach (var valuable in UnityEngine.Object.FindObjectsOfType<ValuableObject>())
        {
            if (valuable == null || !valuable.isActiveAndEnabled) continue;

            var phys = valuable.GetComponent<PhysGrabObject>();
            if (phys != null && cartItems.Contains(phys)) continue;

            total += Mathf.Max(0f, valuable.dollarValueCurrent);
        }

        return total;
    }

    private static float ScanCartValue()
    {
        var total = 0f;

        foreach (var cart in CartHelper.GetAllCarts())
        {
            foreach (var item in CartHelper.GetCartItemObjects(cart))
            {
                if (item == null) continue;
                var valuable = item.GetComponent<ValuableObject>();
                if (valuable != null)
                {
                    total += Mathf.Max(0f, valuable.dollarValueCurrent);
                }
            }
        }

        return total;
    }

    private static bool ScanCosmeticIconLine(out string line)
    {
        var present = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var box in UnityEngine.Object.FindObjectsOfType<CosmeticWorldObject>())
        {
            if (box == null || !box.isActiveAndEnabled) continue;
            if (IsCosmeticBoxExtracted(box)) continue;
            if (!HudRoomHelper.IsInCurrentRoom(box.transform.position)) continue;

            var rarity = NormalizeRarity(ReadCosmeticRarity(box));
            if (string.IsNullOrWhiteSpace(rarity)) continue;
            present.Add(rarity);
        }

        if (present.Count == 0)
        {
            line = string.Empty;
            return false;
        }

        var sb = new StringBuilder();
        foreach (var rarity in RarityOrder)
        {
            if (!present.Contains(rarity)) continue;
            var color = RarityColors.TryGetValue(rarity, out var hex) ? hex : "#DDDDDD";
            if (sb.Length > 0) sb.Append(' ');
            sb.Append($"<color={color}>■</color>");
        }

        line = sb.ToString();
        return line.Length > 0;
    }

    private static bool IsCosmeticBoxExtracted(CosmeticWorldObject box)
    {
        try
        {
            var health = box.GetComponent<CosmeticWorldObjectHealth>();
            if (health != null)
            {
                var healthField = typeof(CosmeticWorldObjectHealth).GetField("health",
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (healthField != null)
                {
                    var value = healthField.GetValue(health);
                    if (value is float f && f <= 0f) return true;
                    if (value is int i && i <= 0) return true;
                }
            }
        }
        catch
        {
            // ignore
        }

        var name = box.gameObject.name.ToLowerInvariant();
        return name.Contains("extract") || name.Contains("broken") || name.Contains("opened");
    }

    private static string ReadCosmeticRarity(CosmeticWorldObject box)
    {
        try
        {
            var field = typeof(CosmeticWorldObject).GetField("cosmeticRarity",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field != null)
            {
                var value = field.GetValue(box);
                if (value != null) return value.ToString() ?? string.Empty;
            }
        }
        catch
        {
            // ignore
        }

        return GuessRarityFromName(box.gameObject.name);
    }

    private static string NormalizeRarity(string rarity)
    {
        var normalized = rarity.Replace("_", " ").Trim().ToLowerInvariant();
        if (normalized.Contains("ultra")) return "ultrarare";
        if (normalized.Contains("uncommon")) return "uncommon";
        if (normalized.Contains("common")) return "common";
        if (normalized.Contains("rare")) return "rare";
        return normalized;
    }

    private static string GuessRarityFromName(string name)
    {
        var lower = name.ToLowerInvariant();
        if (lower.Contains("ultra")) return "ultrarare";
        if (lower.Contains("uncommon")) return "uncommon";
        if (lower.Contains("rare")) return "rare";
        if (lower.Contains("common")) return "common";
        return string.Empty;
    }

    private static HashSet<PhysGrabObject> GetCartPhysObjects()
    {
        var set = new HashSet<PhysGrabObject>();
        foreach (var cart in CartHelper.GetAllCarts())
        {
            foreach (var item in CartHelper.GetCartItemObjects(cart))
            {
                if (item != null) set.Add(item);
            }
        }

        return set;
    }
}
