using System;
using ExitGames.Client.Photon;
using REPOLib.Modules;
using TokControlREPOBridge.Commands;
using TokControlREPOBridge.Logging;
using TokControlREPOBridge.Util;
using UnityEngine;

namespace TokControlREPOBridge.Network;

/// <summary>
/// Client→host relay for host-authority events. Payload includes the requesting player's Photon view id
/// so Player Effect (solo) applies to that player on the host.
/// </summary>
public static class EffectRelay
{
    private const string EventName = "TokControl_EffectRelay_v1";

    private static NetworkedEvent? _relayEvent;

    public static void Initialize(GameActions actions)
    {
        _relayEvent = new NetworkedEvent(EventName, OnRelayReceived);
        ModLog.Info("Effect relay initialized (client → host)");
    }

    public static CommandResult ExecuteEffect(string eventId, string user, int count = 1) =>
        StreamEventRunner.Execute(eventId, user, count);

    public static CommandResult RelayKnownEvent(string eventId, string user, int count = 1, int playerViewId = 0) =>
        RelayToHost(eventId, user, playerViewId);

    private static CommandResult RelayToHost(string eventId, string user, int playerViewId)
    {
        if (_relayEvent == null)
        {
            return CommandResult.Fail("relay_not_ready");
        }

        try
        {
            var payload = SimpleJson.EffectPayload(eventId, user, playerViewId);
            _relayEvent.RaiseEvent(payload, NetworkingEvents.RaiseMasterClient, SendOptions.SendReliable);
            ModLog.Info($"Effect relayed to host: {eventId} for @{user} (view={playerViewId})");
            return CommandResult.Ok("relayed_to_host", $"Effect {eventId} sent to lobby host");
        }
        catch (Exception ex)
        {
            ModLog.Error($"Effect relay failed: {ex.Message}");
            return CommandResult.Fail($"relay_failed:{ex.Message}");
        }
    }

    private static void OnRelayReceived(EventData eventData)
    {
        if (!SemiFunc.IsMasterClientOrSingleplayer())
        {
            ModLog.Debug("Effect relay received on non-host — ignored");
            return;
        }

        try
        {
            var raw = eventData.CustomData as string;
            if (string.IsNullOrWhiteSpace(raw))
            {
                ModLog.Warn("Effect relay payload empty");
                return;
            }

            if (!SimpleJson.TryParseEffectPayload(raw, out var eventId, out var user, out var playerViewId))
            {
                ModLog.Warn("Effect relay payload invalid");
                return;
            }

            ModLog.Info($"Host executing effect relay: {eventId} for @{user} view={playerViewId}");
            MainThreadDispatcher.Enqueue(() =>
            {
                if (!EventCommandCatalog.TryGetCommandLine(eventId, out var line))
                {
                    ModLog.Warn($"Host relay unknown event: {eventId}");
                    return;
                }

                PlayerAvatar? target = null;
                if (playerViewId > 0)
                {
                    try { target = SemiFunc.PlayerAvatarGetFromPhotonID(playerViewId); }
                    catch { /* ignore */ }
                }

                StreamEventRunner.ExecuteLocal(eventId, line, user ?? "viewer", 1, target);
            });
        }
        catch (Exception ex)
        {
            ModLog.Error($"Effect relay handler error: {ex.Message}");
        }
    }
}
