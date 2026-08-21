using System;
using System.Collections.Generic;
using TokControlREPOBridge.Commands;
using TokControlREPOBridge.Logging;

namespace TokControlREPOBridge.Util;

/// <summary>
/// Debounce rapid-fire actions (gift spam) — only flush once after quiet period.
/// Speak/notify on the last action in a burst.
/// </summary>
internal static class BurstCoalescer
{
    private const float QuietSeconds = 0.45f;
    private static readonly Dictionary<string, Action> FlushActions = new();

    internal static void Debounce(string key, Action onFlush, Action? onTouch = null)
    {
        onTouch?.Invoke();
        FlushActions[key] = onFlush;
        EffectTimerHost.Instance.Stop(key);
        EffectTimerHost.Instance.RunForSeconds(key, QuietSeconds, _ => { }, () =>
        {
            if (!FlushActions.TryGetValue(key, out var flush)) return;
            FlushActions.Remove(key);
            try { flush(); }
            catch (Exception ex) { ModLog.Warn($"Burst flush '{key}' failed: {ex.Message}"); }
        });
    }
}

