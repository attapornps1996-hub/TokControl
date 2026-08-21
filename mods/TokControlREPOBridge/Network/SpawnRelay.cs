using System;
using ExitGames.Client.Photon;
using REPOLib.Modules;
using TokControlREPOBridge.Commands;
using TokControlREPOBridge.Logging;
using TokControlREPOBridge.Util;

namespace TokControlREPOBridge.Network;

/// <summary>
/// Client→host relay: clients forward spawn commands to the lobby host via Photon.
/// The host must also have TokControl_REPO_Tiktoklive installed.
/// </summary>
public static class SpawnRelay
{
    private const string EventName = "TokControl_SpawnRelay_v1";

    private static NetworkedEvent? _relayEvent;
    private static GameActions? _actions;

    public static void Initialize(GameActions actions)
    {
        _actions = actions;
        _relayEvent = new NetworkedEvent(EventName, OnRelayReceived);
        ModLog.Info("Spawn relay initialized (client → host)");
    }

    public static CommandResult ExecuteSpawn(string cmd, string name, int count, string user)
    {
        if (_actions == null)
        {
            return CommandResult.Fail("relay_not_ready");
        }

        if (!MainThreadDispatcher.IsReady)
        {
            return CommandResult.Fail("game_not_ready");
        }

        if (!RunGate.IsReadyForGameEvents())
        {
            return CommandResult.Fail("game_not_ready");
        }

        if (SemiFunc.IsMasterClientOrSingleplayer() || !SemiFunc.IsMultiplayer())
        {
            return ExecuteLocally(cmd, name, count, user);
        }

        return RelayToHost(cmd, name, count, user);
    }

    private static CommandResult RelayToHost(string cmd, string name, int count, string user)
    {
        if (_relayEvent == null)
        {
            return CommandResult.Fail("relay_not_ready");
        }

        try
        {
            var payload = SimpleJson.SpawnPayload(cmd, name, count, user);

            _relayEvent.RaiseEvent(payload, NetworkingEvents.RaiseMasterClient, SendOptions.SendReliable);
            ModLog.Info($"Relayed to host: {cmd} {name} x{count} for @{user}");
            return CommandResult.Ok("relayed_to_host", "Spawn sent to lobby host — host must have this mod installed");
        }
        catch (Exception ex)
        {
            ModLog.Error($"Relay failed: {ex.Message}");
            return CommandResult.Fail($"relay_failed:{ex.Message}");
        }
    }

    private static void OnRelayReceived(EventData eventData)
    {
        if (_actions == null)
        {
            return;
        }

        if (!SemiFunc.IsMasterClientOrSingleplayer())
        {
            ModLog.Debug("Relay received on non-host — ignored");
            return;
        }

        try
        {
            var raw = eventData.CustomData as string;
            if (string.IsNullOrWhiteSpace(raw))
            {
                ModLog.Warn("Relay payload empty");
                return;
            }

            if (!SimpleJson.TryParseSpawnPayload(raw, out var cmd, out var name, out var count, out var user))
            {
                ModLog.Warn("Relay payload invalid");
                return;
            }

            ModLog.Info($"Host executing relay: {cmd} {name} x{count} for @{user}");

            MainThreadDispatcher.Enqueue(() =>
            {
                ExecuteLocally(cmd, name, count, user ?? "viewer");
            });
        }
        catch (Exception ex)
        {
            ModLog.Error($"Relay handler error: {ex.Message}");
        }
    }

    private static CommandResult ExecuteLocally(string cmd, string name, int count, string user)
    {
        if (_actions == null)
        {
            return CommandResult.Fail("actions_not_ready");
        }

        count = Math.Max(1, Math.Min(count, 100));
        cmd = cmd.Trim().ToLowerInvariant();

        return cmd switch
        {
            "spawn_item" or "spawnitem" or "item" => _actions.SpawnItemLocal(name, count, user),
            "spawn_ghost" or "spawnghost" or "ghost" => _actions.SpawnEnemyLocal(name, count, user),
            "spawn_enemy" or "spawnenemy" or "enemy" => _actions.SpawnEnemyLocal(name, count, user),
            "spawn_valuable" or "spawnvaluable" or "valuable" => _actions.SpawnValuableLocal(name, count, user),
            "spawn_batch" or "spawnbatch" or "batch" => _actions.SpawnBatchLocal(name, user),
            _ => CommandResult.Fail($"unknown_spawn_cmd:{cmd}")
        };
    }
}
