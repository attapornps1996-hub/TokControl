using System;

namespace TokControlREPOBridge.Util;

/// <summary>Runs actions on Unity's main thread (required for spawning).</summary>
public static class MainThreadDispatcher
{
    public static bool IsReady => Plugin.Instance != null;

    public static void Enqueue(Action action) => Plugin.EnqueueMainThread(action);

    public static void EnqueueDelayed(Action action, float delaySeconds) =>
        Plugin.EnqueueMainThreadDelayed(action, delaySeconds);
}
