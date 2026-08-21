using System;
using System.Collections.Generic;
using System.Reflection;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

/// <summary>
/// Brief spawn protection for stream-spawned enemies, then release them to normal combat/death.
/// Previously SpawnedTimer was refreshed forever, which kept enemies in spawn state and unkillable.
/// </summary>
internal static class EnemyLifetimeGuard
{
    private sealed class Entry
    {
        public EnemyParent? Parent;
        public float RegisteredAt;
        public bool SpawnFinalized;
    }

    private static readonly List<Entry> Tracked = new();
    private static float _checkInSec;

    private const float SpawnProtectSeconds = 3f;
    private const float TrackMaxSeconds = 10f;

    public static void Register(Enemy? enemy)
    {
        if (enemy == null) return;
        try
        {
            var parent = ((Component)enemy).GetComponentInParent<EnemyParent>();
            if (parent == null) return;

            foreach (var entry in Tracked)
            {
                if (entry.Parent == parent) return;
            }

            Tracked.Add(new Entry
            {
                Parent = parent,
                RegisteredAt = Time.time,
                SpawnFinalized = false
            });

            PreventInstantDespawn(parent);
        }
        catch (Exception ex)
        {
            ModLog.Debug($"EnemyLifetimeGuard.Register: {ex.Message}");
        }
    }

    public static void Clear()
    {
        Tracked.Clear();
        _checkInSec = 0f;
        EnemySpawnTracker.Clear();
    }

    public static void Tick(float dt)
    {
        _checkInSec -= dt;
        if (_checkInSec > 0f) return;
        _checkInSec = 0.35f;

        for (var i = Tracked.Count - 1; i >= 0; i--)
        {
            var entry = Tracked[i];
            var parent = entry.Parent;
            if (parent == null || IsEnemyDead(parent))
            {
                Tracked.RemoveAt(i);
                continue;
            }

            var age = Time.time - entry.RegisteredAt;
            if (age >= TrackMaxSeconds)
            {
                if (!entry.SpawnFinalized)
                {
                    FinalizeSpawn(parent);
                }

                Tracked.RemoveAt(i);
                continue;
            }

            if (!entry.SpawnFinalized && age >= SpawnProtectSeconds)
            {
                FinalizeSpawn(parent);
                entry.SpawnFinalized = true;
            }

            if (age < TrackMaxSeconds)
            {
                PreventInstantDespawn(parent);
            }
        }
    }

    /// <summary>Mark spawn phase complete so weapons and explosives can damage the enemy.</summary>
    private static void FinalizeSpawn(EnemyParent parent)
    {
        try
        {
            var max = ReadFloatField(parent, "SpawnedTimeMax");
            if (max > 0f)
            {
                SetFloatField(parent, "SpawnedTimer", max);
            }
            else
            {
                SetFloatField(parent, "SpawnedTimer", 9999f);
            }

            ModLog.Debug($"EnemyLifetimeGuard: spawn finalized for '{parent.name}'");
        }
        catch (Exception ex)
        {
            ModLog.Debug($"EnemyLifetimeGuard.FinalizeSpawn: {ex.Message}");
        }
    }

    /// <summary>Prevent director from instantly tucking away a freshly spawned mob.</summary>
    private static void PreventInstantDespawn(EnemyParent parent)
    {
        try
        {
            if (parent.DespawnedTimer > 0f && parent.DespawnedTimer < 30f)
            {
                parent.DespawnedTimer = 30f;
            }
        }
        catch
        {
            TrySetFloatField(parent, "DespawnedTimer", 30f, onlyIfPositive: true);
        }
    }

    private static bool IsEnemyDead(EnemyParent parent)
    {
        try
        {
            if (parent == null || parent.gameObject == null) return true;
            if (!parent.gameObject.activeInHierarchy) return false;

            var enemy = parent.GetComponentInChildren<Enemy>(true);
            if (enemy == null) return false;

            if (ReadBool(enemy, "isDead") || ReadBool(enemy, "dead")) return true;
            if (ReadBool(parent, "dead")) return true;
        }
        catch
        {
            // ignore
        }

        return false;
    }

    private static bool ReadBool(object target, string fieldName)
    {
        try
        {
            var field = target.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field?.FieldType == typeof(bool))
            {
                return (bool)field.GetValue(target)!;
            }
        }
        catch
        {
            // ignore
        }

        return false;
    }

    private static float ReadFloatField(object target, string fieldName)
    {
        try
        {
            var field = target.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field?.FieldType == typeof(float))
            {
                return (float)field.GetValue(target)!;
            }
        }
        catch
        {
            // ignore
        }

        return 0f;
    }

    private static void SetFloatField(object target, string fieldName, float value)
    {
        try
        {
            var field = target.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field?.FieldType == typeof(float))
            {
                field.SetValue(target, value);
            }
        }
        catch
        {
            // ignore
        }
    }

    private static void TrySetFloatField(object target, string fieldName, float value, bool onlyIfPositive)
    {
        try
        {
            var field = target.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field == null || field.FieldType != typeof(float)) return;
            var current = (float)field.GetValue(target)!;
            if (onlyIfPositive && current <= 0f) return;
            field.SetValue(target, value);
        }
        catch
        {
            // ignore
        }
    }
}
