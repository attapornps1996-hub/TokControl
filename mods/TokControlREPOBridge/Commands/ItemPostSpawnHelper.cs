using System.Collections;
using System.Reflection;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal static class ItemPostSpawnHelper
{
    internal static void Initialize(GameObject instance, string? assetName, int scatterIndex = 0, bool holdInPlace = false, bool skipGrenadeDormant = false)
    {
        if (instance == null) return;

        EnsureGrabbable(instance);
        EnsureUsable(instance);
        RegisterItemInGame(assetName ?? instance.name);
        ChargeItem(instance, 0.5f);

        if (holdInPlace)
        {
            HoldInPlace(instance);
            EffectTimerHost.Instance.StartCoroutine(ReleaseHoldAfterSettle(instance));
        }
        else
        {
            ScatterForward(instance, scatterIndex);
        }

        if (!skipGrenadeDormant && instance.GetComponentInChildren<ItemGrenade>(true) != null)
        {
            ThrowableHelper.PreparePickupGrenade(instance);
        }
    }

    private static IEnumerator ReleaseHoldAfterSettle(GameObject instance)
    {
        yield return new WaitForSeconds(0.18f);
        if (instance == null) yield break;

        ReleaseHold(instance);
        EnsureUsable(instance);

        if (instance.GetComponentInChildren<ItemGrenade>(true) != null)
        {
            ThrowableHelper.PreparePickupGrenade(instance);
        }
    }

    public static void EnsureUsablePublic(GameObject instance) => EnsureUsable(instance);

    private static void EnsureUsable(GameObject instance)
    {
        foreach (var grab in instance.GetComponentsInChildren<PhysGrabObject>(true))
        {
            try
            {
                grab.enabled = true;
                var field = typeof(PhysGrabObject).GetField("spawned",
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (field != null && field.FieldType == typeof(bool))
                {
                    field.SetValue(grab, true);
                }
            }
            catch
            {
                // Best-effort.
            }
        }

        foreach (var toggle in instance.GetComponentsInChildren<ItemToggle>(true))
        {
            toggle.enabled = true;
        }

        foreach (var equippable in instance.GetComponentsInChildren<ItemEquippable>(true))
        {
            equippable.enabled = true;
        }
    }

    public static void ScatterForward(GameObject instance, int scatterIndex = 0)
    {
        var rb = instance.GetComponentInChildren<Rigidbody>();
        if (rb == null) return;

        rb.isKinematic = false;
        rb.WakeUp();

        var spreadYaw = (scatterIndex * 18f) - 9f;
        var forward = SpawnHelper.GetPlayerBodyForward();
        var dir = (Quaternion.Euler(0f, spreadYaw, 0f) * forward).normalized;
        dir.y = 0.1f;

        rb.velocity = dir * UnityEngine.Random.Range(2.2f, 3.6f);
        rb.angularVelocity = UnityEngine.Random.insideUnitSphere * 1.5f;
    }

    public static void HoldInPlace(GameObject instance)
    {
        foreach (var rb in instance.GetComponentsInChildren<Rigidbody>(true))
        {
            rb.velocity = Vector3.zero;
            rb.angularVelocity = Vector3.zero;
            rb.isKinematic = true;
        }
    }

    public static void ReleaseHold(GameObject instance)
    {
        foreach (var rb in instance.GetComponentsInChildren<Rigidbody>(true))
        {
            rb.isKinematic = false;
            rb.WakeUp();
        }
    }

    private static void EnsureGrabbable(GameObject instance)
    {
        instance.SetActive(true);

        foreach (var grab in instance.GetComponentsInChildren<PhysGrabObject>(true))
        {
            grab.enabled = true;
        }
    }

    private static void RegisterItemInGame(string assetName)
    {
        if (string.IsNullOrWhiteSpace(assetName) || !assetName.StartsWith("Item "))
        {
            return;
        }

        try
        {
            var stats = StatsManager.instance;
            if (stats?.itemDictionary == null || !stats.itemDictionary.ContainsKey(assetName))
            {
                return;
            }

            if (stats.itemsPurchased.TryGetValue(assetName, out var count))
            {
                stats.itemsPurchased[assetName] = count + 1;
            }
            else
            {
                stats.itemsPurchased[assetName] = 1;
            }

            if (stats.itemsPurchasedTotal.TryGetValue(assetName, out var total))
            {
                stats.itemsPurchasedTotal[assetName] = total + 1;
            }
            else
            {
                stats.itemsPurchasedTotal[assetName] = 1;
            }

            ModLog.Debug($"Registered spawned item: {assetName}");
        }
        catch (System.Exception ex)
        {
            ModLog.Debug($"RegisterItemInGame failed: {ex.Message}");
        }
    }

    private static void ChargeItem(GameObject instance, float delaySeconds, int bars = 10)
    {
        var battery = instance.GetComponentInParent<ItemBattery>();
        if (battery == null) return;

        EffectTimerHost.Instance.StartCoroutine(ChargeRoutine(battery, delaySeconds, bars));
    }

    private static IEnumerator ChargeRoutine(ItemBattery battery, float delaySeconds, int bars)
    {
        if (delaySeconds > 0f)
        {
            yield return new WaitForSeconds(delaySeconds);
        }

        if (battery == null) yield break;

        try
        {
            var method = battery.GetType().GetMethod("BatteryFullPercentChange",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (method != null)
            {
                method.Invoke(battery, new object[] { bars, true });
            }
        }
        catch (System.Exception ex)
        {
            ModLog.Debug($"ChargeItem failed: {ex.Message}");
        }
    }
}
