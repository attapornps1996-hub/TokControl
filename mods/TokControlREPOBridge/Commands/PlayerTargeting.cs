using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

/// <summary>
/// Alive/dead targeting:
/// Player Effect (solo) → requesting / local player only.
/// Mass Effect (all) → every alive (or dead, for revive) player.
/// Dead = isDisabled.
/// </summary>
internal static class PlayerTargeting
{
    public static IEnumerable<PlayerAvatar> AllPlayers()
    {
        try
        {
            var list = SemiFunc.PlayerGetList();
            if (list != null && list.Count > 0)
            {
                return list.Where(p => p != null)!;
            }
        }
        catch { /* fall through */ }

        return UnityEngine.Object.FindObjectsOfType<PlayerAvatar>().Where(p => p != null)!;
    }

    public static bool IsPlayerDead(PlayerAvatar? player)
    {
        if (player == null) return false;
        try
        {
            return player.isDisabled;
        }
        catch
        {
            return ReadBool(player, "isDisabled");
        }
    }

    public static bool IsPlayerAlive(PlayerAvatar? player) =>
        player != null && !IsPlayerDead(player);

    public static bool AnyPlayerAlive() => AllPlayers().Any(IsPlayerAlive);

    public static List<PlayerAvatar> AlivePlayers() =>
        AllPlayers().Where(IsPlayerAlive).ToList();

    public static List<PlayerAvatar> DeadPlayers() =>
        AllPlayers().Where(IsPlayerDead).ToList();

    /// <param name="massEffect">true = Mass Effect (all_*); false = Player Effect (solo_*).</param>
    public static List<PlayerAvatar> GetAliveEventTargets(bool massEffect)
    {
        if (massEffect) return AlivePlayers();

        var solo = EventContext.SoloTarget();
        if (solo != null && IsPlayerAlive(solo)) return new List<PlayerAvatar> { solo };
        return new List<PlayerAvatar>();
    }

    /// <param name="massEffect">true = all dead; false = solo dead subject only.</param>
    public static List<PlayerAvatar> GetDeadEventTargets(bool massEffect)
    {
        if (massEffect) return DeadPlayers();

        var solo = EventContext.SoloTarget();
        if (solo != null && IsPlayerDead(solo)) return new List<PlayerAvatar> { solo };
        return new List<PlayerAvatar>();
    }

    private static bool ReadBool(object target, string fieldName)
    {
        try
        {
            var field = target.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field != null && field.FieldType == typeof(bool))
            {
                return (bool)field.GetValue(target);
            }
        }
        catch { /* ignore */ }

        return false;
    }
}
