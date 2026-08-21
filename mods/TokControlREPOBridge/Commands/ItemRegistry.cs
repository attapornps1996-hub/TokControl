using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using REPOLib.Modules;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal static class ItemRegistry
{
    private static readonly Dictionary<string, Item> ByKey = new(StringComparer.OrdinalIgnoreCase);
    private static bool _loaded;

    public static void EnsureLoaded()
    {
        if (_loaded) return;
        _loaded = true;

        try
        {
            foreach (var item in Items.AllItems)
            {
                if (item == null || string.IsNullOrWhiteSpace(item.itemName)) continue;
                Register(item.itemName, item);
            }

            ModLog.Info($"ItemRegistry loaded {ByKey.Count} keys from {Items.AllItems?.Count() ?? 0} items");
        }
        catch (Exception ex)
        {
            ModLog.Error($"ItemRegistry load failed: {ex.Message}");
        }
    }

    private static void Register(string name, Item item)
    {
        if (string.IsNullOrWhiteSpace(name)) return;

        foreach (var term in ExpandTerms(name))
        {
            if (!ByKey.ContainsKey(term))
            {
                ByKey[term] = item;
            }
        }
    }

    public static IEnumerable<string> GetSearchTerms(string query)
    {
        if (RepoEventMap.TryGetItemInternalName(query, out var mappedItem))
        {
            foreach (var term in ExpandTerms(mappedItem))
            {
                yield return term;
            }
        }

        foreach (var term in ExpandTerms(query))
        {
            yield return term;
        }
    }

    public static Item? Resolve(string query)
    {
        EnsureLoaded();
        if (string.IsNullOrWhiteSpace(query)) return null;

        if (RepoEventMap.TryGetItemInternalName(query, out var mappedItem))
        {
            query = mappedItem;
        }
        else if (!query.StartsWith("item_", StringComparison.OrdinalIgnoreCase) &&
                 RepoEventMap.TryGetItemInternalName("item_" + query.Replace(' ', '_'), out mappedItem))
        {
            query = mappedItem;
        }

        foreach (var term in ExpandTerms(query))
        {
            if (ByKey.TryGetValue(term, out var exact) && ItemMatchesTerm(exact, term))
            {
                return exact;
            }
        }

        Item? best = null;
        var bestScore = int.MaxValue;
        foreach (var term in ExpandTerms(query))
        {
            if (term.Length < 4) continue;

            foreach (var item in Items.AllItems)
            {
                if (item == null) continue;
                var score = ScoreMatch(item.itemName ?? "", term);
                if (score >= 0 && score < bestScore)
                {
                    bestScore = score;
                    best = item;
                }
            }
        }

        return bestScore <= 20 ? best : null;
    }

    public static IEnumerable<string> GetAllItemNames()
    {
        EnsureLoaded();
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in Items.AllItems)
        {
            if (item?.itemName != null) names.Add(item.itemName);
        }

        foreach (var prefab in Resources.LoadAll<GameObject>("Items"))
        {
            if (prefab != null) names.Add(prefab.name);
        }

        return names.OrderBy(n => n, StringComparer.OrdinalIgnoreCase);
    }

    public static string FormatList() =>
        string.Join(Environment.NewLine, GetAllItemNames());

    private static bool ItemMatchesTerm(Item item, string term)
    {
        var itemName = Normalize(item.itemName ?? "");
        var target = Normalize(term);
        return string.Equals(itemName, target, StringComparison.OrdinalIgnoreCase);
    }

    private static IEnumerable<string> ExpandTerms(string query)
    {
        yield return query;
        yield return query.Replace("_", " ");

        if (query.StartsWith("Item_", StringComparison.OrdinalIgnoreCase))
        {
            yield return "Item " + query.Substring(5).Replace("_", " ");
            yield return query.Substring(5).Replace("_", " ");
        }
        else if (query.StartsWith("Item ", StringComparison.OrdinalIgnoreCase))
        {
            yield return query.Substring(5);
            yield return "Item_" + query.Substring(5).Replace(" ", "_");
        }
        else if (query.StartsWith("Valuable_", StringComparison.OrdinalIgnoreCase))
        {
            yield return query.Substring(9).Replace("_", " ");
        }
        else
        {
            yield return "Item " + query;
            yield return "Item_" + query.Replace(" ", "_");
        }
    }

    private static int ScoreMatch(string itemName, string term)
    {
        var a = Normalize(itemName);
        var b = Normalize(term);

        if (string.Equals(a, b, StringComparison.OrdinalIgnoreCase)) return 0;

        // Never fuzzy-cross grenade / duck / mine families — wrong item bugs.
        if (IsThrowableFamily(a) || IsThrowableFamily(b))
        {
            return -1;
        }

        if (a.Contains("gun", StringComparison.OrdinalIgnoreCase) &&
            b.Contains("gun", StringComparison.OrdinalIgnoreCase))
        {
            if (!string.Equals(a, b, StringComparison.OrdinalIgnoreCase)) return -1;
        }

        if (a.EndsWith(b, StringComparison.OrdinalIgnoreCase)) return 5 + a.Length;
        return -1;
    }

    private static bool IsThrowableFamily(string name)
    {
        var n = name.ToLowerInvariant();
        return n.Contains("grenade") || n.Contains("mine") || n.Contains("duck")
               || n.Contains("nade") || n.Contains("duct");
    }

    private static string Normalize(string value)
    {
        value = value.Trim().Replace('_', ' ');
        if (value.StartsWith("Item ", StringComparison.OrdinalIgnoreCase))
        {
            value = value.Substring(5);
        }

        return value;
    }
}

