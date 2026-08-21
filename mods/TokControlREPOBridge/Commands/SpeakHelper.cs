using System;
using System.Reflection;
using System.Text;
using Photon.Pun;
using TokControlREPOBridge.Logging;
using TokControlREPOBridge.Network;
using TokControlREPOBridge.Util;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

/// <summary>Makes players speak in-game via PlayerAvatar.ChatMessageSend (networked TTS).</summary>
internal static class SpeakHelper
{
    private const int MaxLength = 180;
    private static string _pendingMessage = "";
    private static string _pendingUser = "viewer";
    private static MethodInfo? _chatMessageSend;
    private static bool _chatMethodResolved;

    public static CommandResult TrySpeak(string text, string user)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return CommandResult.Fail("speak_requires_text");
        }

        var message = Sanitize(text.Trim());
        if (message.Length == 0)
        {
            return CommandResult.Fail("speak_requires_text");
        }

        if (message.Length > MaxLength)
        {
            message = message.Substring(0, MaxLength);
        }

        _pendingMessage = message;
        _pendingUser = string.IsNullOrWhiteSpace(user) ? "viewer" : user.Trim();
        BurstCoalescer.Debounce("repo_speak", FlushPendingSpeak);
        return CommandResult.Ok("speak_queued", message);
    }

    /// <summary>Speak immediately on this client (Voice Troll / mass). No burst debounce.</summary>
    public static void ForceSpeakNow(string text)
    {
        var message = Sanitize((text ?? "").Trim());
        if (message.Length == 0) return;
        if (message.Length > MaxLength) message = message.Substring(0, MaxLength);
        SendChat(message);
    }

    private static void FlushPendingSpeak()
    {
        var message = _pendingMessage;
        var user = _pendingUser;
        _pendingMessage = "";
        if (string.IsNullOrWhiteSpace(message)) return;

        try
        {
            if (SemiFunc.MenuLevel())
            {
                ModLog.Debug("Speak skipped — not in level");
                return;
            }

            SpeakOnAllPlayers(message);
            ModLog.Info($"In-game speak all (burst @{user}): {message}");
        }
        catch (Exception ex)
        {
            ModLog.Error($"Speak failed: {ex.Message}");
        }
    }

    /// <summary>Every alive player speaks the same line (Voice Troll / MASS).</summary>
    public static void SpeakOnAllPlayers(string text)
    {
        var message = Sanitize((text ?? "").Trim());
        if (message.Length == 0) return;
        if (message.Length > MaxLength) message = message.Substring(0, MaxLength);
        if (SemiFunc.MenuLevel()) return;

        var spoken = 0;
        var players = PlayerTargeting.AlivePlayers();
        if (players.Count == 0)
        {
            var local = SemiFunc.PlayerAvatarLocal();
            if (local != null) players.Add(local);
        }

        foreach (var player in players)
        {
            if (player == null) continue;
            if (SpeakAsAvatar(player, message)) spoken++;
        }

        if (spoken == 0)
        {
            SpeakBroadcast.Broadcast(message);
        }
    }

    private static float SpeakTime(string message)
    {
        var n = Math.Max(1, (message ?? "").Length);
        return Mathf.Clamp(n * 0.12f, 3.4f, 16f);
    }

    private static float SpeakFloatArg(System.Reflection.ParameterInfo p, string message)
    {
        var n = (p.Name ?? "").ToLowerInvariant();
        if (n.Contains("rate") || n.Contains("speed") || n.Contains("pitch") || n.Contains("mult"))
            return 0.7f;
        return SpeakTime(message);
    }

    private static bool SpeakAsAvatar(PlayerAvatar player, string message)
    {
        try
        {
            EnsureChatMethod();
            var ok = false;
            if (_chatMessageSend != null)
            {
                var ps = _chatMessageSend.GetParameters();
                var args = new object[ps.Length];
                for (var i = 0; i < ps.Length; i++)
                {
                    var p = ps[i];
                    if (p.ParameterType == typeof(string)) args[i] = message;
                    else if (p.ParameterType == typeof(bool)) args[i] = false;
                    else if (p.ParameterType == typeof(float)) args[i] = SpeakFloatArg(p, message);
                    else if (p.HasDefaultValue) args[i] = p.DefaultValue!;
                    else args[i] = p.ParameterType.IsValueType ? Activator.CreateInstance(p.ParameterType)! : null!;
                }
                _chatMessageSend.Invoke(player, args);
                ok = true;
            }

            var view = player.photonView;
            var local = SemiFunc.PlayerAvatarLocal();
            var isLocal = local != null && (player == local
                || (view != null && local.photonView != null && view.ViewID == local.photonView.ViewID));

            if (!isLocal && view != null)
            {
                try
                {
                    view.RPC("ChatMessageSendRPC", RpcTarget.All, message);
                    ok = true;
                }
                catch
                {
                    try
                    {
                        view.RPC("ChatMessageSendRPC", RpcTarget.All, message, false);
                        ok = true;
                    }
                    catch { /* optional */ }
                }
            }

            return ok;
        }
        catch (Exception ex)
        {
            ModLog.Debug($"SpeakAsAvatar failed: {ex.Message}");
            return false;
        }
    }

    private static void EnsureChatMethod()
    {
        if (_chatMethodResolved) return;
        _chatMethodResolved = true;
        try
        {
            foreach (var method in typeof(PlayerAvatar).GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic))
            {
                if (method.Name != "ChatMessageSend") continue;
                var ps = method.GetParameters();
                if (ps.Length == 0) continue;
                if (ps[0].ParameterType != typeof(string)) continue;
                _chatMessageSend = method;
                return;
            }
        }
        catch (Exception ex)
        {
            ModLog.Debug($"ChatMessageSend resolve failed: {ex.Message}");
        }
    }

    private static void SendChat(string message)
    {
        try
        {
            if (SemiFunc.MenuLevel()) return;
            if (ChatManager.instance == null)
            {
                GameNotifier.AnnounceCustom("Voice Troll", message, 3f);
                return;
            }

            ChatManager.instance.ForceSendMessage(message);
            TryPossessChat(message);
        }
        catch (Exception ex)
        {
            ModLog.Debug($"Force speak failed: {ex.Message}");
        }
    }

    private static void TryPossessChat(string message)
    {
        try
        {
            var cm = ChatManager.instance;
            if (cm == null) return;
            foreach (var method in cm.GetType().GetMethods(System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic))
            {
                if (method.Name != "PossessChat") continue;
                var ps = method.GetParameters();
                if (ps.Length < 2) continue;
                var args = new object[ps.Length];
                for (var i = 0; i < ps.Length; i++)
                {
                    var p = ps[i];
                    if (p.ParameterType == typeof(string)) args[i] = message;
                    else if (p.ParameterType == typeof(float)) args[i] = SpeakFloatArg(p, message);
                    else if (p.ParameterType == typeof(Color)) args[i] = Color.white;
                    else if (p.ParameterType == typeof(bool)) args[i] = true;
                    else if (p.ParameterType.IsEnum) args[i] = System.Enum.ToObject(p.ParameterType, 0);
                    else if (p.HasDefaultValue) args[i] = p.DefaultValue!;
                    else args[i] = p.ParameterType.IsValueType ? System.Activator.CreateInstance(p.ParameterType)! : null!;
                }
                method.Invoke(cm, args);
                return;
            }
        }
        catch
        {
            /* optional flavor */
        }
    }

    private static string Sanitize(string input)
    {
        var sb = new StringBuilder(input.Length);
        foreach (var c in input)
        {
            if (char.IsControl(c) && c != '\n' && c != '\r') continue;
            sb.Append(c);
        }

        return sb.ToString().Trim();
    }
}
