using System;
using System.Collections;
using System.Reflection;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal static class ImpactLaunchHelper
{
    public static void PrepareForImpactBreak(GameObject go)
    {
        var impact = go.GetComponentInChildren<PhysGrabObjectImpactDetector>(true);
        if (impact == null) return;

        impact.destroyDisable = false;
        impact.destroyDisableTeleport = false;
        impact.indestructibleBreakEffects = false;
        TrySetField(impact, "isIndestructible", false);
        TrySetField(impact, "indestructibleSpawnTimer", 0f);
        TrySetField(impact, "impulseTimerDeactivateImpacts", 0f);
        TrySetField(impact, "impactDisable", false);
    }

    public static void LaunchBackwardBurst(GameObject go, PlayerAvatar player, float force)
    {
        var rb = go.GetComponentInChildren<Rigidbody>();
        if (rb == null || player == null) return;

        rb.isKinematic = false;
        rb.WakeUp();
        rb.position = GetRearSpawnPosition(player);
        rb.velocity = Vector3.zero;
        rb.angularVelocity = Vector3.zero;

        EffectTimerHost.Instance.StartCoroutine(LaunchBurstRoutine(rb, player.transform, force));
    }

    private static IEnumerator LaunchBurstRoutine(Rigidbody rb, Transform playerTransform, float force)
    {
        yield return null;

        var backward = -playerTransform.forward;
        backward.y = 0f;
        if (backward.sqrMagnitude < 0.01f) backward = playerTransform.forward * -1f;
        backward.Normalize();

        var launch = backward * force;
        for (var i = 0; i < 3; i++)
        {
            if (rb == null) yield break;
            rb.AddTorque(UnityEngine.Random.insideUnitSphere * 2f, ForceMode.Impulse);
            rb.AddForce(launch, ForceMode.Impulse);
            yield return new WaitForSeconds(0.2f);
        }
    }

    private static Vector3 GetRearSpawnPosition(PlayerAvatar player)
    {
        var back = -player.transform.forward.normalized;
        return player.transform.position + back * 0.55f + Vector3.up * 0.75f;
    }

    private static void TrySetField(object target, string fieldName, object value)
    {
        try
        {
            var field = target.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field == null) return;
            field.SetValue(target, value);
        }
        catch (Exception ex)
        {
            ModLog.Debug($"ImpactLaunchHelper field {fieldName}: {ex.Message}");
        }
    }
}
