using System;
using System.Collections.Generic;
using TokControlREPOBridge.Logging;
using TokControlREPOBridge.Util;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

public sealed partial class GameActions
{
    private static readonly Dictionary<string, Action<string, int>> UpgradeHandlers = new(StringComparer.OrdinalIgnoreCase)
    {
        ["solo_upgrade_energy"] = (id, d) => PunManager.instance.UpgradePlayerEnergy(id, d),
        ["solo_upgrade_health"] = (id, d) => PunManager.instance.UpgradePlayerHealth(id, d),
        ["solo_upgrade_speed"] = (id, d) => PunManager.instance.UpgradePlayerSprintSpeed(id, d),
        ["solo_upgrade_range"] = (id, d) => PunManager.instance.UpgradePlayerGrabRange(id, d),
        ["solo_upgrade_strength"] = (id, d) => PunManager.instance.UpgradePlayerGrabStrength(id, d),
        ["solo_upgrade_jump"] = (id, d) => PunManager.instance.UpgradePlayerExtraJump(id, d),
        ["solo_upgrade_roll"] = (id, d) => PunManager.instance.UpgradePlayerTumbleLaunch(id, d),
        ["solo_upgrade_wings"] = (id, d) => PunManager.instance.UpgradePlayerTumbleWings(id, d),
        ["solo_upgrade_rest"] = (id, d) => PunManager.instance.UpgradePlayerCrouchRest(id, d),
    };

    internal CommandResult ApplyUpgrade(string eventId, string user)
    {
        if (!RunGate.IsReadyForGameEvents())
        {
            return CommandResult.Fail("game_not_ready");
        }

        if (!UpgradeHandlers.TryGetValue(eventId.Trim().ToLowerInvariant(), out var handler))
        {
            return CommandResult.Fail($"unknown_upgrade:{eventId}");
        }

        try
        {
            if (PunManager.instance == null)
            {
                return CommandResult.Fail("pun_manager_not_ready");
            }

            var player = SemiFunc.PlayerAvatarLocal();
            if (player == null)
            {
                return CommandResult.Fail("player_not_found");
            }

            var steamId = SemiFunc.PlayerGetSteamID(player);
            handler(steamId, 1);
            ModLog.Info($"upgrade '{eventId}' +1 for @{user}");
            GameNotifier.AnnounceEvent(user, eventId);
            return CommandResult.Ok("upgrade_applied", eventId);
        }
        catch (Exception ex)
        {
            ModLog.Error($"upgrade error: {ex.Message}");
            return CommandResult.Fail(ex.Message);
        }
    }
}
