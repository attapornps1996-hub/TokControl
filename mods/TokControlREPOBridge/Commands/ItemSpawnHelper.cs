using System;
using System.Collections.Generic;
using Photon.Pun;
using REPOLib.Modules;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal static class ItemSpawnHelper
{
    private const string ItemsPathPrefix = "Items/";

    public static GameObject? TrySpawn(string query, Vector3 pos, Quaternion rot, out string? spawnedLabel, int scatterIndex = 0, bool holdInPlace = false, bool skipGrenadeDormant = false)
    {
        spawnedLabel = null;
        if (string.IsNullOrWhiteSpace(query)) return null;

        if (RepoEventMap.TryGetItemInternalName(query, out var mappedItem) ||
            RepoEventMap.TryGetItemInternalName("item_" + query.Replace(' ', '_'), out mappedItem) ||
            RepoEventMap.TryGetActiveItem(query, out mappedItem))
        {
            query = mappedItem;
        }

        if (IsGunQuery(query))
        {
            var fromResources = TrySpawnFromGame(query, pos, rot, out spawnedLabel, scatterIndex, holdInPlace, skipGrenadeDormant);
            if (fromResources != null) return fromResources;
        }

        var item = ItemRegistry.Resolve(query);
        if (item != null && ItemMatchesQuery(item, query))
        {
            try
            {
                var go = Items.SpawnItem(item, pos, rot);
                if (go != null)
                {
                    spawnedLabel = item.itemName ?? query;
                    go.transform.position = pos;
                    ItemPostSpawnHelper.Initialize(go, spawnedLabel, scatterIndex, holdInPlace, skipGrenadeDormant);
                    ModLog.Info($"Spawned item via REPOLib: {spawnedLabel}");
                    return go;
                }
            }
            catch (Exception ex)
            {
                ModLog.Warn($"REPOLib SpawnItem failed for '{query}': {ex.Message}");
            }
        }

        return TrySpawnFromGame(query, pos, rot, out spawnedLabel, scatterIndex, holdInPlace, skipGrenadeDormant);
    }

    private static GameObject? TrySpawnFromGame(string query, Vector3 pos, Quaternion rot, out string? spawnedLabel, int scatterIndex = 0, bool holdInPlace = false, bool skipGrenadeDormant = false)
    {
        spawnedLabel = null;

        foreach (var path in GetResourcePaths(query))
        {
            var prefab = Resources.Load<GameObject>(path);
            if (prefab == null) continue;

            try
            {
                var instance = InstantiateItem(path, prefab, pos, rot);
                if (instance == null) continue;

                instance.transform.position = pos;
                spawnedLabel = prefab.name;
                ItemPostSpawnHelper.Initialize(instance, prefab.name, scatterIndex, holdInPlace, skipGrenadeDormant);
                ModLog.Info($"Spawned item via game resources: {path}");
                return instance;
            }
            catch (Exception ex)
            {
                ModLog.Warn($"Item instantiate failed for {path}: {ex.Message}");
            }
        }

        return null;
    }

    private static GameObject? InstantiateItem(string resourcePath, GameObject prefab, Vector3 pos, Quaternion rot)
    {
        var usePhoton = SemiFunc.IsMultiplayer() &&
                        PhotonNetwork.IsConnected &&
                        SemiFunc.IsMasterClientOrSingleplayer() &&
                        !SemiFunc.MenuLevel();

        if (usePhoton)
        {
            return PhotonNetwork.InstantiateRoomObject(resourcePath, pos, rot);
        }

        return UnityEngine.Object.Instantiate(prefab, pos, rot);
    }

    private static bool IsGunQuery(string query)
    {
        var normalized = query.Replace('_', ' ');
        return normalized.IndexOf("Gun", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    private static bool ItemMatchesQuery(Item item, string query)
    {
        var itemName = (item.itemName ?? "").Replace('_', ' ');
        foreach (var term in ItemRegistry.GetSearchTerms(query))
        {
            var target = term.Replace('_', ' ');
            if (string.Equals(itemName, target, StringComparison.OrdinalIgnoreCase)) return true;
            if (string.Equals(itemName, "Item " + target, StringComparison.OrdinalIgnoreCase)) return true;
        }

        return false;
    }

    private static IEnumerable<string> GetResourcePaths(string query)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var term in ItemRegistry.GetSearchTerms(query))
        {
            foreach (var path in BuildPaths(term))
            {
                if (seen.Add(path))
                {
                    yield return path;
                }
            }
        }
    }

    private static IEnumerable<string> BuildPaths(string term)
    {
        yield return ItemsPathPrefix + term;

        if (!term.StartsWith("Item ", StringComparison.OrdinalIgnoreCase))
        {
            yield return ItemsPathPrefix + "Item " + term;
        }

        if (term.StartsWith("Item ", StringComparison.OrdinalIgnoreCase))
        {
            yield return ItemsPathPrefix + term.Substring(5);
        }
    }
}

