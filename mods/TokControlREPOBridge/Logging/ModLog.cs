using BepInEx.Logging;

namespace TokControlREPOBridge.Logging;

/// <summary>Unified logger — BepInEx log file + optional Unity console.</summary>
public static class ModLog
{
    public static void Info(string message)
    {
        Plugin.Log?.LogInfo(Format(message));
        if (Plugin.ShouldLogToUnity())
        {
            UnityEngine.Debug.Log(Format(message));
        }
    }

    public static void Warn(string message)
    {
        Plugin.Log?.LogWarning(Format(message));
        if (Plugin.ShouldLogToUnity())
        {
            UnityEngine.Debug.LogWarning(Format(message));
        }
    }

    public static void Error(string message)
    {
        Plugin.Log?.LogError(Format(message));
        if (Plugin.ShouldLogToUnity())
        {
            UnityEngine.Debug.LogError(Format(message));
        }
    }

    public static void Debug(string message)
    {
        Plugin.Log?.LogDebug(Format(message));
    }

    private static string Format(string message) => $"[TokControl] {message}";
}
