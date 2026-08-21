using System;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using System.Text.RegularExpressions;
using TokControlREPOBridge.Logging;

namespace TokControlREPOBridge.Commands;

/// <summary>
/// Stream event ID → command line map, loaded from commands.data beside the plugin.
/// Local-only extras (toy vehicles, etc.) are merged on top and never remove file entries.
/// </summary>
internal static class EventCommandCatalog
{
    private static Dictionary<string, string>? _map;
    private static bool _loaded;

    // TokControl-only extras / overrides (restore working activate & poop behaviors).
    private static readonly Dictionary<string, string> LocalExtras =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["solo_toycars_around"] = "spawn_toycars_around 5",
            ["solo_toyplanes_around"] = "spawn_toyplanes_around 5",
            ["solo_poop_shock_mines"] = "spawn_items_from_player Item_Mine_Shockwave 15 1 0.3 1 1",
            ["spawn_ceiling_eye"] = "spawn_enemy Ceiling_Eye",
            ["spawn_gnome"] = "spawn_enemy Gnome",
            ["spawn_bang"] = "spawn_enemy Bang",
            // Primed throwables — use TokControl arm/fuse path (not plain spawn_active_item).
            ["active_nade_stun"] = "tok_active_nade stun",
            ["active_nade_shock"] = "tok_active_nade shock",
            ["active_nade_expl"] = "tok_active_nade expl",
            ["active_nade_duck"] = "tok_active_nade duck",
            ["all_speak_random"] = "all_players_speak",
            ["all_nade_burst"] = "nade_from_all_players expl 1",
            ["all_nade_duck"] = "nade_from_all_players duck 2",
            ["all_debuff_hurt"] = "slap_all_room 999; rel_force_move -15 0",
        };

    public static void EnsureLoaded()
    {
        if (_loaded) return;
        _loaded = true;
        _map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            var path = ResolveDataPath("commands.data");
            if (path != null && File.Exists(path))
            {
                ParseCommandsFile(File.ReadAllText(path));
                ModLog.Info($"Loaded {_map.Count} event commands from {path}");
            }
            else
            {
                ModLog.Warn("commands.data not found — using built-in fallback map");
                SeedFallbackFromRepoEventMap();
            }
        }
        catch (Exception ex)
        {
            ModLog.Warn($"commands.data load failed: {ex.Message}");
            SeedFallbackFromRepoEventMap();
        }

        foreach (var pair in LocalExtras)
        {
            _map![pair.Key] = pair.Value;
        }
    }

    public static bool TryGetCommandLine(string eventId, out string commandLine)
    {
        EnsureLoaded();
        commandLine = "";
        if (string.IsNullOrWhiteSpace(eventId)) return false;
        var key = Normalize(eventId);
        return _map!.TryGetValue(key, out commandLine!);
    }

    public static bool HasEvent(string eventId)
    {
        EnsureLoaded();
        return !string.IsNullOrWhiteSpace(eventId) && _map!.ContainsKey(Normalize(eventId));
    }

    private static string Normalize(string value)
    {
        value = value.Trim().ToLowerInvariant().Replace(' ', '_');
        while (value.StartsWith("repo_", StringComparison.Ordinal))
        {
            value = value.Substring(5);
        }

        return value;
    }

    private static void ParseCommandsFile(string json)
    {
        // "event_id": "command line ..."
        foreach (Match m in Regex.Matches(json, "\"([^\"]+)\"\\s*:\\s*\"([^\"]*)\""))
        {
            var key = m.Groups[1].Value.Trim();
            var val = m.Groups[2].Value.Trim();
            if (key.Length == 0 || val.Length == 0) continue;
            if (key is "test_event") continue;
            _map![key] = val;
        }
    }

    private static void SeedFallbackFromRepoEventMap()
    {
        // Minimal safety net if the data file is missing at runtime.
        foreach (var pair in LocalExtras)
        {
            _map![pair.Key] = pair.Value;
        }

        if (RepoEventMap.TryGetEffectCommand("solo_buff_heal", out var line))
        {
            _map["solo_buff_heal"] = line;
        }
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
