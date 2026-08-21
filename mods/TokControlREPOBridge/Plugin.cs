using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using BepInEx;
using BepInEx.Configuration;
using BepInEx.Logging;
using HarmonyLib;
using TokControlREPOBridge.Commands;
using TokControlREPOBridge.Logging;
using TokControlREPOBridge.Network;
using TokControlREPOBridge.Ui;
using TokControlREPOBridge.Util;
using UnityEngine;

namespace TokControlREPOBridge;

[BepInPlugin(PluginInfo.PLUGIN_GUID, PluginInfo.PLUGIN_NAME, PluginInfo.PLUGIN_VERSION)]
[BepInDependency(REPOLib.MyPluginInfo.PLUGIN_GUID, BepInDependency.DependencyFlags.HardDependency)]
public class Plugin : BaseUnityPlugin
{
    internal static Plugin Instance { get; private set; } = null!;
    internal static ManualLogSource Log { get; private set; } = null!;

    private ConfigEntry<int> _portConfig = null!;
    private ConfigEntry<bool> _logToUnityConfig = null!;
    private ConfigEntry<string> _defaultGhostEnemyConfig = null!;

    private WebSocketServer? _server;
    private CommandProcessor? _processor;
    private Harmony? _harmony;
    private static readonly ConcurrentQueue<Action> MainThreadQueue = new();
    private static readonly List<(float due, Action action)> DelayedActions = new();
    private static readonly object DelayedLock = new();

    internal static void EnqueueMainThread(Action action)
    {
        if (action == null) return;
        MainThreadQueue.Enqueue(action);
    }

    /// <summary>Schedule action on main thread after delaySeconds (for staggered slap/hurt/etc).</summary>
    internal static void EnqueueMainThreadDelayed(Action action, float delaySeconds)
    {
        if (action == null) return;
        if (delaySeconds <= 0.001f)
        {
            EnqueueMainThread(action);
            return;
        }

        lock (DelayedLock)
        {
            DelayedActions.Add((Time.realtimeSinceStartup + delaySeconds, action));
        }
    }

    private void Awake()
    {
        Instance = this;
        Log = Logger;

        BindConfig();

        ModLog.Info($"=== {PluginInfo.PLUGIN_NAME} v{PluginInfo.PLUGIN_VERSION} ===");
        ModLog.Info("REPOLib dependency OK — initializing WebSocket bridge");

        try
        {
            _harmony = new Harmony(PluginInfo.PLUGIN_GUID);
            _harmony.PatchAll(typeof(Plugin).Assembly);
            ModLog.Info("Enemy spawn patches applied");
        }
        catch (Exception ex)
        {
            ModLog.Warn($"Harmony patch failed: {ex.Message}");
        }

        _processor = new CommandProcessor(_defaultGhostEnemyConfig.Value);
        SpawnRelay.Initialize(_processor.Actions);
        EffectRelay.Initialize(_processor.Actions);
        SpeakBroadcast.Initialize();

        try
        {
            _server = new WebSocketServer(_portConfig.Value, _processor);
            _server.Start();
            ModLog.Info($"WebSocket listening on ws://127.0.0.1:{_server.Port}/");
            if (_server.Port != _portConfig.Value)
            {
                ModLog.Warn($"Configured port {_portConfig.Value} was busy. Update TokControl URL → ws://127.0.0.1:{_server.Port}/");
            }
        }
        catch (Exception ex)
        {
            ModLog.Error($"Failed to start WebSocket bridge: {ex.Message}");
            ModLog.Error("Disable other TikTok/stream mods using port 8080, or change Server.Port in the config file.");
            _server = null;
        }

        MainThreadDispatcher.Enqueue(() =>
        {
            ItemRegistry.EnsureLoaded();
            _ = EffectTimerHost.Instance;
            TokControlStatusHud.Ensure();
        });

        ModLog.Info("Waiting for TokControl / Pandy App commands...");
    }

    private const int MinActionsPerFrame = 16;
    private const int MaxBurstActionsPerFrame = 256;

    private void Update()
    {
        var dt = Time.deltaTime;
        try { RunGate.Tick(dt); } catch { /* ignore */ }

        var now = Time.realtimeSinceStartup;
        lock (DelayedLock)
        {
            for (var i = DelayedActions.Count - 1; i >= 0; i--)
            {
                if (DelayedActions[i].due > now) continue;
                var act = DelayedActions[i].action;
                DelayedActions.RemoveAt(i);
                if (act != null) MainThreadQueue.Enqueue(act);
            }
        }

        var pending = MainThreadQueue.Count;
        // Gift spam: drain backlog quickly (up to cap) so every gift can spawn.
        var budget = pending > 2 ? Math.Min(pending, MaxBurstActionsPerFrame) : MinActionsPerFrame;

        var processed = 0;
        while (processed < budget && MainThreadQueue.TryDequeue(out var action))
        {
            processed++;
            try
            {
                action();
            }
            catch (Exception ex)
            {
                ModLog.Error($"Main thread action failed: {ex.Message}");
            }
        }
    }

    private void BindConfig()
    {
        _portConfig = Config.Bind(
            "Server",
            "Port",
            8080,
            "Local WebSocket port for TokControl commands (ws://127.0.0.1:PORT/)");

        _logToUnityConfig = Config.Bind(
            "Debug",
            "LogToUnityConsole",
            true,
            "Mirror TokControl bridge logs to Unity debug console");

        _defaultGhostEnemyConfig = Config.Bind(
            "Gameplay",
            "DefaultGhostEnemy",
            "Hidden",
            "Enemy name used for spawn_ghost when no name is provided (e.g. Hidden, Robe, Hunter)");
    }

    internal static bool ShouldLogToUnity() => Instance?._logToUnityConfig?.Value ?? true;

    private void OnDestroy()
    {
        try { _harmony?.UnpatchSelf(); } catch { /* ignore */ }
        _server?.Dispose();
        ModLog.Info("TokControl_REPO_Tiktoklive shut down");
    }
}

public static class PluginInfo
{
    public const string PLUGIN_GUID = "com.tokcontrol.repobridge";
    public const string PLUGIN_NAME = "TokControl_REPO_Tiktoklive";
    public const string PLUGIN_VERSION = "1.3.73";
}

