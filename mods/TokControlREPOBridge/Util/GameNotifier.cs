using TokControlREPOBridge.Commands;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Util;

/// <summary>HUD + truck monitor notifications.</summary>
public static class GameNotifier
{
    public static void AnnounceSpawn(string user, string target, int count, string kind)
    {
        var safeUser = string.IsNullOrWhiteSpace(user) ? "viewer" : user.Trim();
        var safeTarget = string.IsNullOrWhiteSpace(target) ? "item" : target.Trim();
        var countText = count > 1 ? $" x{count}" : "";
        PostAnnouncement($"{safeUser} activates '{safeTarget}{countText}'", 4.5f);
    }

    public static void AnnounceEvent(string user, string eventId)
    {
        var safeUser = string.IsNullOrWhiteSpace(user) ? "viewer" : user.Trim();
        var label = EventLangCatalog.GetLabel(eventId);
        PostAnnouncement($"{safeUser} activates '{label}'", 3.5f);
    }

    /// <summary>Custom mid-screen MissionUI + truck announce (random roll results).</summary>
    public static void AnnounceCustom(string user, string message, float seconds = 4.5f)
    {
        var safeUser = string.IsNullOrWhiteSpace(user) ? "viewer" : user.Trim();
        var msg = string.IsNullOrWhiteSpace(message) ? "event" : message.Trim();
        if (msg.IndexOf(safeUser, System.StringComparison.OrdinalIgnoreCase) >= 0)
        {
            PostAnnouncement(msg, seconds);
            return;
        }
        PostAnnouncement($"{safeUser} → {msg}", seconds);
    }

    private static void PostAnnouncement(string line, float seconds = 3f)
    {
        if (string.IsNullOrWhiteSpace(line)) return;
        PostTruck(line);
        PostMission(line, new Color(1f, 0.45f, 0.15f), Color.white, System.Math.Max(2f, seconds));
    }

    private static void PostTruck(string message)
    {
        try
        {
            if (TruckScreenText.instance == null)
            {
                ModLog.Debug("TruckScreenText not ready — skip monitor message");
                return;
            }

            TruckScreenText.instance.MessageSendCustom("", "{arrowright}" + message + "{arrowleft}", 0);
        }
        catch (System.Exception ex)
        {
            ModLog.Debug($"Truck notify failed: {ex.Message}");
        }
    }

    private static void PostMission(string text, Color colorA, Color colorB, float seconds)
    {
        try
        {
            if (MissionUI.instance == null) return;
            MissionUI.instance.MissionText(text, colorA, colorB, seconds);
        }
        catch (System.Exception ex)
        {
            ModLog.Debug($"Mission notify failed: {ex.Message}");
        }
    }
}
