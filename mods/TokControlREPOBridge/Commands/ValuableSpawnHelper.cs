using System;
using System.Collections.Generic;
using System.Linq;
using REPOLib.Modules;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal static class ValuableSpawnHelper
{
    private static readonly Dictionary<string, string> DisplayToInternal =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["Diamond"] = "Valuable_Wizard_Diamond",
            ["Emerald Bracelet"] = "Valuable_Wizard_Emerald_Bracelet",
            ["Goblet"] = "Valuable_Manor_Goblet",
            ["Ocarina"] = "Valuable_Manor_Ocarina",
            ["Pocket Watch"] = "Valuable_Manor_Pocket_Watch",
            ["Uranium Mug"] = "Valuable_Museum_Uranium_Mug",
            ["Arctic Bonsai"] = "Valuable_Arctic_Bonsai",
            ["Arctic HDD"] = "Valuable_Arctic_HDD",
            ["Chomp Book"] = "Valuable_Manor_Chomp_Book",
            ["Crown"] = "Valuable_Manor_Crown",
            ["Doll"] = "Valuable_Manor_Scream_Doll",
            ["Frog"] = "Valuable_Manor_Frog",
            ["Gem Box"] = "Valuable_Manor_Gem_Box",
            ["Globe"] = "Valuable_Manor_Globe",
            ["Love Potion"] = "Valuable_Wizard_Love_Potion",
            ["Money"] = "Valuable_Manor_Money",
            ["Music Box"] = "Valuable_Manor_Music_Box",
            ["Toy Monkey"] = "Valuable_Manor_Toy_Monkey",
            ["Toy Car"] = "Valuable_Car",
            ["Valuable Car"] = "Valuable_Car",
            ["Toy Plane"] = "Valuable_Plane",
            ["Uranium Plate"] = "Valuable_Museum_Uranium_Plate",
            ["Vase Small"] = "Valuable_Manor_Vase_Small",
            ["Arctic 3D Printer"] = "Valuable_Arctic_3D_Printer",
            ["Arctic Laptop"] = "Valuable_Arctic_Laptop",
            ["Arctic Propane Tank"] = "Valuable_Arctic_Propane_Tank",
            ["Arctic Sample"] = "Valuable_Arctic_Sample",
            ["Arctic Sample Six Pack"] = "Valuable_Arctic_Sample_Six_Pack",
            ["Bottle"] = "Valuable_Manor_Bottle",
            ["Clown"] = "Valuable_Manor_Clown",
            ["Computer"] = "Valuable_Manor_Computer",
            ["Fan"] = "Valuable_Arctic_Fan",
            ["Gramophone"] = "Valuable_Manor_Gramophone",
            ["Marble Table"] = "Valuable_Manor_Marble_Table",
            ["Radio"] = "Valuable_Manor_Radio",
            ["Ship in a bottle"] = "Valuable_Manor_Ship_in_a_Bottle",
            ["Trophy"] = "Valuable_Manor_Trophy",
            ["Vase"] = "Valuable_Manor_Vase",
            ["Wizard Goblin Head"] = "Valuable_Wizard_Goblin_Head",
            ["Wizard Power Crystal"] = "Valuable_Wizard_Power_Crystal",
            ["Wizard Time Glass"] = "Valuable_Wizard_Time_Glass",
            ["Arctic Barrel"] = "Valuable_Arctic_Barrel",
            ["Arctic Big Sample"] = "Valuable_Arctic_Big_Sample",
            ["Arctic Creature Leg"] = "Valuable_Arctic_Creature_Leg",
            ["Arctic Flamethrower"] = "Valuable_Arctic_Flamethrower",
            ["Arctic Guitar"] = "Valuable_Arctic_Guitar",
            ["Arctic Sample Cooler"] = "Valuable_Arctic_Sample_Cooler",
            ["Diamond Display"] = "Valuable_Manor_Diamond_Display",
            ["Ice Saw"] = "Valuable_Arctic_Ice_Saw",
            ["Scream Doll"] = "Valuable_Manor_Scream_Doll",
            ["Television"] = "Valuable_Manor_Television",
            ["Vase Big"] = "Valuable_Manor_Vase_Big",
            ["Wizard Cube of Knowledge"] = "Valuable_Wizard_Cube_of_Knowledge",
            ["Wizard Master Potion"] = "Valuable_Wizard_Master_Potion",
            ["Animal Crate"] = "Valuable_Manor_Animal_Crate",
            ["Arctic Ice Block"] = "Valuable_Arctic_Ice_Block",
            ["Dinosaur"] = "Valuable_Manor_Dinosaur",
            ["Piano"] = "Valuable_Manor_Piano",
            ["Wizard Griffin Statue"] = "Valuable_Wizard_Griffin_Statue",
            ["Arctic Science Station"] = "Valuable_Arctic_Science_Station",
            ["Harp"] = "Valuable_Manor_Harp",
            ["Painting"] = "Valuable_Manor_Painting",
            ["Wizard Dumgolfs Staff"] = "Valuable_Wizard_Dumgolfs_Staff",
            ["Wizard Sword"] = "Valuable_Wizard_Sword",
            ["Arctic Server Rack"] = "Valuable_Arctic_Server_Rack",
            ["Golden Statue"] = "Valuable_Manor_Golden_Statue",
            ["Grandfather Clock"] = "Valuable_Manor_Grandfather_Clock",
            ["Wizard Broom"] = "Valuable_Wizard_Broom",
            ["Gold"] = "Valuable_Manor_Money",
            ["Silver"] = "Valuable_Manor_Money",
            ["Ruby"] = "Valuable_Wizard_Power_Crystal",
            ["Uranium Mug Deluxe"] = "Valuable_Museum_Uranium_Mug_Deluxe",
            ["Baby Head"] = "Valuable_Museum_Baby_Head",
            ["Gem Burger"] = "Valuable_Museum_Gem_Burger",
            ["Gumball"] = "Valuable_Museum_Gumball",
            ["Boombox"] = "Valuable_Museum_Boombox",
            ["Milk"] = "Valuable_Museum_Milk",
            ["Golden Swirl"] = "Valuable_Museum_Golden_Swirl",
            ["Blender"] = "Valuable_Museum_Blender",
            ["Horse"] = "Valuable_Museum_Horse",
            ["Traffic Light"] = "Valuable_Museum_Traffic_Light",
            ["Star Wand"] = "Valuable_Wizard_Star_Wand",
            ["Levitation Potion"] = "Valuable_Wizard_Levitation_Potion",
            ["Jackhammer"] = "Valuable_Arctic_Jackhammer",
            ["Coffin"] = "Valuable_Manor_Coffin",
            ["Tray"] = "Valuable_Museum_Tray",
            ["Dragon Skull"] = "Valuable_Wizard_Dragon_Skull"
        };

    public static bool TrySpawn(string query, Vector3 pos, Quaternion rot, out string? spawnedLabel)
    {
        return TrySpawn(query, pos, rot, out spawnedLabel, out _);
    }

    public static bool TrySpawn(string query, Vector3 pos, Quaternion rot, out string? spawnedLabel, out GameObject? spawnedObject)
    {
        spawnedLabel = null;
        spawnedObject = null;
        if (string.IsNullOrWhiteSpace(query)) return false;

        var internalName = ResolveInternalName(query);
        foreach (var candidate in ExpandSearchTerms(internalName))
        {
            if (TrySpawnViaRepolib(candidate, pos, rot, out spawnedLabel, out spawnedObject))
            {
                return true;
            }

            if (TrySpawnViaResources(candidate, pos, rot, out spawnedLabel, out spawnedObject))
            {
                return true;
            }
        }

        return false;
    }

    public static string ResolveInternalName(string query)
    {
        if (RepoEventMap.TryGetLootInternalName(query, out var lootId))
        {
            return lootId;
        }

        if (DisplayToInternal.TryGetValue(query.Trim(), out var mapped))
        {
            return mapped;
        }

        if (query.StartsWith("Valuable_", StringComparison.OrdinalIgnoreCase))
        {
            return query;
        }

        var slug = query.Trim().Replace(' ', '_');
        return "Valuable_" + slug;
    }

    private static IEnumerable<string> ExpandSearchTerms(string internalName)
    {
        yield return internalName;
        yield return internalName.Replace('_', ' ');

        if (internalName.StartsWith("Valuable_", StringComparison.Ordinal))
        {
            yield return "Valuable " + internalName.Substring(9).Replace('_', ' ');
        }
    }

    private static bool TrySpawnViaRepolib(string candidate, Vector3 pos, Quaternion rot, out string? label, out GameObject? spawnedObject)
    {
        label = candidate;
        spawnedObject = null;
        try
        {
            var valuable = Valuables.AllValuables?.FirstOrDefault(v =>
                v != null && (
                    string.Equals(v.PrefabName, candidate, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(v.PrefabName, candidate.Replace('_', ' '), StringComparison.OrdinalIgnoreCase) ||
                    (v.PrefabName ?? "").IndexOf(candidate, StringComparison.OrdinalIgnoreCase) >= 0));

            if (valuable == null || !valuable.IsValid()) return false;

            spawnedObject = Valuables.SpawnValuable(valuable, pos, rot);
            label = valuable.PrefabName ?? candidate;
            ModLog.Info($"Spawned valuable via REPOLib: {label}");
            return spawnedObject != null;
        }
        catch (Exception ex)
        {
            ModLog.Warn($"REPOLib valuable spawn failed for '{candidate}': {ex.Message}");
            return false;
        }
    }

    private static bool TrySpawnViaResources(string candidate, Vector3 pos, Quaternion rot, out string? label, out GameObject? spawnedObject)
    {
        label = candidate;
        spawnedObject = null;
        foreach (var path in GetResourcePaths(candidate))
        {
            var prefab = Resources.Load<GameObject>(path);
            if (prefab == null) continue;

            try
            {
                var instance = UnityEngine.Object.Instantiate(prefab, pos, rot);
                if (instance == null) continue;

                spawnedObject = instance;
                label = prefab.name;
                ModLog.Info($"Spawned valuable via Resources: {path}");
                return true;
            }
            catch (Exception ex)
            {
                ModLog.Warn($"Resources valuable instantiate failed for {path}: {ex.Message}");
            }
        }

        return false;
    }

    private static IEnumerable<string> GetResourcePaths(string term)
    {
        yield return "Valuables/" + term;
        yield return "Valuables/Valuable - " + term.Replace("Valuable_", "").Replace('_', ' ');

        if (term.StartsWith("Valuable_", StringComparison.Ordinal))
        {
            yield return "Valuables/" + term.Substring(9);
        }
    }
}

