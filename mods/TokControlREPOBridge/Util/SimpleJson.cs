using System;

namespace TokControlREPOBridge.Util;

/// <summary>Minimal JSON helpers — no external dependencies (BepInEx/Unity safe).</summary>
public static class SimpleJson
{
    public static string? GetString(string json, string key)
    {
        if (string.IsNullOrEmpty(json) || string.IsNullOrEmpty(key)) return null;

        var pattern = "\"" + key + "\"";
        var idx = json.IndexOf(pattern, StringComparison.OrdinalIgnoreCase);
        if (idx < 0) return null;

        idx = json.IndexOf(':', idx);
        if (idx < 0) return null;
        idx++;

        while (idx < json.Length && char.IsWhiteSpace(json[idx])) idx++;
        if (idx >= json.Length) return null;

        if (json[idx] == '"')
        {
            idx++;
            var start = idx;
            while (idx < json.Length)
            {
                if (json[idx] == '\\') { idx += 2; continue; }
                if (json[idx] == '"') break;
                idx++;
            }
            return json.Substring(start, idx - start);
        }

        var valueStart = idx;
        while (idx < json.Length && json[idx] != ',' && json[idx] != '}') idx++;
        return json.Substring(valueStart, idx - valueStart).Trim().Trim('"');
    }

    public static int? GetInt(string json, string key)
    {
        var token = GetString(json, key);
        if (token != null && int.TryParse(token, out var parsed)) return parsed;
        return null;
    }

    public static string Escape(string value)
    {
        return (value ?? "")
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\n", "\\n")
            .Replace("\r", "\\r");
    }

    public static string CommandResult(bool success, string message, string? detail = null)
    {
        if (!string.IsNullOrEmpty(detail))
        {
            return $"{{\"success\":{(success ? "true" : "false")},\"message\":\"{Escape(message)}\",\"detail\":\"{Escape(detail)}\"}}";
        }

        return $"{{\"success\":{(success ? "true" : "false")},\"message\":\"{Escape(message)}\"}}";
    }

    public static string EffectPayload(string eventId, string user, int playerViewId = 0)
    {
        return $"{{\"eventId\":\"{Escape(eventId)}\",\"user\":\"{Escape(user)}\",\"playerViewId\":{playerViewId}}}";
    }

    public static bool TryParseEffectPayload(string json, out string eventId, out string user)
    {
        return TryParseEffectPayload(json, out eventId, out user, out _);
    }

    public static bool TryParseEffectPayload(string json, out string eventId, out string user, out int playerViewId)
    {
        eventId = GetString(json, "eventId") ?? GetString(json, "cmd") ?? "";
        user = GetString(json, "user") ?? "viewer";
        playerViewId = GetInt(json, "playerViewId") ?? 0;
        return !string.IsNullOrWhiteSpace(eventId);
    }

    public static string SpawnPayload(string cmd, string name, int count, string user)
    {
        return $"{{\"cmd\":\"{Escape(cmd)}\",\"name\":\"{Escape(name)}\",\"count\":{count},\"user\":\"{Escape(user)}\"}}";
    }

    public static bool TryParseSpawnPayload(string json, out string cmd, out string name, out int count, out string user)
    {
        cmd = GetString(json, "cmd") ?? "";
        name = GetString(json, "name") ?? "";
        count = GetInt(json, "count") ?? 1;
        user = GetString(json, "user") ?? "viewer";
        return !string.IsNullOrWhiteSpace(cmd);
    }
}
