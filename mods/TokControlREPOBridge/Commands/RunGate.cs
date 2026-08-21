using System;
using TokControlREPOBridge.Logging;
using TokControlREPOBridge.Util;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

/// <summary>
/// Game-phase gate: only run stream events when a level is ready (not menu, map generated, someone alive).
/// </summary>
internal static class RunGate
{
    private static bool _wasLevelGenerated;
    private static bool _wasMenuLevel = true;

    public static bool IsReadyForGameEvents()
    {
        try
        {
            var generated = false;
            try
            {
                generated = LevelGenerator.Instance != null && LevelGenerator.Instance.Generated;
            }
            catch
            {
                generated = false;
            }

            if (generated && !_wasLevelGenerated)
            {
                OnLevelGenerated();
            }
            _wasLevelGenerated = generated;

            var menu = false;
            try { menu = SemiFunc.MenuLevel(); } catch { menu = false; }

            if (menu && !_wasMenuLevel)
            {
                OnMenuLevel();
            }
            _wasMenuLevel = menu;

            if (!generated || menu)
            {
                return false;
            }

            try
            {
                if (!AnyPlayerAlive())
                {
                    return false;
                }
            }
            catch (Exception ex)
            {
                ModLog.Debug($"RunGate alive check: {ex.Message}");
            }

            return true;
        }
        catch (Exception ex)
        {
            ModLog.Debug($"RunGate error: {ex.Message}");
            return false;
        }
    }

    public static void Tick(float dt)
    {
        if (!IsReadyForGameEvents()) return;
        EnemyLifetimeGuard.Tick(dt);
    }

    private static void OnLevelGenerated()
    {
        ModLog.Info("Level generated — clearing spawn guards");
        EnemyLifetimeGuard.Clear();
    }

    private static void OnMenuLevel()
    {
        ModLog.Info("Menu level — clearing spawn guards / timers");
        EnemyLifetimeGuard.Clear();
        try { PlayerEffectHelper.ForceEndMovementShuffle(); } catch { /* ignore */ }
    }

    private static bool AnyPlayerAlive() => PlayerTargeting.AnyPlayerAlive();
}
