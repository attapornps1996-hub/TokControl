using System.Collections.Generic;
using UnityEngine;

namespace TokControlREPOBridge.Ui;

internal static class HudRoomHelper
{
    private const float RoomRadius = 22f;

    internal static bool IsInCurrentRoom(Vector3 position)
    {
        var anchors = GetPlayerRoomAnchors();
        if (anchors.Count == 0) return false;

        var radiusSqr = RoomRadius * RoomRadius;
        foreach (var anchor in anchors)
        {
            if (HorizontalDistanceSqr(position, anchor) <= radiusSqr) return true;
        }

        return false;
    }

    internal static List<Vector3> GetPlayerRoomAnchors()
    {
        var anchors = new List<Vector3>();

        try
        {
            var rooms = SemiFunc.LevelPointsGetInPlayerRooms();
            if (rooms != null)
            {
                foreach (var point in rooms)
                {
                    if (point != null) anchors.Add(point.transform.position);
                }
            }
        }
        catch
        {
            // ignore
        }

        if (anchors.Count > 0) return anchors;

        var player = SemiFunc.PlayerAvatarLocal();
        if (player != null)
        {
            anchors.Add(player.transform.position);
        }

        return anchors;
    }

    private static float HorizontalDistanceSqr(Vector3 a, Vector3 b)
    {
        a.y = 0f;
        b.y = 0f;
        return (a - b).sqrMagnitude;
    }
}
