using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Photon.Pun;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal static class SpecialEffectHelper
{
    private static readonly string[] RandomNadeKinds = { "stun", "shock", "expl" };

    public static bool SpawnToyCarsAroundPlayer(int count = 5)
    {
        var player = PlayerEffectHelper.GetLocalPlayer();
        if (player == null) return false;

        var center = player.transform.position;
        var spawned = 0;

        for (var i = 0; i < Mathf.Max(1, count); i++)
        {
            var angle = (360f / Mathf.Max(1, count)) * i * Mathf.Deg2Rad;
            var offset = new Vector3(Mathf.Cos(angle), 0f, Mathf.Sin(angle)) * 1.65f;
            var pos = SpawnHelper.ResolveInMapPosition(center + offset, SpawnHelper.ItemGroundOffset, i);

            if (TrySpawnToyCar(pos, out var go))
            {
                var aggressive = UnityEngine.Random.value < 0.2f;
                OrientToyCarToward(go, aggressive
                    ? center + Vector3.up * 0.35f
                    : GetRandomMapDriveTarget(center));
                ActivateToyCar(go, aggressive);
                spawned++;
            }
        }

        return spawned > 0;
    }

    private static bool TrySpawnToyCar(Vector3 pos, out GameObject? spawned)
    {
        spawned = null;

        if (TrySpawnToyCarFromRepolib(pos, out spawned)) return true;
        if (TrySpawnToyCarFromResources(pos, out spawned)) return true;

        return ValuableSpawnHelper.TrySpawn("Toy Car", pos, Quaternion.identity, out _, out spawned)
               && spawned != null;
    }

    private static bool TrySpawnToyCarFromRepolib(Vector3 pos, out GameObject? spawned)
    {
        spawned = null;
        try
        {
            var valuables = REPOLib.Modules.Valuables.AllValuables;
            if (valuables == null) return false;

            foreach (var valuable in valuables.Where(v => v != null && v.IsValid()))
            {
                var prefabName = (valuable.PrefabName ?? "").ToLowerInvariant();
                if (prefabName.Contains("keycard") || prefabName.Contains("key card") || prefabName.Contains("cart"))
                {
                    continue;
                }

                var prefab = valuable.Prefab;
                if (prefab == null || prefab.GetComponentInChildren<ValuableCar>(true) == null)
                {
                    continue;
                }

                spawned = REPOLib.Modules.Valuables.SpawnValuable(valuable, pos, Quaternion.identity);
                if (spawned != null)
                {
                    ModLog.Info($"Spawned toy car via REPOLib: {valuable.PrefabName}");
                    return true;
                }
            }
        }
        catch (Exception ex)
        {
            ModLog.Debug($"Toy car REPOLib search failed: {ex.Message}");
        }

        return false;
    }

    private static bool TrySpawnToyCarFromResources(Vector3 pos, out GameObject? spawned)
    {
        spawned = null;
        try
        {
            foreach (var prefab in Resources.LoadAll<GameObject>("Valuables"))
            {
                if (prefab == null || prefab.GetComponentInChildren<ValuableCar>(true) == null)
                {
                    continue;
                }

                spawned = UnityEngine.Object.Instantiate(prefab, pos, Quaternion.identity);
                if (spawned != null)
                {
                    ModLog.Info($"Spawned toy car via Resources: {prefab.name}");
                    return true;
                }
            }
        }
        catch (Exception ex)
        {
            ModLog.Debug($"Toy car Resources search failed: {ex.Message}");
        }

        return false;
    }

    private static void OrientToyCarToward(GameObject? go, Vector3 target)
    {
        if (go == null) return;

        var dir = target - go.transform.position;
        dir.y = 0f;
        if (dir.sqrMagnitude < 0.01f) return;

        go.transform.rotation = Quaternion.LookRotation(dir.normalized, Vector3.up);
    }

    private static Vector3 GetRandomMapDriveTarget(Vector3 fallback)
    {
        try
        {
            var points = SemiFunc.LevelPointsGetAll();
            if (points != null && points.Count > 0)
            {
                var valid = points.Where(p => p != null).ToList();
                if (valid.Count > 0)
                {
                    return valid[UnityEngine.Random.Range(0, valid.Count)].transform.position;
                }
            }
        }
        catch
        {
            // ignore
        }

        return fallback;
    }

    private static void ActivateToyCar(GameObject? go, bool aggressive)
    {
        if (go == null) return;

        var car = go.GetComponentInChildren<ValuableCar>(true);
        if (car == null) return;

        ReleaseGrabState(go);

        try
        {
            car.TrapStart();
        }
        catch (Exception ex)
        {
            ModLog.Debug($"ActivateToyCar TrapStart failed: {ex.Message}");
        }

        var drive = go.GetComponent<ToyCarDriveBehavior>() ?? go.AddComponent<ToyCarDriveBehavior>();
        drive.Configure(car, aggressive);
    }

    private static void ReleaseGrabState(GameObject go)
    {
        foreach (var rb in go.GetComponentsInChildren<Rigidbody>(true))
        {
            rb.isKinematic = false;
            rb.WakeUp();
            rb.velocity = Vector3.zero;
            rb.angularVelocity = Vector3.zero;
        }

        foreach (var grab in go.GetComponentsInChildren<PhysGrabObject>(true))
        {
            try { grab.enabled = true; } catch { /* ignore */ }
        }
    }

    public static bool SpawnToyPlanesAroundPlayer(int count = 5)
    {
        var player = PlayerEffectHelper.GetLocalPlayer();
        if (player == null) return false;

        var center = player.transform.position;
        var spawned = 0;

        for (var i = 0; i < Mathf.Max(1, count); i++)
        {
            var angle = (360f / Mathf.Max(1, count)) * i * Mathf.Deg2Rad;
            var offset = new Vector3(Mathf.Cos(angle), 0f, Mathf.Sin(angle)) * 0.65f;
            if (TrySpawnToyPlane(center, offset, out var go))
            {
                ActivateToyPlane(go);
                spawned++;
            }
        }

        return spawned > 0;
    }

    private static bool TrySpawnToyPlane(Vector3 nearPlayer, Vector3 horizontalOffset, out GameObject? spawned)
    {
        spawned = null;
        var head = nearPlayer + Vector3.up * 1.55f;
        var pos = head + horizontalOffset;

        try
        {
            var valuables = REPOLib.Modules.Valuables.AllValuables;
            if (valuables != null)
            {
                foreach (var valuable in valuables.Where(v => v != null && v.IsValid()))
                {
                    var prefab = valuable.Prefab;
                    if (prefab == null || prefab.GetComponentInChildren<ValuablePlane>(true) == null) continue;

                    spawned = REPOLib.Modules.Valuables.SpawnValuable(valuable, pos, Quaternion.identity);
                    if (spawned != null)
                    {
                        ModLog.Info($"Spawned toy plane via REPOLib: {valuable.PrefabName}");
                        return true;
                    }
                }
            }
        }
        catch (Exception ex)
        {
            ModLog.Debug($"Toy plane REPOLib search failed: {ex.Message}");
        }

        foreach (var prefab in Resources.LoadAll<GameObject>("Valuables"))
        {
            if (prefab == null || prefab.GetComponentInChildren<ValuablePlane>(true) == null) continue;
            spawned = UnityEngine.Object.Instantiate(prefab, pos, Quaternion.identity);
            if (spawned != null) return true;
        }

        return ValuableSpawnHelper.TrySpawn("Toy Plane", pos, Quaternion.identity, out _, out spawned)
               && spawned != null;
    }

    private static void ActivateToyPlane(GameObject? go)
    {
        if (go == null) return;

        var plane = go.GetComponentInChildren<ValuablePlane>(true);
        if (plane == null) return;

        ReleaseGrabState(go);

        var drive = go.GetComponent<ToyPlaneDriveBehavior>() ?? go.AddComponent<ToyPlaneDriveBehavior>();
        drive.Configure(plane);
    }

    public static bool SpawnItemsAroundPlayer(string itemId, float heightOffset, float radius, int count)
    {
        var player = PlayerEffectHelper.GetLocalPlayer();
        if (player == null) return false;

        var center = player.transform.position + Vector3.up * heightOffset;
        var forward = player.transform.forward;
        forward.y = 0f;
        if (forward.sqrMagnitude < 0.01f) forward = Vector3.forward;
        else forward.Normalize();

        var step = 360f / Mathf.Max(1, count);
        var spawned = 0;
        for (var i = 0; i < Mathf.Max(1, count); i++)
        {
            var rot = Quaternion.AngleAxis(step * i, Vector3.up) * forward * radius;
            var pos = SpawnHelper.ResolveInMapPosition(center + rot, SpawnHelper.ItemGroundOffset, i);
            var go = TrySpawnGameObject(itemId, pos);
            if (go != null)
            {
                ApplySpawnBehavior(go, itemId);
                spawned++;
            }
        }

        return spawned > 0;
    }

    /// <summary>
    /// Periodic eject from the player for durationSec (periodSec between spawns).
    /// Same item key while still running → extend duration (combo stacks time, not parallel streams).
    /// EventContext.StackCount multiplies the added duration (e.g. Rose×5 → 15s×5).
    /// </summary>
    public static bool SpawnItemsFromPlayer(
        string itemId,
        float durationSec,
        float periodSec,
        float height,
        float backOffset,
        float forcePower)
    {
        if (string.IsNullOrWhiteSpace(itemId)) return false;

        var key = "poop:" + itemId.Trim().ToLowerInvariant();
        var stacks = Mathf.Max(1, EventContext.StackCount);
        var addSec = Mathf.Max(0.5f, durationSec) * stacks;
        var period = Mathf.Max(0.05f, periodSec);

        if (_poopRemaining.TryGetValue(key, out var rem) && rem > 0.05f)
        {
            _poopRemaining[key] = rem + addSec;
            ModLog.Info($"Poop '{itemId}' extended +{addSec:0.#}s ×{stacks} → {_poopRemaining[key]:0.#}s");
            return true;
        }

        _poopRemaining[key] = addSec;
        EffectTimerHost.Instance.RunRoutine(PeriodicEjectRoutine(
            key,
            itemId.Trim(),
            period,
            height,
            backOffset,
            forcePower));
        ModLog.Info($"Poop '{itemId}' started {addSec:0.#}s (stacks={stacks}, period={period:0.##}s)");
        return true;
    }

    private static readonly Dictionary<string, float> _poopRemaining = new(StringComparer.OrdinalIgnoreCase);

    private static IEnumerator PeriodicEjectRoutine(
        string key,
        string itemOrGroup,
        float periodSec,
        float height,
        float backOffset,
        float forcePower)
    {
        while (_poopRemaining.TryGetValue(key, out var remaining) && remaining > 0.05f)
        {
            if (!RunGate.IsReadyForGameEvents())
            {
                _poopRemaining.Remove(key);
                yield break;
            }

            var player = PlayerEffectHelper.GetLocalPlayer();
            if (player == null)
            {
                _poopRemaining.Remove(key);
                yield break;
            }

            var tr = player.transform;
            var forward = tr.forward;
            forward.y = 0f;
            if (forward.sqrMagnitude < 0.01f) forward = Vector3.forward;
            else forward.Normalize();

            var spawnName = itemOrGroup;
            if (DropGroupCatalog.IsSimpleGroup(itemOrGroup))
            {
                spawnName = DropGroupCatalog.PickRandom(itemOrGroup) ?? itemOrGroup;
            }

            var pos = tr.position + Vector3.up * height - forward * backOffset;
            var go = TrySpawnGameObject(spawnName, pos);
            if (go != null)
            {
                ApplySpawnBehavior(go, spawnName);
                ActivateEjectedItem(go, spawnName);
                MakeImpactDestructible(go);
                EffectTimerHost.Instance.RunRoutine(EjectForceBurst(go, -forward, forcePower));
            }

            yield return new WaitForSeconds(periodSec);
            if (_poopRemaining.TryGetValue(key, out var left))
            {
                left -= periodSec;
                if (left <= 0.05f) _poopRemaining.Remove(key);
                else _poopRemaining[key] = left;
            }
        }

        _poopRemaining.Remove(key);
    }

    private static IEnumerator EjectForceBurst(GameObject go, Vector3 direction, float forcePower)
    {
        yield return null;
        if (go == null) yield break;

        var rb = go.GetComponentInChildren<Rigidbody>();
        if (rb == null) yield break;

        rb.isKinematic = false;
        rb.WakeUp();
        var dir = direction;
        dir.y = 0f;
        if (dir.sqrMagnitude < 0.01f) dir = Vector3.back;
        else dir.Normalize();

        // Strong valuables (diamonds): scale up so they shatter on impact.
        var impulse = forcePower;
        if (forcePower >= 50f) impulse = forcePower * 1.35f;

        var push = dir * impulse;
        for (var i = 0; i < 3; i++)
        {
            if (go == null || rb == null) yield break;
            rb.AddForce(push, ForceMode.Impulse);
            rb.AddTorque(UnityEngine.Random.insideUnitSphere * 2f, ForceMode.Impulse);
            yield return new WaitForSeconds(0.2f);
        }
    }

    private static void ActivateEjectedItem(GameObject go, string itemId)
    {
        if (go == null) return;
        var lower = (itemId ?? go.name).ToLowerInvariant();

        try
        {
            var toggle = go.GetComponentInChildren<ItemToggle>(true);
            if (toggle != null)
            {
                EffectTimerHost.Instance.RunRoutine(DelayedToggle(toggle));
            }
        }
        catch { /* ignore */ }

        if (lower.Contains("mine") || lower.Contains("grenade") || lower.Contains("nade"))
        {
            try
            {
                ThrowableHelper.ArmWithFuse(go, ThrowableHelper.DefaultSoloGrenadeFuseSeconds, immediate: true);
            }
            catch { /* ignore */ }
        }
    }

    private static IEnumerator DelayedToggle(ItemToggle toggle)
    {
        yield return null;
        if (toggle == null) yield break;
        try { toggle.ToggleItem(true, -1); }
        catch
        {
            try { toggle.ToggleItem(true); } catch { /* ignore */ }
        }
    }

    private static void MakeImpactDestructible(GameObject go)
    {
        if (go == null) return;
        try
        {
            var impact = go.GetComponentInChildren<PhysGrabObjectImpactDetector>(true);
            if (impact == null) return;

            impact.destroyDisable = false;
            SetBoolField(impact, "isIndestructible", false);
            SetFloatField(impact, "indestructibleSpawnTimer", 0f);
            SetBoolField(impact, "destroyDisableTeleport", false);
            SetBoolField(impact, "indestructibleBreakEffects", false);
        }
        catch (Exception ex)
        {
            ModLog.Debug($"MakeImpactDestructible: {ex.Message}");
        }
    }

    private static void SetBoolField(object target, string name, bool value)
    {
        var field = target.GetType().GetField(name,
            System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic);
        if (field != null && field.FieldType == typeof(bool)) field.SetValue(target, value);
    }

    private static void SetFloatField(object target, string name, float value)
    {
        var field = target.GetType().GetField(name,
            System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic);
        if (field != null && field.FieldType == typeof(float)) field.SetValue(target, value);
    }

    /// <summary>Activate Duck / Stun / Shock / Explosive nade with the proven arm+bounce path.</summary>
    public static bool SpawnPrimedActiveNade(string kind) =>
        SpawnPrimedActiveNades(kind, 1);

    /// <summary>
    /// Spawn primed nades in rapid waves of 5 (combo 100 → 20 waves × 5, not 100 at once).
    /// </summary>
    public static bool SpawnPrimedActiveNades(string kind, int count)
    {
        kind = (kind ?? "").Trim().ToLowerInvariant();
        count = Mathf.Clamp(count, 1, 100);
        if (count <= 1)
        {
            return SpawnOnePrimedActiveNade(kind, 0);
        }

        EffectTimerHost.Instance.RunRoutine(SpawnPrimedActiveNadeWaveRoutine(kind, count));
        return true;
    }

    private static IEnumerator SpawnPrimedActiveNadeWaveRoutine(string kind, int count)
    {
        const int waveSize = 5;
        var remaining = count;
        var seq = 0;
        var spawned = 0;

        while (remaining > 0)
        {
            if (!RunGate.IsReadyForGameEvents()) yield break;

            var batch = Mathf.Min(waveSize, remaining);
            for (var i = 0; i < batch; i++)
            {
                if (SpawnOnePrimedActiveNade(kind, seq++))
                {
                    spawned++;
                }
                // Tiny gap so physics/network can settle without looking like one pile
                yield return null;
            }

            remaining -= batch;
            if (remaining > 0)
            {
                yield return new WaitForSeconds(0.06f);
            }
        }

        ModLog.Info($"tok_active_nade '{kind}' wave-spawned x{spawned}");
    }

    private static bool SpawnOnePrimedActiveNade(string kind, int scatterIndex, Vector3? overridePos = null)
    {
        kind = (kind ?? "").Trim().ToLowerInvariant();
        var pos = overridePos ?? SpawnHelper.GetGrenadeSpreadPosition(scatterIndex);
        GameObject? go = null;
        string? label = null;

        switch (kind)
        {
            case "duck":
                go = SpawnActiveItemByTerms(pos, ExpandActiveTerms("active_nade_duck", "Item_Rubber_Duck"), out label, armGrenade: false);
                if (go != null)
                {
                    go.transform.position = pos;
                    ThrowableHelper.ApplyStrongBounce(go, 30f);
                }
                break;

            case "stun":
            case "shock":
            case "expl":
            {
                var fallback = kind switch
                {
                    "stun" => "Item_Grenade_Stun",
                    "shock" => "Item_Grenade_Shockwave",
                    _ => "Item_Grenade_Explosive"
                };
                var eventId = $"active_nade_{kind}";
                go = SpawnActiveItemByTerms(pos, ExpandActiveTerms(eventId, fallback), out label, armGrenade: true);
                if (go != null)
                {
                    go.transform.position = pos;
                    ThrowableHelper.ArmWithFuse(go, ThrowableHelper.DefaultSoloGrenadeFuseSeconds, immediate: true);
                }
                break;
            }

            default:
                return false;
        }

        if (go == null)
        {
            ModLog.Warn($"tok_active_nade '{kind}' spawn failed");
            return false;
        }

        ModLog.Info($"tok_active_nade '{kind}' spawned ({label})");
        return true;
    }

    private static readonly string[] RandomSpeakLines =
    {
        "Help me!",
        "Watch out!",
        "I got this!",
        "Run!",
        "Oh no!",
        "Don't leave me!",
        "That was close!",
        "I need backup!",
        "Grab that!",
        "Why is it always me?",
        "This is fine.",
        "Chat did this!",
        "Not again...",
        "Someone save me!",
        "I blame the stream!"
    };

    /// <summary>Pick a random line, then make every alive player speak it.</summary>
    public static bool AllPlayersSpeak()
    {
        var alive = PlayerTargeting.AlivePlayers();
        var local = PlayerEffectHelper.GetLocalPlayer();
        if (local == null && alive.Count == 0) return false;

        var line = RandomSpeakLines[UnityEngine.Random.Range(0, RandomSpeakLines.Length)];
        SpeakHelper.SpeakOnAllPlayers(line);
        ModLog.Info($"All players speak: {line} ({Mathf.Max(alive.Count, 1)} voices)");
        return true;
    }

    /// <summary>Legacy alias — Voice Troll / MASS now always speak on everyone.</summary>
    public static bool RandomPlayerSpeak() => AllPlayersSpeak();

    /// <summary>Primed grenades burst out from every alive player's body.</summary>
    public static bool SpawnNadesFromAllPlayers(string kind = "expl", int perPlayer = 1)
    {
        kind = (kind ?? "expl").Trim().ToLowerInvariant();
        if (kind is not ("stun" or "shock" or "expl" or "duck"))
        {
            kind = "expl";
        }

        perPlayer = Mathf.Clamp(perPlayer, 1, 5);
        var players = PlayerTargeting.AlivePlayers();
        if (players.Count == 0) return false;

        EffectTimerHost.Instance.RunRoutine(SpawnNadesFromAllPlayersRoutine(kind, perPlayer, players));
        return true;
    }

    private static IEnumerator SpawnNadesFromAllPlayersRoutine(string kind, int perPlayer, List<PlayerAvatar> players)
    {
        var spawned = 0;
        var seq = 0;
        foreach (var player in players)
        {
            if (player == null) continue;
            if (!RunGate.IsReadyForGameEvents()) yield break;

            for (var i = 0; i < perPlayer; i++)
            {
                var offset = UnityEngine.Random.insideUnitSphere * 0.45f;
                offset.y = Mathf.Abs(offset.y) + 1.1f;
                var pos = player.transform.position + offset;
                if (SpawnOnePrimedActiveNade(kind, seq++, pos))
                {
                    spawned++;
                }
                yield return null;
            }

            yield return new WaitForSeconds(0.04f);
        }

        ModLog.Info($"nade_from_all_players '{kind}' spawned x{spawned} across {players.Count} players");
    }

    private static string[] ExpandActiveTerms(string eventId, string fallback)
    {
        if (RepoEventMap.TryGetActiveItem(eventId, out var mapped))
        {
            return RepoEventMap.ExpandItemSearchIds(mapped).Distinct().ToArray();
        }

        return RepoEventMap.ExpandItemSearchIds(fallback).Distinct().ToArray();
    }

    private static GameObject? SpawnActiveItemByTerms(Vector3 pos, string[] terms, out string? label, bool armGrenade)
    {
        label = terms.Length > 0 ? terms[0] : null;
        foreach (var term in terms)
        {
            var go = ItemSpawnHelper.TrySpawn(term, pos, Quaternion.identity, out var spawnedLabel, 0, holdInPlace: true, skipGrenadeDormant: armGrenade);
            if (go == null) continue;
            label = spawnedLabel ?? term;
            return go;
        }

        return null;
    }

    public static bool TeleportPlayerRandomPoint(bool startRoom, bool allPlayers)
    {
        var players = GetPlayerTargets(allPlayers).ToList();
        if (players.Count == 0) return false;

        var applied = false;
        foreach (var player in players)
        {
            if (!startRoom && ArenaHelper.IsPlayerInCrownArenaBeforeStart(player))
            {
                var dropPos = ArenaHelper.GetCrownArenaDropPosition();
                if (TeleportPlayer(player, dropPos))
                {
                    EffectTimerHost.Instance.RunRoutine(CrownArenaFallDamageRoutine(player, 100));
                    applied = true;
                }

                continue;
            }

            var pos = GetRandomTeleportPoint(startRoom, player.transform.position);
            if (!pos.HasValue) continue;
            if (TeleportPlayer(player, pos.Value)) applied = true;
        }

        return applied;
    }

    private static IEnumerator CrownArenaFallDamageRoutine(PlayerAvatar player, int damage)
    {
        yield return new WaitForSeconds(0.35f);

        var waited = 0f;
        var wasFalling = false;
        while (waited < 10f && player != null)
        {
            var yVel = PlayerController.instance != null && PlayerEffectHelper.GetLocalPlayer() == player
                ? PlayerController.instance.Velocity.y
                : 0f;

            if (yVel < -1f) wasFalling = true;

            if (wasFalling && Mathf.Abs(yVel) < 0.35f)
            {
                player.playerHealth?.HurtOther(damage, Vector3.zero, false, -1, false);
                yield break;
            }

            waited += Time.deltaTime;
            yield return null;
        }
    }

    public static bool TeleportShufflePlayers()
    {
        var players = UnityEngine.Object.FindObjectsOfType<PlayerAvatar>()
            .Where(p => p != null && p.isActiveAndEnabled)
            .ToList();
        if (players.Count < 2) return false;

        var positions = players.Select(p => p.transform.position).ToList();
        for (var i = positions.Count - 1; i > 0; i--)
        {
            var j = UnityEngine.Random.Range(0, i + 1);
            (positions[i], positions[j]) = (positions[j], positions[i]);
        }

        for (var i = 0; i < players.Count; i++)
        {
            TeleportPlayer(players[i], positions[i]);
        }

        return true;
    }

    public static bool ResurrectPlayers(bool allPlayers, bool randomOnly)
    {
        var dead = PlayerTargeting.GetDeadEventTargets(allPlayers);
        if (dead.Count == 0)
        {
            ModLog.Info("ResurrectPlayers: all players are alive");
            return false;
        }

        IEnumerable<PlayerAvatar> targets = dead;
        if (randomOnly)
        {
            targets = new[] { dead[UnityEngine.Random.Range(0, dead.Count)] };
        }

        var revived = 0;
        foreach (var player in targets)
        {
            if (TryRevivePlayer(player)) revived++;
        }

        ModLog.Info($"ResurrectPlayers: try to resurrect player — revived {revived}/{dead.Count}");
        return revived > 0;
    }

    public static bool ResurrectClosestDeadPlayer()
    {
        var dead = PlayerTargeting.DeadPlayers();
        if (dead.Count == 0)
        {
            ModLog.Info("ResurrectClosestDeadPlayer: all players are alive");
            return false;
        }

        var anchor = GetLocalOrOwnedAvatar()?.transform.position ?? dead[0].transform.position;
        var target = dead
            .OrderBy(p => Vector3.SqrMagnitude(p.transform.position - anchor))
            .First();
        return TryRevivePlayer(target);
    }

    internal static List<PlayerAvatar> GetAllPlayerAvatars()
    {
        try
        {
            var list = SemiFunc.PlayerGetList();
            if (list != null && list.Count > 0)
            {
                return list.Where(p => p != null).ToList();
            }
        }
        catch (Exception ex)
        {
            ModLog.Debug($"PlayerGetList failed: {ex.Message}");
        }

        return UnityEngine.Object.FindObjectsOfType<PlayerAvatar>()
            .Where(p => p != null)
            .ToList();
    }

    private static PlayerAvatar? GetLocalOrOwnedAvatar()
    {
        var local = PlayerEffectHelper.GetLocalPlayer();
        if (local != null) return local;

        return GetAllPlayerAvatars()
            .FirstOrDefault(p => p.photonView != null && p.photonView.IsMine);
    }

    private static bool NeedsRevive(PlayerAvatar player) => PlayerTargeting.IsPlayerDead(player);

    private static bool IsPlayerDead(PlayerAvatar player) => PlayerTargeting.IsPlayerDead(player);

    public static bool ShufflePlayersHp()
    {
        var players = PlayerTargeting.AlivePlayers()
            .Where(p => p?.playerHealth != null)
            .ToList();
        if (players.Count < 2) return false;

        var healths = players.Select(p => p.playerHealth.health).ToList();
        for (var i = healths.Count - 1; i > 0; i--)
        {
            var j = UnityEngine.Random.Range(0, i + 1);
            (healths[i], healths[j]) = (healths[j], healths[i]);
        }

        for (var i = 0; i < players.Count; i++)
        {
            ApplyHealth(players[i], healths[i]);
        }

        return true;
    }

    public static bool AveragePlayersHp()
    {
        var players = PlayerTargeting.AlivePlayers()
            .Where(p => p?.playerHealth != null)
            .ToList();
        if (players.Count == 0) return false;

        var avg = Mathf.RoundToInt((float)players.Average(p => p.playerHealth.health));
        foreach (var player in players)
        {
            ApplyHealth(player, avg);
        }

        return true;
    }

    public static bool ExplodeClosestItem(float rangeX, float rangeY, float damage)
    {
        var player = PlayerEffectHelper.GetLocalPlayer();
        if (player == null) return false;

        var origin = player.transform.position;
        PhysGrabObject? closest = null;
        var best = float.MaxValue;

        foreach (var item in UnityEngine.Object.FindObjectsOfType<PhysGrabObject>())
        {
            if (item == null) continue;
            var delta = item.transform.position - origin;
            if (Mathf.Abs(delta.x) > rangeX || Mathf.Abs(delta.y) > rangeY || Mathf.Abs(delta.z) > rangeX)
            {
                continue;
            }

            var dist = delta.sqrMagnitude;
            if (dist >= best) continue;
            best = dist;
            closest = item;
        }

        if (closest == null) return false;

        try
        {
            var toggle = closest.GetComponentInChildren<ItemToggle>(true);
            toggle?.ToggleItem(true);
        }
        catch { /* ignore */ }

        try
        {
            var rb = closest.GetComponentInChildren<Rigidbody>();
            if (rb != null)
            {
                rb.isKinematic = false;
                rb.AddExplosionForce(Mathf.Max(8f, damage * 4f), origin, Mathf.Max(rangeX, rangeY), 2f, ForceMode.Impulse);
            }
        }
        catch { /* ignore */ }

        return true;
    }

    public static void ActivateSpawnedActiveItem(GameObject go)
    {
        if (go == null) return;
        ApplySpawnBehavior(go, go.name);

        try
        {
            var duck = go.GetComponentInChildren<ItemRubberDuck>(true);
            if (duck != null)
            {
                ThrowableHelper.ApplyStrongBounce(go, 30f);
            }
        }
        catch { /* ignore */ }

        try
        {
            var toggle = go.GetComponentInChildren<ItemToggle>(true);
            if (toggle != null)
            {
                EffectTimerHost.Instance.RunRoutine(DelayedToggle(toggle));
            }
        }
        catch { /* ignore */ }

        try
        {
            ThrowableHelper.ArmWithFuse(go, ThrowableHelper.DefaultSoloGrenadeFuseSeconds, immediate: true);
        }
        catch { /* ignore */ }
    }

    public static bool ChangeExtractGoalPercent(float multiplier)
    {
        var round = RoundDirector.instance;
        if (round == null) return false;

        var extractionPoint = round.extractionPointCurrent;
        if (extractionPoint == null) return false;

        var current = round.extractionHaulGoal;
        if (current <= 0) current = extractionPoint.haulGoal;
        if (current <= 0) return false;

        var next = Mathf.Max(1, Mathf.RoundToInt(current * multiplier));
        extractionPoint.HaulGoalSet(next);
        ModLog.Info($"Loot goal changed: {current} -> {next} (x{multiplier:0.##})");
        return true;
    }

    public static bool ShakeCartItems(float minDelay, float maxDelay, float minForce, float maxForce)
    {
        var carts = CartHelper.GetAllCarts();
        if (carts.Length == 0) return false;

        CartHelper.ShakeItemsInAllCarts(minForce, maxForce, minDelay, maxDelay);
        return true;
    }

    public static bool TeleportCarts(bool toStart)
    {
        return CartHelper.TeleportAllCarts(toStart);
    }

    public static bool StunEnemies(float seconds)
    {
        var enemies = UnityEngine.Object.FindObjectsOfType<Enemy>()
            .Where(e => e != null && e.isActiveAndEnabled)
            .ToList();
        if (enemies.Count == 0) return false;

        foreach (var enemy in enemies)
        {
            TryStunEnemy(enemy, seconds);
        }

        return true;
    }

    public static bool ExplodeRandomPlayer()
    {
        var players = PlayerTargeting.AlivePlayers();
        if (players.Count == 0) return false;

        players[UnityEngine.Random.Range(0, players.Count)].PlayerDeath(-1);
        return true;
    }

    private static IEnumerator SpawnFromPlayerRoutine(string itemId, int count, float interval, float spread, float force, float angleDeg, bool armFuse)
    {
        var player = PlayerEffectHelper.GetLocalPlayer();
        if (player == null) yield break;

        for (var i = 0; i < Mathf.Max(1, count); i++)
        {
            var pos = GetRearSpawnPosition(player, spread);
            var go = TrySpawnGameObject(itemId, pos);
            if (go != null)
            {
                if (IsDiamondItem(itemId))
                {
                    ImpactLaunchHelper.PrepareForImpactBreak(go);
                    ImpactLaunchHelper.LaunchBackwardBurst(go, player, force);
                }
                else
                {
                    LaunchFromPlayer(go, player, force, angleDeg);
                }
                if (armFuse)
                {
                    ThrowableHelper.ArmWithFuse(go);
                }
            }

            if (interval > 0f && i < count - 1)
            {
                yield return new WaitForSeconds(interval);
            }
        }
    }

    private static IEnumerator PoopRandomNadesRoutine(int count, float interval, float spread, float force, float angleDeg)
    {
        for (var i = 0; i < Mathf.Max(1, count); i++)
        {
            var kind = RandomNadeKinds[UnityEngine.Random.Range(0, RandomNadeKinds.Length)];
            var player = PlayerEffectHelper.GetLocalPlayer();
            if (player != null)
            {
                var pos = GetRearSpawnPosition(player, spread);
                var terms = kind switch
                {
                    "stun" => new[] { "Item_Grenade_Stun" },
                    "shock" => new[] { "Item_Grenade_Shockwave" },
                    _ => new[] { "Item_Grenade_Explosive" }
                };

                foreach (var term in terms)
                {
                    var go = ItemSpawnHelper.TrySpawn(term, pos, Quaternion.identity, out _, holdInPlace: false);
                    if (go != null)
                    {
                        LaunchFromPlayer(go, player, force, angleDeg);
                        ThrowableHelper.ArmWithFuse(go);
                        break;
                    }
                }
            }

            if (interval > 0f && i < count - 1)
            {
                yield return new WaitForSeconds(interval);
            }
        }
    }

    private static IEnumerator PoopMinesRoutine(int count, float interval)
    {
        var player = PlayerEffectHelper.GetLocalPlayer();
        if (player == null) yield break;

        for (var i = 0; i < count; i++)
        {
            var pos = GetRearSpawnPosition(player, 0.35f);
            var go = ItemSpawnHelper.TrySpawn("Item_Mine_Explosive", pos, Quaternion.identity, out _, holdInPlace: false);
            if (go != null)
            {
                LaunchFromPlayer(go, player, 6f, 30f);
                ThrowableHelper.ArmWithFuse(go);
            }

            if (i < count - 1)
            {
                yield return new WaitForSeconds(interval);
            }
        }
    }

    private static IEnumerator PoopShockMinesRoutine(int count, float interval)
    {
        var player = PlayerEffectHelper.GetLocalPlayer();
        if (player == null) yield break;

        for (var i = 0; i < count; i++)
        {
            var pos = GetRearSpawnPosition(player, 0.35f);
            var go = ItemSpawnHelper.TrySpawn("Item_Mine_Shockwave", pos, Quaternion.identity, out _, holdInPlace: false);
            if (go != null)
            {
                LaunchFromPlayer(go, player, 6f, 30f);
                ThrowableHelper.ArmWithFuse(go);
            }

            if (i < count - 1)
            {
                yield return new WaitForSeconds(interval);
            }
        }
    }


    private static GameObject? TrySpawnGameObject(string itemId, Vector3 pos)
    {
        if (itemId.StartsWith("Valuable_", StringComparison.OrdinalIgnoreCase))
        {
            return ValuableSpawnHelper.TrySpawn(itemId, pos, Quaternion.identity, out _, out var spawned)
                ? spawned
                : null;
        }

        return ItemSpawnHelper.TrySpawn(itemId, pos, Quaternion.identity, out _, holdInPlace: false);
    }

    private static void ApplySpawnBehavior(GameObject go, string itemId)
    {
        var lower = itemId.ToLowerInvariant();
        if (lower.Contains("frog"))
        {
            var hop = go.GetComponent<FrogHopBehavior>() ?? go.AddComponent<FrogHopBehavior>();
            hop.Configure();
            return;
        }

        if (lower.Contains("car") && !lower.Contains("cart"))
        {
            ActivateToyCar(go, aggressive: false);
        }
    }

    private static bool IsDiamondItem(string itemId) =>
        itemId.IndexOf("diamond", StringComparison.OrdinalIgnoreCase) >= 0;

    private static void LaunchFromPlayer(GameObject go, PlayerAvatar player, float force, float angleDeg)
    {
        var rb = go.GetComponentInChildren<Rigidbody>();
        if (rb == null) return;

        rb.isKinematic = false;
        rb.WakeUp();
        rb.velocity = Vector3.zero;
        rb.angularVelocity = Vector3.zero;
        rb.position = GetRearSpawnPosition(player, 0f);

        var back = -player.transform.forward;
        back.y = 0f;
        if (back.sqrMagnitude < 0.01f) back = player.transform.forward * -1f;
        back.Normalize();

        var launchDir = (back + Vector3.up * Mathf.Tan(angleDeg * Mathf.Deg2Rad)).normalized;
        rb.AddForce(launchDir * force, ForceMode.VelocityChange);
        rb.AddTorque(UnityEngine.Random.insideUnitSphere * 8f, ForceMode.Impulse);
    }

    private static Vector3 GetRearSpawnPosition(PlayerAvatar player, float spread)
    {
        var back = -player.transform.forward.normalized;
        var side = player.transform.right * UnityEngine.Random.Range(-spread, spread);
        var candidate = player.transform.position + back * 0.55f + side + Vector3.up * 0.75f;
        return SpawnHelper.ResolveInMapPosition(candidate, SpawnHelper.ItemGroundOffset, 0);
    }

    private static IEnumerable<PlayerAvatar> GetPlayerTargets(bool massEffect) =>
        PlayerTargeting.GetAliveEventTargets(massEffect);

    private static Vector3? GetRandomTeleportPoint(bool startRoom, Vector3 near)
    {
        try
        {
            if (startRoom)
            {
                return CartHelper.GetRandomPlayerSpawnPoint(near);
            }

            var allPoints = SemiFunc.LevelPointsGetAll();
            if (allPoints != null && allPoints.Count > 0)
            {
                var playerRooms = SemiFunc.LevelPointsGetInPlayerRooms() ?? new List<LevelPoint>();
                var candidates = allPoints.Where(p => p != null && !playerRooms.Contains(p)).ToList();
                if (candidates.Count == 0) candidates = allPoints.Where(p => p != null).ToList();
                if (candidates.Count > 0)
                {
                    var levelPoint = candidates[UnityEngine.Random.Range(0, candidates.Count)];
                    return SpawnHelper.ResolveInMapPosition(levelPoint.transform.position, SpawnHelper.ItemGroundOffset, 0);
                }
            }
        }
        catch (Exception ex)
        {
            ModLog.Debug($"GetRandomTeleportPoint failed: {ex.Message}");
        }

        return SpawnHelper.TryGetNearbyLevelPointSpawn(UnityEngine.Random.Range(0, 12))
               ?? SpawnHelper.TryGetStartRoomLevelPoint(0);
    }

    private static bool TeleportPlayer(PlayerAvatar player, Vector3 position)
    {
        if (player == null) return false;

        var grounded = SpawnHelper.SnapToFloor(position, SpawnHelper.ItemGroundOffset + 0.1f);
        var rot = Quaternion.identity;

        try { player.physGrabber?.ReleaseObject(-1, 0.2f); } catch { /* ignore */ }

        try { player.Spawn(grounded, rot); } catch (Exception ex) { ModLog.Debug($"Player.Spawn failed: {ex.Message}"); }

        player.transform.position = grounded;
        player.transform.rotation = rot;

        if (player.playerAvatarVisuals != null)
        {
            player.playerAvatarVisuals.transform.position = grounded;
            TrySetVector3(player.playerAvatarVisuals, "visualPosition", grounded);
        }

        var local = PlayerEffectHelper.GetLocalPlayer();
        if (local == player && PlayerController.instance != null)
        {
            var pc = PlayerController.instance;
            pc.CollisionController?.ResetFalling();
            pc.VelocityRelative = Vector3.zero;
            pc.Velocity = Vector3.zero;

            if (ReadField(pc, "rb") is Rigidbody rb)
            {
                rb.velocity = Vector3.zero;
                rb.angularVelocity = Vector3.zero;
                rb.position = grounded;
                rb.rotation = rot;
            }

            TrySetVector3(pc, "clientPosition", grounded);
            TrySetVector3(pc, "clientPositionCurrent", grounded);
            TrySetQuaternion(pc, "clientRotation", rot);
            TrySetQuaternion(pc, "clientRotationCurrent", rot);
            TrySetVector3(pc, "spawnPosition", grounded);
            TrySetQuaternion(pc, "spawnRotation", rot);
            TrySetVector3(pc, "rbVelocityRaw", Vector3.zero);
            TrySetFloat(pc, "MoveForceAmount", 0f);
        }

        try { player.playerHealth?.InvincibleSet(0.35f); } catch { /* ignore */ }
        return true;
    }

    private static bool TryRevivePlayer(PlayerAvatar player)
    {
        if (player == null) return false;
        if (!NeedsRevive(player)) return false;

        // ReviveRPC is MasterOnly — must run on host / singleplayer.
        if (SemiFunc.IsMultiplayer() && !SemiFunc.IsMasterClientOrSingleplayer())
        {
            ModLog.Warn("Revive skipped: not lobby host");
            return false;
        }

        if (player.playerDeathHead == null)
        {
            ModLog.Warn($"Revive failed for '{player.name}': missing death head");
            return false;
        }

        try
        {
            ModLog.Info($"Reviving '{player.name}' via PlayerAvatar.Revive");
            // Vanilla path: RPCs ReviveRPC to everyone, re-enables controls, stops spectate,
            // syncs alive state so teammates see the player living again.
            player.Revive(false);
        }
        catch (Exception ex)
        {
            ModLog.Warn($"Revive threw: {ex.Message}");
            return false;
        }

        // Do NOT call PlayerDeathDone / SpawnRPC / flag hacks after this —
        // PlayerDeathDone sets isDisabled=true again (ghost body, no grab, friends still see dead).

        var ok = !player.isDisabled && !NeedsRevive(player);
        if (!ok)
        {
            // One frame later some death timers may still look "dead"; re-check lightly.
            ok = !player.isDisabled;
        }

        ModLog.Info($"Revive result for '{player.name}': disabled={player.isDisabled} ok={ok}");
        return ok || !player.isDisabled;
    }

    private static void ApplyHealth(PlayerAvatar player, int targetHealth)
    {
        if (player?.playerHealth == null) return;
        var max = player.playerHealth.maxHealth;
        var clamped = Mathf.Clamp(targetHealth, 1, max);
        var delta = clamped - player.playerHealth.health;
        if (delta > 0) player.playerHealth.HealOther(delta, true);
        else if (delta < 0) player.playerHealth.HurtOther(-delta, Vector3.zero, false, -1, false);
    }


    private static void TryStunEnemy(Enemy enemy, float seconds)
    {
        if (TryInvoke(enemy, "Stun", seconds)
            || TryInvoke(enemy, "EnemyStun", seconds)
            || TryInvoke(enemy, "Freeze", seconds)
            || TryInvoke(enemy, "Stunned", seconds))
        {
            return;
        }

        TrySetBool(enemy, "stunned", true);
        TrySetBool(enemy, "frozen", true);
        TrySetFloat(enemy, "stunTimer", seconds);
        TrySetFloat(enemy, "freezeTimer", seconds);

        EffectTimerHost.Instance.RunForSeconds($"stun_{enemy.GetInstanceID()}", seconds, _ => { }, () =>
        {
            if (enemy == null) return;
            TrySetBool(enemy, "stunned", false);
            TrySetBool(enemy, "frozen", false);
        });
    }

    private static bool TryInvoke(object target, string methodName, float arg)
    {
        try
        {
            var method = target.GetType().GetMethod(methodName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (method == null) return false;
            var parms = method.GetParameters();
            if (parms.Length == 1 && parms[0].ParameterType == typeof(float))
            {
                method.Invoke(target, new object[] { arg });
                return true;
            }
        }
        catch (Exception ex)
        {
            ModLog.Debug($"Invoke {methodName} failed: {ex.Message}");
        }

        return false;
    }

    private static bool TryInvoke(object target, string methodName)
    {
        try
        {
            var method = target.GetType().GetMethod(methodName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (method == null || method.GetParameters().Length != 0) return false;
            method.Invoke(target, null);
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryReadBool(object target, string fieldName)
    {
        try
        {
            var field = target.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            return field != null && field.FieldType == typeof(bool) && (bool)field.GetValue(target);
        }
        catch
        {
            return false;
        }
    }

    private static void TrySetFloat(object target, string fieldName, float value)
    {
        try
        {
            var field = target.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field != null && field.FieldType == typeof(float))
            {
                field.SetValue(target, value);
            }
        }
        catch
        {
            // ignore
        }
    }

    private static void TrySetBool(object target, string fieldName, bool value)
    {
        try
        {
            var field = target.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field != null && field.FieldType == typeof(bool))
            {
                field.SetValue(target, value);
            }
        }
        catch
        {
            // ignore
        }
    }

    private static void TrySetVector3(object target, string fieldName, Vector3 value)
    {
        try
        {
            var field = target.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field != null && field.FieldType == typeof(Vector3))
            {
                field.SetValue(target, value);
            }
        }
        catch
        {
            // ignore
        }
    }

    private static void TrySetQuaternion(object target, string fieldName, Quaternion value)
    {
        try
        {
            var field = target.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field != null && field.FieldType == typeof(Quaternion))
            {
                field.SetValue(target, value);
            }
        }
        catch
        {
            // ignore
        }
    }

    private static object? ReadField(object target, string fieldName)
    {
        try
        {
            var field = target.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            return field?.GetValue(target);
        }
        catch
        {
            return null;
        }
    }
}
