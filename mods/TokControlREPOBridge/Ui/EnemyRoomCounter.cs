using System.Collections.Generic;
using System.Reflection;
using UnityEngine;

namespace TokControlREPOBridge.Ui;

internal static class EnemyRoomCounter
{
    private const float RoomRadius = 22f;

    internal static int CountInCurrentRooms() => HudStatsProvider.GetEnemyCount();

    internal static int ScanLiveCountInCurrentRooms()
    {
        if (!IsInGameplayLevel()) return 0;

        var anchors = HudRoomHelper.GetPlayerRoomAnchors();
        if (anchors.Count == 0) return 0;

        var count = 0;
        foreach (var parent in Object.FindObjectsOfType<EnemyParent>())
        {
            if (!IsLiveEnemy(parent)) continue;
            if (!IsNearAnyAnchor(parent.transform.position, anchors, RoomRadius)) continue;
            count++;
        }

        return count;
    }

    private static bool IsInGameplayLevel()
    {
        try
        {
            if (SemiFunc.MenuLevel()) return false;
            return SemiFunc.RunIsLevel();
        }
        catch
        {
            return RunManager.instance != null;
        }
    }

    private static bool IsNearAnyAnchor(Vector3 position, List<Vector3> anchors, float radius)
    {
        var radiusSqr = radius * radius;
        foreach (var anchor in anchors)
        {
            if (HorizontalDistanceSqr(position, anchor) <= radiusSqr) return true;
        }

        return false;
    }

    private static bool IsLiveEnemy(EnemyParent parent)
    {
        if (parent == null || !parent.gameObject.activeInHierarchy) return false;

        var enemy = parent.GetComponentInChildren<Enemy>(true);
        if (enemy == null || !enemy.gameObject.activeInHierarchy) return false;

        if (ReadBool(parent, "despawned")) return false;
        if (ReadBool(parent, "disabled")) return false;
        if (ReadBool(enemy, "disabled")) return false;
        if (ReadBool(enemy, "dead")) return false;
        if (ReadBool(enemy, "isDead")) return false;
        if (ReadBool(enemy, "despawned")) return false;

        return true;
    }

    private static bool ReadBool(object target, string fieldName)
    {
        try
        {
            var field = target.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field?.FieldType == typeof(bool))
            {
                return (bool)field.GetValue(target);
            }
        }
        catch
        {
            // ignore
        }

        return false;
    }

    private static float HorizontalDistanceSqr(Vector3 a, Vector3 b)
    {
        a.y = 0f;
        b.y = 0f;
        return (a - b).sqrMagnitude;
    }
}
