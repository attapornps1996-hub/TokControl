using System;
using System.Threading;
using TokControlREPOBridge.Logging;
using TokControlREPOBridge.Network;
using TokControlREPOBridge.Util;

namespace TokControlREPOBridge.Commands;

public sealed class CommandProcessor
{
    private readonly string _defaultGhostEnemy;
    private readonly GameActions _actions = new();

    internal GameActions Actions => _actions;

    public CommandProcessor(string defaultGhostEnemy)
    {
        _defaultGhostEnemy = string.IsNullOrWhiteSpace(defaultGhostEnemy) ? "Hidden" : defaultGhostEnemy.Trim();
    }

    public CommandResult Process(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return CommandResult.Fail("empty_message");
        }

        raw = raw.Trim();
        if (!raw.StartsWith("{", StringComparison.Ordinal))
        {
            return ProcessPlainText(raw);
        }

        try
        {
            return ProcessJson(raw);
        }
        catch (Exception ex)
        {
            ModLog.Error($"Command parse error: {ex.Message}");
            return CommandResult.Fail(ex.Message);
        }
    }

    private CommandResult ProcessJson(string json)
    {
        var cmd = SimpleJson.GetString(json, "cmd")
                  ?? SimpleJson.GetString(json, "command")
                  ?? SimpleJson.GetString(json, "action")
                  ?? "";
        cmd = cmd.Trim().ToLowerInvariant();

        var eventId = SimpleJson.GetString(json, "eventId") ?? SimpleJson.GetString(json, "event");
        var name = SimpleJson.GetString(json, "name")
                   ?? SimpleJson.GetString(json, "item")
                   ?? SimpleJson.GetString(json, "enemy")
                   ?? SimpleJson.GetString(json, "gift")
                   ?? "";
        var count = SimpleJson.GetInt(json, "count") ?? SimpleJson.GetInt(json, "amount") ?? 1;
        var user = SimpleJson.GetString(json, "user") ?? SimpleJson.GetString(json, "uniqueId") ?? "viewer";
        var text = SimpleJson.GetString(json, "text") ?? SimpleJson.GetString(json, "message") ?? "";

        if (string.IsNullOrEmpty(cmd))
        {
            var plain = SimpleJson.GetString(json, "command");
            if (!string.IsNullOrEmpty(plain))
            {
                return ProcessPlainText(plain);
            }
        }

        if (!string.IsNullOrEmpty(eventId) && (string.IsNullOrEmpty(cmd) || cmd == "event"))
        {
            return Dispatch(eventId.Trim().ToLowerInvariant(), "", count, user, text);
        }

        return Dispatch(cmd, name, count, user, text);
    }

    private CommandResult ProcessPlainText(string text)
    {
        var pipe = text.Split('|');
        if (pipe.Length >= 2)
        {
            var cmd = pipe[0].Trim().ToLowerInvariant();
            var argName = pipe.Length > 1 ? pipe[1].Trim() : "";
            var argCount = pipe.Length > 2 && int.TryParse(pipe[2], out var c) ? c : 1;
            var speakText = cmd is "speak" or "say" or "tts" or "chat" ? argName : "";
            return Dispatch(cmd, argName, argCount, "viewer", speakText);
        }

        var parts = text.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0)
        {
            return CommandResult.Fail("empty_command");
        }

        var command = parts[0].ToLowerInvariant();
        var name = parts.Length > 1 ? parts[1] : "";
        var count = parts.Length > 2 && int.TryParse(parts[2], out var n) ? n : 1;
        return Dispatch(command, name, count, "viewer", "");
    }

    private CommandResult Dispatch(string cmd, string name, int count, string user, string speakText = "")
    {
        count = Math.Max(1, Math.Min(count, 100));

        switch (cmd)
        {
            case "ping":
            case "health":
                return CommandResult.Ok("pong", "Server alive");

            case "speak":
            case "say":
            case "tts":
            case "chat":
            {
                var message = !string.IsNullOrWhiteSpace(speakText) ? speakText : name;
                return EnqueueFireAndForget(() => SpeakHelper.TrySpeak(message, user), "speak");
            }

            case "announce":
            case "hud":
            case "mission":
            case "roll":
            {
                var message = !string.IsNullOrWhiteSpace(speakText) ? speakText : name;
                if (string.IsNullOrWhiteSpace(message))
                {
                    return CommandResult.Fail("announce requires text");
                }
                return EnqueueFireAndForget(() =>
                {
                    GameNotifier.AnnounceCustom(user, message);
                    return CommandResult.Ok("announced", message);
                }, "announce");
            }

            case "spawn_item":
            case "spawnitem":
            case "item":
                if (string.IsNullOrWhiteSpace(name))
                {
                    return CommandResult.Fail("spawn_item requires a name");
                }
                return EnqueueFireAndForget(() => SpawnRelay.ExecuteSpawn(cmd, name, count, user), $"spawn_item:{name}");

            case "spawn_ghost":
            case "spawnghost":
            case "ghost":
                var enemy = string.IsNullOrWhiteSpace(name) ? _defaultGhostEnemy : name;
                if (SpawnBlocklist.IsBlockedEnemy(enemy))
                {
                    ModLog.Warn($"Enemy spawn temporarily disabled: {enemy}");
                    return CommandResult.Fail("spawn_disabled_temp");
                }
                return EnqueueFireAndForget(() => SpawnRelay.ExecuteSpawn(cmd, enemy, count, user), $"spawn_ghost:{enemy}");

            case "spawn_enemy":
            case "spawnenemy":
            case "enemy":
                if (string.IsNullOrWhiteSpace(name))
                {
                    return CommandResult.Fail("spawn_enemy requires a name");
                }
                if (SpawnBlocklist.IsBlockedEnemy(name))
                {
                    ModLog.Warn($"Enemy spawn temporarily disabled: {name}");
                    return CommandResult.Fail("spawn_disabled_temp");
                }
                return EnqueueFireAndForget(() => SpawnRelay.ExecuteSpawn(cmd, name, count, user), $"spawn_enemy:{name}");

            case "spawn_batch":
                return EnqueueFireAndForget(
                    () => SpawnRelay.ExecuteSpawn("spawn_batch", name, 1, user),
                    "spawn_batch");

            case "spawn_valuable":
            case "spawnvaluable":
            case "valuable":
                if (string.IsNullOrWhiteSpace(name))
                {
                    return CommandResult.Fail("spawn_valuable requires a name");
                }
                return EnqueueFireAndForget(() => SpawnRelay.ExecuteSpawn(cmd, name, count, user), $"spawn_valuable:{name}");

            case "list_items":
                return RunOnMainThreadWait(() => _actions.ListItems());

            case "list_enemies":
                return RunOnMainThreadWait(() => _actions.ListEnemies());

            default:
                if (SpawnBlocklist.IsBlockedEventId(cmd))
                {
                    ModLog.Warn($"Event temporarily disabled: {cmd}");
                    return CommandResult.Fail("spawn_disabled_temp");
                }

                // Prefer commands.data (and local extras) for all stream event IDs.
                if (EventCommandCatalog.HasEvent(cmd))
                {
                    return EnqueueFireAndForget(() => StreamEventRunner.Execute(cmd, user, count), cmd);
                }

                if (RepoEventResolver.TryResolve(cmd, out var eventCmd, out var eventTarget))
                {
                    if (SpawnBlocklist.IsBlockedEnemy(eventTarget))
                    {
                        ModLog.Warn($"Enemy spawn temporarily disabled: {eventTarget} ({cmd})");
                        return CommandResult.Fail("spawn_disabled_temp");
                    }

                    return EnqueueFireAndForget(
                        () => SpawnRelay.ExecuteSpawn(eventCmd, eventTarget, count, user),
                        cmd);
                }

                ModLog.Warn($"Unknown command: {cmd}");
                return CommandResult.Fail($"unknown_command:{cmd}");
        }
    }

    /// <summary>Queue work on Unity main thread and return immediately so spam clicks don't stall.</summary>
    private static CommandResult EnqueueFireAndForget(Func<CommandResult> action, string label)
    {
        if (!MainThreadDispatcher.IsReady)
        {
            return CommandResult.Fail("game_not_ready");
        }

        MainThreadDispatcher.Enqueue(() =>
        {
            try
            {
                var result = action();
                if (!result.Success)
                {
                    ModLog.Warn($"Queued cmd failed ({label}): {result.Message}");
                }
            }
            catch (Exception ex)
            {
                ModLog.Error($"Queued cmd error ({label}): {ex.Message}");
            }
        });

        return CommandResult.Ok("queued", label);
    }

    private static CommandResult RunOnMainThreadWait(Func<CommandResult> action)
    {
        if (!MainThreadDispatcher.IsReady)
        {
            return CommandResult.Fail("game_not_ready");
        }

        CommandResult? result = null;
        var wait = new ManualResetEventSlim(false);

        MainThreadDispatcher.Enqueue(() =>
        {
            try
            {
                result = action();
            }
            catch (Exception ex)
            {
                result = CommandResult.Fail(ex.Message);
            }
            finally
            {
                wait.Set();
            }
        });

        if (!wait.Wait(TimeSpan.FromSeconds(10)))
        {
            return CommandResult.Fail("main_thread_timeout");
        }

        return result ?? CommandResult.Fail("no_result");
    }

    private static bool IsEffectEvent(string cmd)
    {
        if (string.IsNullOrWhiteSpace(cmd)) return false;
        cmd = cmd.Trim().ToLowerInvariant();
        while (cmd.StartsWith("repo_", StringComparison.Ordinal))
        {
            cmd = cmd.Substring(5);
        }

        return cmd.StartsWith("all_debuff_", StringComparison.Ordinal)
               || cmd.StartsWith("solo_debuff_", StringComparison.Ordinal)
               || cmd.StartsWith("all_buff_", StringComparison.Ordinal)
               || cmd.StartsWith("solo_buff_", StringComparison.Ordinal);
    }
}

public sealed class CommandResult
{
    public bool Success { get; init; }
    public string Message { get; init; } = "";
    public string? Detail { get; init; }

    public static CommandResult Ok(string message, string? detail = null) => new()
    {
        Success = true,
        Message = message,
        Detail = detail
    };

    public static CommandResult Fail(string message) => new()
    {
        Success = false,
        Message = message
    };

    public string ToJson() => SimpleJson.CommandResult(Success, Message, Detail);
}
