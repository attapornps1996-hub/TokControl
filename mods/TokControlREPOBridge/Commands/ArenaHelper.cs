using System;
using System.Reflection;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal static class ArenaHelper
{
    public static bool IsPlayerInCrownArenaBeforeStart(PlayerAvatar player)
    {
        var arena = Arena.instance;
        if (arena == null || player == null) return false;

        if (!IsBeforeCrownContestStart(arena)) return false;

        var center = GetArenaCenter(arena);
        var horizontal = Vector2.Distance(
            new Vector2(player.transform.position.x, player.transform.position.z),
            new Vector2(center.x, center.z));

        return horizontal < 18f && Mathf.Abs(player.transform.position.y - center.y) < 10f;
    }

    public static Vector3 GetCrownArenaDropPosition()
    {
        var arena = Arena.instance;
        if (arena == null) return Vector3.zero;

        var anchor = arena.crownTransform != null
            ? arena.crownTransform.position
            : arena.crownPlatform != null
                ? arena.crownPlatform.transform.position
                : arena.transform.position;

        return anchor + Vector3.up * 14f;
    }

    private static Vector3 GetArenaCenter(Arena arena)
    {
        if (arena.crownTransform != null) return arena.crownTransform.position;
        if (arena.floorDoorTransform != null) return arena.floorDoorTransform.position;
        return arena.transform.position;
    }

    private static bool IsBeforeCrownContestStart(Arena arena)
    {
        try
        {
            var field = typeof(Arena).GetField("currentState",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field?.GetValue(arena) is Arena.States state)
            {
                return state is Arena.States.Idle or Arena.States.Starting;
            }
        }
        catch
        {
            // ignore
        }

        return true;
    }
}
