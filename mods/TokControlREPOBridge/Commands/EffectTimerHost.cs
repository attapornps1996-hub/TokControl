using System;
using System.Collections;
using System.Collections.Generic;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal sealed class EffectTimerHost : MonoBehaviour
{
    private static EffectTimerHost? _instance;

    private sealed class TimedEffect
    {
        public Coroutine? Coroutine;
        public Action? OnEnd;
        public float RemainingSeconds;
        public Action<float>? OnUpdate;
    }

    internal static EffectTimerHost Instance
    {
        get
        {
            if (_instance != null) return _instance;

            var go = new GameObject("TokControlEffectHost");
            DontDestroyOnLoad(go);
            _instance = go.AddComponent<EffectTimerHost>();
            return _instance;
        }
    }

    private readonly Dictionary<string, TimedEffect> _running = new();

    internal Coroutine RunRoutine(IEnumerator routine) => StartCoroutine(routine);

    internal void RunAfterFrames(int frames, Action action)
    {
        if (action == null) return;
        StartCoroutine(AfterFrames(frames, action));
    }

    private static IEnumerator AfterFrames(int frames, Action action)
    {
        for (var i = 0; i < Math.Max(1, frames); i++)
        {
            yield return null;
        }

        try { action(); }
        catch (Exception ex) { ModLog.Debug($"RunAfterFrames: {ex.Message}"); }
    }

    /// <summary>
    /// Start or extend a timed effect. Same id while still running → add seconds (stack duration).
    /// </summary>
    internal void RunForSeconds(string id, float seconds, Action<float> onUpdate, Action? onEnd = null)
    {
        seconds = Mathf.Max(0.1f, seconds);

        if (_running.TryGetValue(id, out var existing) && existing.Coroutine != null && existing.RemainingSeconds > 0.05f)
        {
            existing.RemainingSeconds += seconds;
            if (onUpdate != null) existing.OnUpdate = onUpdate;
            if (onEnd != null) existing.OnEnd = onEnd;
            ModLog.Info($"Timed effect '{id}' extended +{seconds:0.#}s → {existing.RemainingSeconds:0.#}s");
            return;
        }

        Stop(id, invokeEnd: true);
        var effect = new TimedEffect
        {
            OnEnd = onEnd,
            OnUpdate = onUpdate,
            RemainingSeconds = seconds
        };
        effect.Coroutine = StartCoroutine(RunTimer(id, effect));
        _running[id] = effect;
    }

    internal float GetRemaining(string id) =>
        _running.TryGetValue(id, out var effect) ? Mathf.Max(0f, effect.RemainingSeconds) : 0f;

    internal void Stop(string id, bool invokeEnd = false)
    {
        if (!_running.TryGetValue(id, out var effect)) return;
        _running.Remove(id);
        if (effect.Coroutine != null) StopCoroutine(effect.Coroutine);
        if (invokeEnd)
        {
            try { effect.OnEnd?.Invoke(); }
            catch (Exception ex) { ModLog.Warn($"Timed effect end '{id}': {ex.Message}"); }
        }
    }

    private IEnumerator RunTimer(string id, TimedEffect effect)
    {
        while (effect.RemainingSeconds > 0f)
        {
            var dt = Time.unscaledDeltaTime;
            try { effect.OnUpdate?.Invoke(dt); }
            catch (Exception ex) { ModLog.Debug($"Timed effect tick '{id}': {ex.Message}"); }
            effect.RemainingSeconds -= dt;
            yield return null;
        }

        if (_running.TryGetValue(id, out var current) && ReferenceEquals(current, effect))
        {
            _running.Remove(id);
        }

        try { effect.OnEnd?.Invoke(); }
        catch (Exception ex) { ModLog.Warn($"Timed effect end '{id}': {ex.Message}"); }
    }
}
