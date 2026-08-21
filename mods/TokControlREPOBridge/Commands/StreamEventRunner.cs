using System;
using TokControlREPOBridge.Logging;
using TokControlREPOBridge.Network;
using TokControlREPOBridge.Util;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

/// <summary>
/// Unified stream-event runner.
/// Player Effect = solo_* (target requesting player).
/// Mass Effect = all_* (target everyone alive / all dead for revive).
/// </summary>
internal static class StreamEventRunner
{
    public static CommandResult Execute(string eventId, string user, int count = 1, PlayerAvatar? targetPlayer = null)
    {
        eventId = Normalize(eventId);
        if (string.IsNullOrEmpty(eventId))
        {
            return CommandResult.Fail("empty_effect");
        }

        if (SpawnBlocklist.IsBlockedEventId(eventId))
        {
            ModLog.Warn($"Event temporarily disabled: {eventId}");
            return CommandResult.Fail("spawn_disabled_temp");
        }

        count = Math.Max(1, Math.Min(count, 100));

        if (!MainThreadDispatcher.IsReady)
        {
            return CommandResult.Fail("game_not_ready");
        }

        if (!RunGate.IsReadyForGameEvents())
        {
            return CommandResult.Fail("game_not_ready");
        }

        if (!EventCommandCatalog.TryGetCommandLine(eventId, out var commandLine))
        {
            return CommandResult.Fail($"unknown_event:{eventId}");
        }

        var subject = targetPlayer ?? SemiFunc.PlayerAvatarLocal();

        if (!SemiFunc.IsMasterClientOrSingleplayer() && SemiFunc.IsMultiplayer()
            && HostEventPolicy.MustRunFromHost(eventId))
        {
            var viewId = 0;
            try { viewId = subject?.photonView != null ? subject.photonView.ViewID : 0; } catch { /* ignore */ }
            return EffectRelay.RelayKnownEvent(eventId, user, count, viewId);
        }

        return ExecuteLocal(eventId, commandLine, user, count, subject);
    }

    public static CommandResult ExecuteLocal(
        string eventId,
        string commandLine,
        string user,
        int count,
        PlayerAvatar? targetPlayer = null)
    {
        eventId = Normalize(eventId);
        count = Math.Max(1, Math.Min(count, 100));

        if (!RunGate.IsReadyForGameEvents())
        {
            return CommandResult.Fail("game_not_ready");
        }

        if (string.IsNullOrWhiteSpace(commandLine)
            && !EventCommandCatalog.TryGetCommandLine(eventId, out commandLine))
        {
            return CommandResult.Fail($"unknown_event:{eventId}");
        }

        EventContext.SetTarget(targetPlayer ?? SemiFunc.PlayerAvatarLocal());
        EventContext.SetStackCount(count);
        try
        {
            var ok = false;
            // Duration effects (poop / player buffs): fire once, stack time by count.
            // Spawn loops: repeat spawn command `count` times.
            // Action/animation effects (slap/hurt/explode): stagger so they don't collide in one frame.
            if (IsActionStaggerCommand(commandLine) && count > 1)
            {
                const float stagger = 0.2f;
                for (var i = 0; i < count; i++)
                {
                    var delay = i * stagger;
                    var line = commandLine;
                    if (delay <= 0.001f)
                    {
                        if (EffectCommandExecutor.TryExecuteLine(line)) ok = true;
                    }
                    else
                    {
                        MainThreadDispatcher.EnqueueDelayed(() =>
                        {
                            try { EffectCommandExecutor.TryExecuteLine(line); }
                            catch (System.Exception ex) { ModLog.Warn($"Stagger action failed: {ex.Message}"); }
                        }, delay);
                        ok = true;
                    }
                }
            }
            else
            {
                var loops = IsDurationStackCommand(commandLine)
                    ? 1
                    : (NeedsCountLoop(commandLine) ? count : 1);
                for (var i = 0; i < loops; i++)
                {
                    if (EffectCommandExecutor.TryExecuteLine(commandLine))
                    {
                        ok = true;
                    }
                }
            }

            if (!ok)
            {
                if (eventId.Contains("resurrect", StringComparison.Ordinal))
                {
                    ModLog.Info($"Event '{eventId}' — no dead players to revive");
                    GameNotifier.AnnounceEvent(user, eventId);
                    return CommandResult.Fail("no_dead_players");
                }

                ModLog.Warn($"Event '{eventId}' command failed: {commandLine}");
                GameNotifier.AnnounceEvent(user, eventId);
                return CommandResult.Fail($"effect_failed:{eventId}");
            }

            ModLog.Info($"Event '{eventId}' applied for @{user} (count={count})");
            GameNotifier.AnnounceEvent(user, eventId);
            return CommandResult.Ok("effect_applied", eventId);
        }
        finally
        {
            EventContext.Clear();
        }
    }

    private static bool NeedsCountLoop(string commandLine)
    {
        var cmd = CommandHead(commandLine);
        return cmd is "spawn_item" or "spawn_enemy" or "spawn_active_item"
            or "spawn_simple_item_group";
    }

    private static bool IsActionStaggerCommand(string commandLine)
    {
        var cmd = CommandHead(commandLine);
        return cmd is "hurt_player_amount" or "slap_all_room" or "heal_player_amount"
            or "explode_player" or "explode_random_player" or "explode_closest_item"
            or "drop_inventory" or "force_crouch" or "knockdown_player";
    }

    private static bool IsDurationStackCommand(string commandLine)
    {
        var cmd = CommandHead(commandLine);
        return cmd is "spawn_items_from_player"
            or "shuffle_player_movement"
            or "invincible_player"
            or "infinite_player_stamina"
            or "drain_player_stamina"
            or "set_player_speed_mult"
            or "set_player_jump_power"
            or "enable_anti_gravity"
            or "set_player_gravity"
            or "disable_player_aiming"
            or "disable_player_movement"
            or "disable_input"
            or "hold_input"
            or "knockdown_player"
            or "force_rb";
    }

    private static string CommandHead(string commandLine)
    {
        var head = (commandLine ?? "").Trim();
        var space = head.IndexOf(' ');
        return (space > 0 ? head.Substring(0, space) : head).ToLowerInvariant();
    }

    private static string Normalize(string value)
    {
        value = (value ?? "").Trim().ToLowerInvariant().Replace(' ', '_');
        while (value.StartsWith("repo_", StringComparison.Ordinal))
        {
            value = value.Substring(5);
        }

        return value;
    }
}
