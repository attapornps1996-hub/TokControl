using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

/// <summary>
/// Drop catalogs from drop_simple_groups.data (pick one) and drop_groups.data (pick variant → many items).
/// </summary>
internal static class DropGroupCatalog
{
    private static Dictionary<string, string[]>? _simpleGroups;
    private static Dictionary<string, List<string[]>>? _variantGroups;
    private static bool _loaded;

    public static void EnsureLoaded()
    {
        if (_loaded) return;
        _loaded = true;
        _simpleGroups = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
        _variantGroups = new Dictionary<string, List<string[]>>(StringComparer.OrdinalIgnoreCase);

        try
        {
            var simplePath = ResolveDataPath("drop_simple_groups.data");
            if (simplePath != null && File.Exists(simplePath))
            {
                ParseSimpleGroups(File.ReadAllText(simplePath));
                ModLog.Info($"Loaded {_simpleGroups.Count} simple drop groups from {simplePath}");
            }
            else
            {
                ModLog.Warn("drop_simple_groups.data not found — seeding fallbacks");
                SeedFallbackGroups();
            }
        }
        catch (Exception ex)
        {
            ModLog.Warn($"Simple drop load failed: {ex.Message}");
            SeedFallbackGroups();
        }

        try
        {
            var variantPath = ResolveDataPath("drop_groups.data");
            if (variantPath != null && File.Exists(variantPath))
            {
                ParseVariantGroups(File.ReadAllText(variantPath));
                ModLog.Info($"Loaded {_variantGroups.Count} variant drop groups from {variantPath}");
            }
        }
        catch (Exception ex)
        {
            ModLog.Warn($"Variant drop load failed: {ex.Message}");
        }
    }

    public static bool IsSimpleGroup(string name)
    {
        EnsureLoaded();
        return !string.IsNullOrWhiteSpace(name) && _simpleGroups!.ContainsKey(name.Trim());
    }

    public static string? PickRandom(string groupName)
    {
        EnsureLoaded();
        if (string.IsNullOrWhiteSpace(groupName)) return null;
        if (!_simpleGroups!.TryGetValue(groupName.Trim(), out var list) || list == null || list.Length == 0)
        {
            return null;
        }

        return ParseItemPath(list[UnityEngine.Random.Range(0, list.Length)]);
    }

    /// <summary>Pick one drop_variants entry and return all item ids in that variant.</summary>
    public static string[] PickRandomVariantItems(string groupName)
    {
        EnsureLoaded();
        if (string.IsNullOrWhiteSpace(groupName)) return Array.Empty<string>();
        if (!_variantGroups!.TryGetValue(groupName.Trim(), out var variants) || variants == null || variants.Count == 0)
        {
            return Array.Empty<string>();
        }

        var pick = variants[UnityEngine.Random.Range(0, variants.Count)];
        var result = new List<string>();
        foreach (var raw in pick)
        {
            var id = ParseItemPath(raw);
            if (!string.IsNullOrEmpty(id)) result.Add(id);
        }

        return result.ToArray();
    }

    public static string GroupForLootEvent(string eventId)
    {
        var id = (eventId ?? "").Trim().ToLowerInvariant();
        if (id.Contains("huge")) return "group_loot_rand_huge";
        if (id.Contains("enemy")) return "group_loot_rand_enemy";
        if (id.Contains("big")) return "group_loot_rand_big";
        if (id.Contains("med") || id.Contains("medium")) return "group_loot_rand_med";
        return "group_loot_rand_small";
    }

    /// <summary>Valuables/03_Medium/Valuable_Radio → Valuable_Radio</summary>
    public static string ParseItemPath(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "";
        var s = raw.Trim().Replace('\\', '/');
        var slash = s.LastIndexOf('/');
        if (slash >= 0 && slash < s.Length - 1) s = s.Substring(slash + 1);
        return s.Trim();
    }

    private static string? ResolveDataPath(string fileName)
    {
        try
        {
            var asm = Assembly.GetExecutingAssembly().Location;
            if (!string.IsNullOrEmpty(asm))
            {
                var dir = Path.GetDirectoryName(asm);
                if (!string.IsNullOrEmpty(dir))
                {
                    var beside = Path.Combine(dir, fileName);
                    if (File.Exists(beside)) return beside;
                    var data = Path.Combine(dir, "Data", fileName);
                    if (File.Exists(data)) return data;
                }
            }
        }
        catch { /* ignore */ }

        try
        {
            var pluginRoot = Path.Combine(PathsSafe(), "TokControlREPOBridge", "Data", fileName);
            if (File.Exists(pluginRoot)) return pluginRoot;
        }
        catch { /* ignore */ }

        return null;
    }

    private static string PathsSafe()
    {
        try { return BepInEx.Paths.PluginPath; }
        catch { return "."; }
    }

    private static void ParseSimpleGroups(string json)
    {
        var i = 0;
        while (i < json.Length)
        {
            var keyStart = json.IndexOf('"', i);
            if (keyStart < 0) break;
            var keyEnd = json.IndexOf('"', keyStart + 1);
            if (keyEnd < 0) break;
            var key = json.Substring(keyStart + 1, keyEnd - keyStart - 1);
            var arrStart = json.IndexOf('[', keyEnd);
            if (arrStart < 0) break;
            var arrEnd = json.IndexOf(']', arrStart);
            if (arrEnd < 0) break;

            if (key.StartsWith("group_", StringComparison.OrdinalIgnoreCase)
                && !json.Substring(keyEnd, Math.Min(40, arrStart - keyEnd)).Contains("drop_variants"))
            {
                // Only top-level simple arrays (not nested inside drop_variants)
                var between = json.Substring(keyEnd + 1, arrStart - keyEnd - 1).Trim();
                if (between.StartsWith(":"))
                {
                    var arrBody = json.Substring(arrStart + 1, arrEnd - arrStart - 1);
                    var items = ExtractQuotedStrings(arrBody);
                    if (items.Count > 0) _simpleGroups![key] = items.ToArray();
                }
            }

            i = arrEnd + 1;
        }
    }

    private static void ParseVariantGroups(string json)
    {
        // "group_name": { "drop_variants": [ { "items": [ "A", "B" ] }, ... ] }
        foreach (Match groupMatch in Regex.Matches(json,
                     "\"(group_[^\"]+)\"\\s*:\\s*\\{\\s*\"drop_variants\"\\s*:\\s*\\[(.*?)\\]\\s*\\}",
                     RegexOptions.Singleline | RegexOptions.IgnoreCase))
        {
            var groupName = groupMatch.Groups[1].Value;
            var variantsBody = groupMatch.Groups[2].Value;
            var variants = new List<string[]>();

            foreach (Match itemsMatch in Regex.Matches(variantsBody, "\"items\"\\s*:\\s*\\[(.*?)\\]",
                         RegexOptions.Singleline | RegexOptions.IgnoreCase))
            {
                var items = ExtractQuotedStrings(itemsMatch.Groups[1].Value);
                if (items.Count > 0) variants.Add(items.ToArray());
            }

            if (variants.Count > 0) _variantGroups![groupName] = variants;
        }
    }

    private static List<string> ExtractQuotedStrings(string body)
    {
        var items = new List<string>();
        var p = 0;
        while (p < body.Length)
        {
            var s = body.IndexOf('"', p);
            if (s < 0) break;
            var e = body.IndexOf('"', s + 1);
            if (e < 0) break;
            var item = body.Substring(s + 1, e - s - 1).Trim();
            if (item.Length > 0 && !item.Equals("items", StringComparison.OrdinalIgnoreCase)
                && !item.Equals("drop_variants", StringComparison.OrdinalIgnoreCase))
            {
                items.Add(item);
            }

            p = e + 1;
        }

        return items;
    }

    private static void SeedFallbackGroups()
    {
        _simpleGroups!["group_loot_rand_small"] = new[]
        {
            "Valuable_Wizard_Diamond", "Valuable_Manor_Goblet", "Valuable_Arctic_Eraser"
        };
        _simpleGroups["group_loot_rand_med"] = new[]
        {
            "Valuable_Manor_Radio", "Valuable_Manor_Trophy", "Valuable_Wizard_Crystal"
        };
        _simpleGroups["group_loot_rand_big"] = new[]
        {
            "Valuable_Manor_Vase_Big", "Valuable_Wizard_Master_Potion"
        };
        _simpleGroups["group_loot_rand_huge"] = new[]
        {
            "Valuable_Arctic_Cryo_Pod", "Valuable_Wizard_Alchemy_Station"
        };
        _simpleGroups["group_loot_rand_enemy"] = new[]
        {
            "Enemy_Valuable_-_Small", "Enemy_Valuable_-_Medium", "Enemy_Valuable_-_Big"
        };
        _simpleGroups["group_item_rand_nades"] = new[]
        {
            "Item_Grenade_Stun", "Item_Grenade_Shockwave", "Item_Grenade_Explosive"
        };
    }
}
