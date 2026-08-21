using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;
using TokControlREPOBridge.Logging;

namespace TokControlREPOBridge.Commands;

/// <summary>Friendly event labels for truck/HUD (from langs.data en strings).</summary>
internal static class EventLangCatalog
{
    private static Dictionary<string, string>? _en;
    private static bool _loaded;

    public static void EnsureLoaded()
    {
        if (_loaded) return;
        _loaded = true;
        _en = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            var path = ResolveDataPath("langs.data");
            if (path == null || !File.Exists(path))
            {
                ModLog.Warn("langs.data not found — using formatted event ids");
                return;
            }

            var json = File.ReadAllText(path);
            // "event_id": { ... "en": "Label" ... }
            foreach (Match m in Regex.Matches(json,
                         "\"([^\"]+)\"\\s*:\\s*\\{[^}]*?\"en\"\\s*:\\s*\"([^\"]*)\"",
                         RegexOptions.Singleline))
            {
                var key = m.Groups[1].Value.Trim();
                var en = m.Groups[2].Value.Trim();
                if (key.Length == 0 || en.Length == 0) continue;
                if (key.StartsWith("%", StringComparison.Ordinal)) continue;
                _en[key] = en;
            }

            ModLog.Info($"Loaded {_en.Count} event labels from {path}");
        }
        catch (Exception ex)
        {
            ModLog.Warn($"langs.data load failed: {ex.Message}");
        }
    }

    public static string GetLabel(string eventId)
    {
        EnsureLoaded();
        if (string.IsNullOrWhiteSpace(eventId)) return "event";
        var key = eventId.Trim().ToLowerInvariant();
        while (key.StartsWith("repo_", StringComparison.Ordinal)) key = key.Substring(5);
        if (_en!.TryGetValue(key, out var label) && !string.IsNullOrWhiteSpace(label))
        {
            return label;
        }

        return Titleize(key);
    }

    private static string Titleize(string id)
    {
        var parts = id.Replace('_', ' ').Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        for (var i = 0; i < parts.Length; i++)
        {
            if (parts[i].Length == 0) continue;
            parts[i] = char.ToUpperInvariant(parts[i][0]) + parts[i].Substring(1);
        }

        return string.Join(" ", parts);
    }

    private static string? ResolveDataPath(string fileName)
    {
        try
        {
            var asm = Assembly.GetExecutingAssembly().Location;
            if (!string.IsNullOrEmpty(asm))
            {
                var dir = Path.GetDirectoryName(asm);
                if (!string.IsNullOrEmpty(dir))
                {
                    var beside = Path.Combine(dir, fileName);
                    if (File.Exists(beside)) return beside;
                    var data = Path.Combine(dir, "Data", fileName);
                    if (File.Exists(data)) return data;
                }
            }
        }
        catch { /* ignore */ }

        try
        {
            var pluginRoot = Path.Combine(BepInEx.Paths.PluginPath, "TokControlREPOBridge", "Data", fileName);
            if (File.Exists(pluginRoot)) return pluginRoot;
        }
        catch { /* ignore */ }

        return null;
    }
}
