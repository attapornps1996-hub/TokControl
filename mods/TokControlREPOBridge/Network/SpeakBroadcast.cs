using System;
using ExitGames.Client.Photon;
using REPOLib.Modules;
using TokControlREPOBridge.Commands;
using TokControlREPOBridge.Logging;
using TokControlREPOBridge.Util;

namespace TokControlREPOBridge.Network;

/// <summary>Makes every client with this mod speak the same Voice Troll line.</summary>
internal static class SpeakBroadcast
{
    private const string EventName = "TokControl_SpeakBroadcast_v1";
    private static NetworkedEvent? _event;
    private static bool _handling;

    public static void Initialize()
    {
        _event = new NetworkedEvent(EventName, OnReceived);
        ModLog.Info("Speak broadcast initialized");
    }

    public static void Broadcast(string message)
    {
        if (string.IsNullOrWhiteSpace(message)) return;
        SpeakHelper.ForceSpeakNow(message);
        RaiseOthers(message);
    }

    public static void RaiseOthers(string message)
    {
        if (string.IsNullOrWhiteSpace(message) || _event == null) return;
        try
        {
            if (SemiFunc.IsMultiplayer())
            {
                _event.RaiseEvent(message, NetworkingEvents.RaiseOthers, SendOptions.SendReliable);
            }
        }
        catch (Exception ex)
        {
            ModLog.Debug($"Speak broadcast failed: {ex.Message}");
        }
    }

    private static void OnReceived(EventData eventData)
    {
        if (_handling) return;
        var raw = eventData.CustomData as string;
        if (string.IsNullOrWhiteSpace(raw)) return;
        MainThreadDispatcher.Enqueue(() =>
        {
            _handling = true;
            try { SpeakHelper.ForceSpeakNow(raw); }
            finally { _handling = false; }
        });
    }
}
