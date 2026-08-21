using System;
using System.Reflection;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal static class ValuableDamageHelper
{
    public static bool ApplyImpactDamage(GameObject go, float lossFraction = 0.2f, bool heavy = false)
    {
        if (go == null) return false;

        var valuable = go.GetComponentInChildren<ValuableObject>(true);
        var impact = go.GetComponentInChildren<PhysGrabObjectImpactDetector>(true);
        if (valuable == null && impact == null) return false;

        ImpactLaunchHelper.PrepareForImpactBreak(go);

        if (valuable != null)
        {
            var current = valuable.dollarValueCurrent;
            if (current <= 0f && valuable.dollarValueOriginal > 0f)
            {
                current = valuable.dollarValueOriginal;
            }

            var loss = Mathf.Max(current * lossFraction, valuable.dollarValueOriginal * 0.08f, 1f);
            valuable.dollarValueCurrent = Mathf.Max(0f, current - loss);

            try
            {
                valuable.DollarValueSetLogic();
            }
            catch (Exception ex)
            {
                ModLog.Debug($"DollarValueSetLogic failed: {ex.Message}");
            }

            if (valuable.dollarValueCurrent <= 0f)
            {
                ForceBreak(impact, go.transform.position, heavy: true);
                return true;
            }
        }

        ForceBreak(impact, go.transform.position, heavy);
        return valuable == null || valuable.dollarValueCurrent > 0f;
    }

    public static bool IsDestroyed(GameObject go)
    {
        if (go == null) return true;

        var valuable = go.GetComponentInChildren<ValuableObject>(true);
        if (valuable != null && valuable.dollarValueCurrent <= 0f) return true;

        return false;
    }

    private static void ForceBreak(PhysGrabObjectImpactDetector? impact, Vector3 point, bool heavy)
    {
        if (impact == null) return;

        try
        {
            if (heavy)
            {
                impact.BreakHeavy(point, _forceBreak: true);
            }
            else
            {
                impact.BreakLight(point, _forceBreak: true);
            }
        }
        catch
        {
            try
            {
                impact.DestroyObject(true);
            }
            catch
            {
                // ignore
            }
        }
    }
}
