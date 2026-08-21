using System.Collections.Generic;
using HarmonyLib;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

/// <summary>
/// Keeps stream-spawned enemies visible: force SemiFunc.EnemySpawn success and block
/// immediate EnemyParent.Despawn (same activation pattern used by classic stream mods).
/// </summary>
internal static class EnemySpawnTracker
{
    private static readonly HashSet<Enemy> ForceSpawn = new();
    private static readonly HashSet<Enemy> BlockDespawn = new();

    public static void Track(Enemy? enemy)
    {
        if (enemy == null) return;
        ForceSpawn.Add(enemy);
        BlockDespawn.Add(enemy);
    }

    public static void Clear()
    {
        ForceSpawn.Clear();
        BlockDespawn.Clear();
    }

    public static bool TryConsumeForceSpawn(Enemy? enemy)
    {
        if (enemy == null) return false;
        if (!ForceSpawn.Contains(enemy)) return false;
        ForceSpawn.Remove(enemy);
        EnemyLifetimeGuard.Register(enemy);
        return true;
    }

    public static bool TryBlockDespawn(Enemy? enemy, out float spawnedTimeMax)
    {
        spawnedTimeMax = 0f;
        if (enemy == null) return false;
        if (!BlockDespawn.Contains(enemy)) return false;
        BlockDespawn.Remove(enemy);
        return true;
    }
}

[HarmonyPatch(typeof(SemiFunc), nameof(SemiFunc.EnemySpawn))]
internal static class SemiFuncEnemySpawnPatch
{
    [HarmonyPrefix]
    private static bool Prefix(ref bool __result, Enemy enemy)
    {
        if (!EnemySpawnTracker.TryConsumeForceSpawn(enemy))
        {
            return true;
        }

        __result = true;
        return false;
    }
}

[HarmonyPatch(typeof(EnemyParent), "Despawn")]
internal static class EnemyParentDespawnPatch
{
    [HarmonyPrefix]
    private static bool Prefix(Enemy ___Enemy, float ___SpawnedTimeMax, ref float ___SpawnedTimer)
    {
        if (!EnemySpawnTracker.TryBlockDespawn(___Enemy, out _))
        {
            return true;
        }

        // Complete spawn phase once, then allow normal combat/death.
        if (___SpawnedTimeMax > 0f)
        {
            ___SpawnedTimer = ___SpawnedTimeMax;
        }

        ModLog.Debug($"Blocked early despawn for '{((Object)___Enemy)?.name}'");
        return false;
    }
}
