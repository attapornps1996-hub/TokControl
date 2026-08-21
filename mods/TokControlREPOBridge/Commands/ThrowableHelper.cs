using System;
using System.Collections;
using System.Reflection;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal static class ThrowableHelper
{
    public static Vector3 GetThrowOrigin()
    {
        var playerPos = SpawnHelper.GetPlayerPosition();
        var forward = SpawnHelper.GetPlayerForward();
        return playerPos + forward.normalized * 1.2f + Vector3.up * 1.35f;
    }

    public static void ThrowForward(GameObject go, float speed)
    {
        var rb = go.GetComponentInChildren<Rigidbody>();
        if (rb == null) return;

        rb.isKinematic = false;
        rb.WakeUp();

        var forward = SpawnHelper.GetPlayerForward();
        forward.y += 0.15f;
        rb.velocity = forward.normalized * speed;
        rb.angularVelocity = UnityEngine.Random.insideUnitSphere * 6f;
    }

    public static void PrepareDormantGrenade(GameObject go)
    {
        foreach (var grenade in go.GetComponentsInChildren<ItemGrenade>(true))
        {
            grenade.enabled = false;
            grenade.isActive = false;
            grenade.isSpawnedGrenade = false;
            grenade.grenadeTimer = 0f;
        }

        foreach (var toggle in go.GetComponentsInChildren<ItemToggle>(true))
        {
            toggle.enabled = false;
        }
    }

    /// <summary>Inventory grenades: grabbable and toggleable, but not armed on spawn.</summary>
    public static void PreparePickupGrenade(GameObject go)
    {
        foreach (var grenade in go.GetComponentsInChildren<ItemGrenade>(true))
        {
            grenade.enabled = true;
            grenade.isActive = false;
            grenade.isSpawnedGrenade = true;
            grenade.grenadeTimer = 0f;
        }

        foreach (var toggle in go.GetComponentsInChildren<ItemToggle>(true))
        {
            toggle.enabled = true;
        }
    }

    public const float DefaultSoloGrenadeFuseSeconds = 3f;

    public static void ArmWithFuse(GameObject go, float fuseSeconds = -1f, bool immediate = false)
    {
        var existing = go.GetComponent<FusedGrenadeActivator>();
        if (existing != null)
        {
            UnityEngine.Object.Destroy(existing);
        }

        if (!immediate)
        {
            PrepareDormantGrenade(go);
        }

        EffectTimerHost.Instance.RunRoutine(ArmSpawnedGrenadeRoutine(go, fuseSeconds, immediate));
    }

    private static IEnumerator ArmSpawnedGrenadeRoutine(GameObject go, float fuseSeconds, bool immediate)
    {
        if (go == null) yield break;

        yield return null;
        yield return null;

        var grenade = go.GetComponentInChildren<ItemGrenade>(true);
        var toggle = go.GetComponentInChildren<ItemToggle>(true);
        var physGrab = go.GetComponentInChildren<PhysGrabObject>(true);
        var rb = go.GetComponentInChildren<Rigidbody>(true);

        var fuse = fuseSeconds > 0f ? fuseSeconds : DefaultSoloGrenadeFuseSeconds;

        if (!immediate)
        {
            var grounded = SpawnHelper.SnapToFloor(go.transform.position, SpawnHelper.ItemGroundOffset);
            go.transform.position = grounded;
        }

        ItemPostSpawnHelper.ReleaseHold(go);
        if (rb != null)
        {
            rb.isKinematic = false;
            rb.WakeUp();
            rb.velocity = Vector3.zero;
            rb.angularVelocity = Vector3.zero;
        }

        if (grenade != null)
        {
            grenade.enabled = true;
            grenade.isSpawnedGrenade = true;
        }

        if (toggle != null)
        {
            toggle.enabled = true;
        }

        EnsurePhysGrabSpawned(physGrab);

        var deadline = Time.time + 1.5f;
        while (Time.time < deadline && go != null)
        {
            EnsurePhysGrabSpawned(physGrab);
            if (physGrab == null || physGrab.spawned)
            {
                break;
            }

            if (rb != null)
            {
                rb.isKinematic = false;
                rb.WakeUp();
            }

            yield return null;
        }

        yield return null;

        if (go != null && TryActivateGrenadeComponents(go, fuse))
        {
            ModLog.Debug($"Grenade armed at {go.transform.position}");
            yield break;
        }

        if (go != null)
        {
            ModLog.Warn("Grenade arm fallback: ForceDetonateGrenade");
            ForceDetonateGrenade(go);
        }
    }

    private static bool TryActivateGrenadeComponents(GameObject go, float fuseSeconds)
    {
        var grenade = go.GetComponentInChildren<ItemGrenade>(true);
        var toggle = go.GetComponentInChildren<ItemToggle>(true);
        if (grenade == null) return ArmGrenade(go);

        grenade.enabled = true;
        grenade.isSpawnedGrenade = true;

        if (toggle != null)
        {
            toggle.enabled = true;
            var tickInterval = grenade.tickTime > 0.05f ? grenade.tickTime : 1f;
            var fuseTicks = Mathf.Max(1, Mathf.RoundToInt(fuseSeconds / tickInterval));
            grenade.tickTime = tickInterval;

            try
            {
                toggle.ToggleItem(true, fuseTicks);
                return true;
            }
            catch (Exception ex)
            {
                ModLog.Debug($"Grenade ToggleItem({fuseTicks}): {ex.Message}");
            }

            try
            {
                toggle.ToggleItem(true, -1);
                return true;
            }
            catch (Exception ex)
            {
                ModLog.Debug($"Grenade ToggleItem(-1): {ex.Message}");
            }
        }

        grenade.isActive = true;
        try
        {
            grenade.TickStart();
            return true;
        }
        catch (Exception ex)
        {
            ModLog.Debug($"Grenade TickStart: {ex.Message}");
        }

        return ArmGrenade(go);
    }

    private static void EnsurePhysGrabSpawned(PhysGrabObject? physGrab)
    {
        if (physGrab == null) return;

        try
        {
            var field = typeof(PhysGrabObject).GetField("spawned",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field != null && field.FieldType == typeof(bool))
            {
                field.SetValue(physGrab, true);
            }
        }
        catch
        {
            // Best-effort — arming still attempted below.
        }
    }

    public static void ScatterOnGround(GameObject go)
    {
        var rb = go.GetComponentInChildren<Rigidbody>();
        if (rb == null) return;

        rb.isKinematic = false;
        rb.WakeUp();
        var outward = go.transform.position - SpawnHelper.GetPlayerBodyPosition();
        outward.y = 0f;
        if (outward.sqrMagnitude < 0.01f)
        {
            outward = SpawnHelper.GetPlayerBodyForward();
        }

        outward = outward.normalized;
        rb.velocity = outward * UnityEngine.Random.Range(1.8f, 3.2f) + Vector3.up * 0.35f;
        rb.angularVelocity = UnityEngine.Random.insideUnitSphere * 2f;
    }

    public static float ResolveGrenadeFuseSeconds(GameObject go)
    {
        var grenade = go.GetComponentInChildren<ItemGrenade>(true);
        var tickInterval = grenade != null && grenade.tickTime > 0.05f ? grenade.tickTime : 1f;

        var name = (go.name + " " + (grenade?.name ?? "")).ToLowerInvariant();
        if (name.Contains("stun")) return 5f * tickInterval;
        if (name.Contains("shock")) return 5f * tickInterval;
        if (name.Contains("expl")) return 5f * tickInterval;
        if (name.Contains("mine")) return 2.5f * tickInterval;
        return 5f * tickInterval;
    }

    public static void ArmAndDetonateInPlace(GameObject go)
    {
        ArmWithFuse(go);
    }

    public static void ForceDetonateGrenade(GameObject go)
    {
        var grenade = go.GetComponentInChildren<ItemGrenade>(true);
        if (grenade != null)
        {
            grenade.grenadeTimer = 0f;
            try { grenade.TickEnd(); } catch { /* ignore */ }
            try { grenade.onDetonate?.Invoke(); } catch { /* ignore */ }
        }

        foreach (var comp in go.GetComponentsInChildren<MonoBehaviour>(true))
        {
            if (TryInvoke(comp, "Explode") ||
                TryInvoke(comp, "Detonate") ||
                TryInvoke(comp, "TriggerExplosion") ||
                TryInvoke(comp, "FuseEnd") ||
                TryInvoke(comp, "OnExplode") ||
                TryInvoke(comp, "GrenadeExplode") ||
                TryInvoke(comp, "Explosion"))
            {
                return;
            }

            TrySetFloatField(comp, "fuseTimer", 0f);
            TrySetFloatField(comp, "fuse", 0f);
            TrySetFloatField(comp, "timer", 0f);
            TrySetFloatField(comp, "explodeTimer", 0f);
        }

        ArmGrenade(go);
    }

    private static bool TrySetFloatField(MonoBehaviour comp, string fieldName, float value)
    {
        try
        {
            var field = comp.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field == null || field.FieldType != typeof(float)) return false;
            field.SetValue(comp, value);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static void ArmGrenadeDelayed(GameObject go, float throwSpeed)
    {
        var armer = go.GetComponent<DelayedGrenadeArm>() ?? go.AddComponent<DelayedGrenadeArm>();
        armer.Configure(throwSpeed);
    }

    public static bool ArmGrenade(GameObject go)
    {
        var armed = false;

        foreach (var comp in go.GetComponentsInChildren<MonoBehaviour>(true))
        {
            var type = comp.GetType();

            if (TryInvoke(comp, "ToggleItem") ||
                TryInvoke(comp, "Toggle") ||
                TryInvoke(comp, "Arm") ||
                TryInvoke(comp, "StartFuse") ||
                TryInvoke(comp, "FuseStart") ||
                TryInvoke(comp, "OnActivate") ||
                TryInvoke(comp, "Spawned") ||
                TryInvoke(comp, "ActivateGrenade"))
            {
                armed = true;
            }

            if (TrySetBoolField(comp, "armed") ||
                TrySetBoolField(comp, "activated") ||
                TrySetBoolField(comp, "fused") ||
                TrySetBoolField(comp, "lit") ||
                TrySetBoolField(comp, "thrown") ||
                TrySetBoolField(comp, "toggleState"))
            {
                armed = true;
            }
        }

        return armed;
    }

    public static void ApplyStrongBounce(GameObject go, float durationSeconds)
    {
        var rb = go.GetComponentInChildren<Rigidbody>();
        if (rb != null)
        {
            rb.isKinematic = false;
            rb.WakeUp();
            rb.mass = Mathf.Max(rb.mass, 0.75f);
            rb.drag = 0.05f;
            rb.angularDrag = 0.05f;

            var forward = SpawnHelper.GetPlayerForward();
            forward.y = 0.55f;
            rb.velocity = forward.normalized * UnityEngine.Random.Range(16f, 22f);
            rb.angularVelocity = UnityEngine.Random.insideUnitSphere * 18f;

            foreach (var col in go.GetComponentsInChildren<Collider>(true))
            {
                if (col.material == null)
                {
                    col.material = new PhysicMaterial("TokControlBounce")
                    {
                        bounciness = 0.95f,
                        bounceCombine = PhysicMaterialCombine.Maximum,
                        dynamicFriction = 0.15f,
                        staticFriction = 0.15f
                    };
                }
                else
                {
                    col.material.bounciness = Mathf.Max(col.material.bounciness, 0.95f);
                    col.material.bounceCombine = PhysicMaterialCombine.Maximum;
                }
            }
        }

        var bounce = go.GetComponent<RubberDuckBounce>() ?? go.AddComponent<RubberDuckBounce>();
        bounce.Configure(durationSeconds);
    }

    private static bool TryInvoke(MonoBehaviour comp, string methodName)
    {
        try
        {
            var method = comp.GetType().GetMethod(methodName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (method == null) return false;

            var parms = method.GetParameters();
            if (parms.Length == 0)
            {
                method.Invoke(comp, null);
                return true;
            }

            if (parms.Length == 1 && parms[0].ParameterType == typeof(bool))
            {
                method.Invoke(comp, new object[] { true });
                return true;
            }
        }
        catch (Exception ex)
        {
            ModLog.Debug($"Arm invoke {methodName} failed: {ex.Message}");
        }

        return false;
    }

    private static bool TrySetBoolField(MonoBehaviour comp, string fieldName)
    {
        try
        {
            var field = comp.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field == null || field.FieldType != typeof(bool)) return false;
            field.SetValue(comp, true);
            return true;
        }
        catch
        {
            return false;
        }
    }
}

internal sealed class RubberDuckBounce : MonoBehaviour
{
    private enum Phase
    {
        Bounce,
        Done
    }

    /// <summary>Chance each impulse aims at a player or sellable valuable (not just local).</summary>
    private const float TargetHitChance = 0.55f;
    private const float ValuableSearchRadius = 28f;

    private float _duration = 20f;
    private float _elapsed;
    private Rigidbody? _rb;
    private float _nextImpulse;
    private Phase _phase = Phase.Bounce;

    public void Configure(float durationSeconds)
    {
        _duration = Mathf.Max(1f, durationSeconds);
        _rb = GetComponentInChildren<Rigidbody>();
        _nextImpulse = 0.2f;
        _phase = Phase.Bounce;
        _elapsed = 0f;
    }

    private void FixedUpdate()
    {
        if (_rb == null || _phase == Phase.Done) return;

        _elapsed += Time.fixedDeltaTime;
        if (_elapsed >= _duration)
        {
            _phase = Phase.Done;
            StopBouncePhysics();
            return;
        }

        _nextImpulse -= Time.fixedDeltaTime;
        if (_nextImpulse > 0f) return;

        _nextImpulse = UnityEngine.Random.Range(0.45f, 0.95f);

        if (UnityEngine.Random.value < TargetHitChance && TryLaunchAtRandomTarget())
        {
            return;
        }

        var impulse = UnityEngine.Random.onUnitSphere;
        impulse.y = Mathf.Abs(impulse.y) + 0.45f;
        _rb.AddForce(impulse.normalized * UnityEngine.Random.Range(9f, 14f), ForceMode.Impulse);
        _rb.AddTorque(UnityEngine.Random.insideUnitSphere * 8f, ForceMode.Impulse);
    }

    private bool TryLaunchAtRandomTarget()
    {
        if (_rb == null) return false;

        var origin = transform.position;
        var targets = new System.Collections.Generic.List<Vector3>(16);

        foreach (var player in PlayerTargeting.AlivePlayers())
        {
            if (player == null) continue;
            targets.Add(player.transform.position + Vector3.up * 1.1f);
        }

        foreach (var valuable in UnityEngine.Object.FindObjectsOfType<ValuableObject>())
        {
            if (valuable == null) continue;
            var pos = valuable.transform.position;
            if ((pos - origin).sqrMagnitude > ValuableSearchRadius * ValuableSearchRadius) continue;
            targets.Add(pos + Vector3.up * 0.35f);
        }

        if (targets.Count == 0) return false;

        var aim = targets[UnityEngine.Random.Range(0, targets.Count)];
        var dir = aim - origin;
        if (dir.sqrMagnitude < 0.01f)
        {
            dir = SpawnHelper.GetPlayerForward();
        }

        dir.y = Mathf.Max(dir.y, 0.35f);
        _rb.velocity = dir.normalized * UnityEngine.Random.Range(14f, 21f);
        _rb.angularVelocity = UnityEngine.Random.insideUnitSphere * 14f;
        return true;
    }

    private void StopBouncePhysics()
    {
        DrainDuckBattery();
        RestoreNormalPhysics();
        Destroy(this);
    }

    private void DrainDuckBattery()
    {
        var battery = GetComponentInChildren<ItemBattery>(true);
        if (battery == null) return;

        try
        {
            battery.BatteryFullPercentChange(0, true);
        }
        catch
        {
            try { battery.SetBatteryLife(0); } catch { /* ignore */ }
        }

        foreach (var duck in GetComponentsInChildren<ItemRubberDuck>(true))
        {
            try
            {
                var field = typeof(ItemRubberDuck).GetField("playDuckLoop",
                    BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                field?.SetValue(duck, false);
            }
            catch
            {
                // Best-effort.
            }
        }
    }

    private void RestoreNormalPhysics()
    {
        if (_rb == null) return;

        _rb.velocity = Vector3.zero;
        _rb.angularVelocity = Vector3.zero;
        _rb.isKinematic = false;
        _rb.useGravity = true;
        _rb.drag = 0f;
        _rb.angularDrag = 0.05f;
        _rb.WakeUp();

        foreach (var col in GetComponentsInChildren<Collider>(true))
        {
            if (col.material == null) continue;
            col.material.bounciness = 0f;
            col.material.bounceCombine = PhysicMaterialCombine.Average;
            col.material.dynamicFriction = 0.6f;
            col.material.staticFriction = 0.6f;
        }

        ItemPostSpawnHelper.ReleaseHold(gameObject);
        ItemPostSpawnHelper.EnsureUsablePublic(gameObject);
    }
}

internal sealed class DelayedGrenadeArm : MonoBehaviour
{
    private float _throwSpeed = 9f;
    private int _frames;

    public void Configure(float throwSpeed)
    {
        _throwSpeed = throwSpeed;
        _frames = 0;
    }

    private void Update()
    {
        if (++_frames < 2) return;

        ThrowableHelper.ThrowForward(gameObject, _throwSpeed);
        if (!ThrowableHelper.ArmGrenade(gameObject))
        {
            ThrowableHelper.ArmGrenade(gameObject);
        }

        Destroy(this);
    }
}

internal sealed class FusedGrenadeActivator : MonoBehaviour
{
    public const float DefaultFuseSeconds = -1f;
    private const float SpawnSettleSeconds = 0.12f;
    private const float MaxSpawnWaitSeconds = 2f;

    private float _fuseSeconds = DefaultFuseSeconds;
    private bool _immediate;

    public void Configure(float fuseSeconds, bool immediate = false)
    {
        _fuseSeconds = fuseSeconds;
        _immediate = immediate;
    }

    private void Start()
    {
        StartCoroutine(FuseRoutine());
    }

    private IEnumerator FuseRoutine()
    {
        yield return null;

        var grenade = GetComponentInChildren<ItemGrenade>(true);
        var toggle = GetComponentInChildren<ItemToggle>(true);
        var physGrab = GetComponentInChildren<PhysGrabObject>(true);
        var rb = GetComponentInChildren<Rigidbody>(true);

        var fuseSeconds = _fuseSeconds > 0f
            ? _fuseSeconds
            : ThrowableHelper.DefaultSoloGrenadeFuseSeconds;

        if (!_immediate)
        {
            var grounded = SpawnHelper.SnapToFloor(transform.position, SpawnHelper.ItemGroundOffset);
            transform.position = grounded;
        }

        ItemPostSpawnHelper.HoldInPlace(gameObject);
        yield return new WaitForSeconds(_immediate ? 0.02f : SpawnSettleSeconds);
        ItemPostSpawnHelper.ReleaseHold(gameObject);

        if (rb != null)
        {
            rb.isKinematic = false;
            rb.WakeUp();
            rb.velocity = Vector3.zero;
            rb.angularVelocity = Vector3.zero;
        }

        var waitDeadline = Time.time + MaxSpawnWaitSeconds;
        while (Time.time < waitDeadline && gameObject != null)
        {
            if (physGrab != null && physGrab.spawned)
            {
                break;
            }

            if (rb != null)
            {
                rb.isKinematic = false;
                rb.WakeUp();
            }

            yield return null;
        }

        if (rb != null)
        {
            rb.velocity = Vector3.zero;
            rb.angularVelocity = Vector3.zero;
        }

        if (toggle != null && grenade != null)
        {
            grenade.enabled = true;
            toggle.enabled = true;
            grenade.isSpawnedGrenade = true;

            var tickInterval = grenade.tickTime > 0.05f ? grenade.tickTime : 1f;
            var fuseTicks = Mathf.Max(1, Mathf.RoundToInt(fuseSeconds / tickInterval));
            grenade.tickTime = tickInterval;

            try
            {
                toggle.ToggleItem(true, fuseTicks);
            }
            catch (Exception ex)
            {
                ModLog.Debug($"Grenade ToggleItem: {ex.Message}");
                try { toggle.ToggleItem(true, -1); }
                catch { /* ignore */ }
            }

            Destroy(this);
            yield break;
        }

        yield return new WaitForSeconds(fuseSeconds);
        if (gameObject != null)
        {
            ThrowableHelper.ForceDetonateGrenade(gameObject);
        }

        Destroy(this);
    }
}
