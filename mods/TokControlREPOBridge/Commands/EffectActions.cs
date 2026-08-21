using System;
using System.Collections;
using System.Linq;
using System.Threading;
using TokControlREPOBridge.Logging;
using TokControlREPOBridge.Util;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

public sealed partial class GameActions
{
    private const int GrenadeWaveSize = 5;

    private static int _grenadeScatterSeq;

    internal CommandResult SpawnActiveGrenade(string kind, int count, string user)
    {
        if (!RunGate.IsReadyForGameEvents())
        {
            return CommandResult.Fail("game_not_ready");
        }

        kind = (kind ?? "").Trim().ToLowerInvariant();
        count = Math.Max(1, Math.Min(count, 100));

        EffectTimerHost.Instance.RunRoutine(SpawnActiveGrenadeRoutine(kind, count, user ?? "viewer"));
        return CommandResult.Ok("active_nade_queued", kind);
    }

    private IEnumerator SpawnActiveGrenadeRoutine(string kind, int count, string user)
    {
        var spawned = 0;
        string? itemLabel = null;
        var remaining = count;

        while (remaining > 0)
        {
            var batch = Math.Min(GrenadeWaveSize, remaining);

            for (var i = 0; i < batch; i++)
            {
                var scatter = Interlocked.Increment(ref _grenadeScatterSeq) - 1;
                if (TrySpawnOneActiveGrenade(kind, scatter, out var label))
                {
                    itemLabel = label;
                    spawned++;
                }

                yield return null;
            }

            remaining -= batch;
            if (remaining > 0)
            {
                yield return new WaitForSeconds(0.08f);
            }
        }

        if (spawned == 0)
        {
            ModLog.Warn($"active_nade_{kind}: item spawn failed");
            yield break;
        }

        ModLog.Info($"active_nade '{kind}' x{spawned} for @{user} (item={itemLabel})");
        GameNotifier.AnnounceEvent(user, $"active_nade_{kind}");
    }

    private bool TrySpawnOneActiveGrenade(string kind, int scatterIndex, out string? itemLabel)
    {
        itemLabel = kind;
        var pos = SpawnHelper.GetGrenadeSpreadPosition(scatterIndex);
        GameObject? go = null;

        switch (kind)
        {
            case "duck":
                go = TrySpawnActiveItem(pos, GetDuckSearchTerms(), out itemLabel, scatterIndex);
                if (go != null)
                {
                    go.transform.position = pos;
                    ThrowableHelper.ApplyStrongBounce(go, 30f);
                }
                break;

            case "stun":
            case "shock":
            case "expl":
                go = TrySpawnActiveItem(pos, GetGrenadeSearchTerms(kind), out itemLabel, scatterIndex, armGrenade: true);
                if (go != null)
                {
                    go.transform.position = pos;
                    ThrowableHelper.ArmWithFuse(go, ThrowableHelper.DefaultSoloGrenadeFuseSeconds, immediate: true);
                }
                break;

            default:
                return false;
        }

        return go != null;
    }

    private static string[] GetDuckSearchTerms() =>
        ExpandActiveItemTerms("active_nade_duck", "Item_Rubber_Duck");

    private static string[] GetGrenadeSearchTerms(string kind)
    {
        var eventId = kind switch
        {
            "stun" => "active_nade_stun",
            "shock" => "active_nade_shock",
            "expl" => "active_nade_expl",
            _ => ""
        };

        var fallback = kind switch
        {
            "stun" => "Item_Grenade_Stun",
            "shock" => "Item_Grenade_Shockwave",
            "expl" => "Item_Grenade_Explosive",
            _ => kind
        };

        return ExpandActiveItemTerms(eventId, fallback);
    }

    private static string[] ExpandActiveItemTerms(string eventId, string fallback)
    {
        if (RepoEventMap.TryGetActiveItem(eventId, out var mappedId))
        {
            return RepoEventMap.ExpandItemSearchIds(mappedId).Distinct().ToArray();
        }

        return RepoEventMap.ExpandItemSearchIds(fallback).Distinct().ToArray();
    }

    private GameObject? TrySpawnActiveItem(Vector3 pos, string[] searchTerms, out string itemLabel, int scatterIndex, bool armGrenade = false)
    {
        itemLabel = searchTerms[0];
        foreach (var term in searchTerms)
        {
            var go = ItemSpawnHelper.TrySpawn(term, pos, Quaternion.identity, out var label, scatterIndex, holdInPlace: true, skipGrenadeDormant: armGrenade);
            if (go == null) continue;

            itemLabel = label ?? term;
            return go;
        }

        return null;
    }
}

