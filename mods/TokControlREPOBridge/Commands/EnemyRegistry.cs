using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using Photon.Pun;
using REPOLib.Modules;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal static class EnemyRegistry
{
    public static string ResolveInternalName(string eventIdOrSlug)
    {
        return RepoEventMap.ResolveEnemyInternalName(eventIdOrSlug);
    }

    public static IEnumerable<string> GetCandidateNames(string query)
    {
        var internalName = ResolveInternalName(query);
        foreach (var name in RepoEventMap.ExpandEnemyResourceNames(internalName))
        {
            yield return name;
        }

        foreach (var name in RepoEventMap.ExpandEnemyResourceNames(query))
        {
            if (!string.Equals(name, internalName, StringComparison.OrdinalIgnoreCase))
            {
                yield return name;
            }
        }
    }

    public static string FormatRepolibList()
    {
        var sb = new StringBuilder();
        if (Enemies.AllEnemies == null)
        {
            sb.AppendLine("(REPOLib AllEnemies is null)");
            return sb.ToString();
        }

        foreach (var setup in Enemies.AllEnemies.OrderBy(s => s?.name, StringComparer.OrdinalIgnoreCase))
        {
            if (setup == null) continue;
            sb.AppendLine(setup.name ?? "(unnamed)");
        }

        return sb.ToString();
    }
}

internal static class EnemySpawnHelper
{
    private const string EnemyPathPrefix = "Enemies/Enemy - ";

    public static bool TrySpawn(string enemyName, Vector3 position, out string? spawnedName)
    {
        spawnedName = EnemyRegistry.ResolveInternalName(enemyName);
        ModLog.Info($"Spawn enemy request '{enemyName}' -> internal '{spawnedName}' at {position}");

        // Prefer Resources/Photon path (instant visible spawn used by classic stream mods).
        if (TrySpawnViaResources(spawnedName, position, out spawnedName))
        {
            return true;
        }

        // Fallback: REPOLib NetworkPrefabs API.
        if (TrySpawnViaRepolib(spawnedName, position, out spawnedName))
        {
            return true;
        }

        LogSpawnDiagnostics(spawnedName ?? enemyName);
        return false;
    }

    private static bool TrySpawnViaRepolib(string targetName, Vector3 position, out string? spawnedName)
    {
        spawnedName = targetName;
        var setup = FindEnemySetup(targetName);
        if (setup == null)
        {
            ModLog.Warn($"REPOLib: no EnemySetup match for '{targetName}'");
            return false;
        }

        try
        {
            // spawnDespawned:false — enemies appear immediately (REPOLib increments SpawnNextEnemiesNotDespawned).
            var parents = Enemies.SpawnEnemy(setup, position, Quaternion.identity, spawnDespawned: false);
            if (parents == null || parents.Count == 0)
            {
                ModLog.Warn($"REPOLib.SpawnEnemy returned empty for '{setup.name}'");
                return false;
            }

            spawnedName = setup.name ?? targetName;
            var any = false;
            foreach (var parent in parents)
            {
                if (parent == null) continue;
                FinalizeRepoLibSpawn(parent, position, setup.name ?? targetName);
                any = true;
            }

            if (any)
            {
                ModLog.Info($"Spawned via REPOLib: {spawnedName} x{parents.Count}");
            }

            return any;
        }
        catch (Exception ex)
        {
            ModLog.Warn($"REPOLib.SpawnEnemy failed for {targetName}: {ex.Message}");
            return false;
        }
    }

    private static void FinalizeRepoLibSpawn(EnemyParent parent, Vector3 position, string internalName)
    {
        try
        {
            if (parent == null) return;
            FinalizeEnemySpawn(parent.gameObject, position, internalName);
            ModLog.Info($"REPOLib enemy ready at {position} ({Vector3.Distance(position, SpawnHelper.GetPlayerBodyPosition()):F1}m)");
        }
        catch (Exception ex)
        {
            ModLog.Warn($"FinalizeRepoLibSpawn: {ex.Message}");
        }
    }

    private static EnemySetup? FindEnemySetup(string targetName)
    {
        if (Enemies.AllEnemies == null || Enemies.AllEnemies.Count == 0)
        {
            ModLog.Warn("REPOLib AllEnemies is empty — is the level loaded?");
            return null;
        }

        EnemySetup? best = null;
        var bestScore = int.MaxValue;

        foreach (var candidate in EnemyRegistry.GetCandidateNames(targetName))
        {
            foreach (var setup in Enemies.AllEnemies)
            {
                if (setup == null) continue;

                var score = ScoreSetupName(setup.name ?? "", candidate);
                // Also match against spawn object names when present
                try
                {
                    if (score < 0 && setup.spawnObjects != null)
                    {
                        foreach (var prefabRef in setup.spawnObjects)
                        {
                            var prefab = prefabRef?.Prefab;
                            if (prefab == null) continue;
                            var s2 = ScoreSetupName(prefab.name ?? "", candidate);
                            if (s2 >= 0 && (score < 0 || s2 < score)) score = s2;
                            var parent = prefab.GetComponent<EnemyParent>();
                            if (parent != null)
                            {
                                var s3 = ScoreSetupName(parent.enemyName ?? "", candidate);
                                if (s3 >= 0 && (score < 0 || s3 < score)) score = s3;
                            }
                        }
                    }
                }
                catch { /* ignore */ }

                if (score >= 0 && score < bestScore)
                {
                    bestScore = score;
                    best = setup;
                }
            }
        }

        if (best != null)
        {
            ModLog.Info($"EnemySetup match '{targetName}' -> '{best.name}' (score={bestScore})");
        }

        return bestScore <= 100 ? best : null;
    }

    private static int ScoreSetupName(string setupName, string term)
    {
        if (string.IsNullOrWhiteSpace(setupName) || string.IsNullOrWhiteSpace(term)) return -1;

        var a = NormalizeToken(setupName).Replace('_', ' ');
        var b = NormalizeToken(term).Replace('_', ' ');

        if (string.Equals(a, b, StringComparison.OrdinalIgnoreCase)) return 0;
        if (a.EndsWith(b, StringComparison.OrdinalIgnoreCase)) return 5;
        if (a.Contains(b, StringComparison.OrdinalIgnoreCase)) return 20 + a.Length;
        if (b.Contains(a, StringComparison.OrdinalIgnoreCase)) return 30 + a.Length;

        return -1;
    }

    private static string NormalizeToken(string value)
    {
        value = value.Trim();
        if (value.StartsWith("Enemy - ", StringComparison.OrdinalIgnoreCase))
        {
            value = value.Substring("Enemy - ".Length);
        }

        return value;
    }

    private static bool TrySpawnViaResources(string targetName, Vector3 position, out string? spawnedName)
    {
        spawnedName = targetName;

        foreach (var candidate in EnemyRegistry.GetCandidateNames(targetName))
        {
            var path = EnemyPathPrefix + candidate;
            var prefab = Resources.Load<GameObject>(path);
            if (prefab == null)
            {
                // Also try spaced form: Thin_Man → Thin Man
                var spaced = candidate.Replace('_', ' ');
                if (!string.Equals(spaced, candidate, StringComparison.Ordinal))
                {
                    path = EnemyPathPrefix + spaced;
                    prefab = Resources.Load<GameObject>(path);
                }
            }
            if (prefab == null)
            {
                ModLog.Debug($"Resources miss: {EnemyPathPrefix}{candidate}");
                continue;
            }

            if (TryInstantiateEnemy(prefab, path, candidate, position))
            {
                spawnedName = candidate;
                ModLog.Info($"Spawned via Resources: {candidate} ({path})");
                return true;
            }
        }

        return false;
    }

    private static bool TryInstantiateEnemy(GameObject prefab, string resourcePath, string displayName, Vector3 position)
    {
        try
        {
            if (RunManager.instance == null)
            {
                ModLog.Warn($"RunManager null — enter a level/map before spawning {displayName}");
                return false;
            }

            RunManager.instance.EnemiesSpawnedRemoveStart();

            GameObject? instance;
            var usePhoton = GameManager.instance != null &&
                            GameManager.instance.gameMode != 0 &&
                            PhotonNetwork.IsConnected &&
                            SemiFunc.IsMasterClientOrSingleplayer();

            // Singleplayer / offline: Instantiate. Multiplayer host: room object on resource path.
            instance = usePhoton
                ? PhotonNetwork.InstantiateRoomObject(resourcePath, position, Quaternion.identity)
                : UnityEngine.Object.Instantiate(prefab, position, Quaternion.identity);

            if (instance == null)
            {
                RunManager.instance.EnemiesSpawnedRemoveEnd();
                return false;
            }

            var parent = instance.GetComponent<EnemyParent>();
            var enemy = instance.GetComponentInChildren<Enemy>(true);
            if (parent != null)
            {
                try
                {
                    var field = typeof(EnemyParent).GetField("SetupDone",
                        System.Reflection.BindingFlags.Instance |
                        System.Reflection.BindingFlags.Public |
                        System.Reflection.BindingFlags.NonPublic);
                    if (field != null && field.FieldType == typeof(bool))
                    {
                        field.SetValue(parent, true);
                    }
                    else
                    {
                        parent.SetupDone = true;
                    }
                }
                catch { try { parent.SetupDone = true; } catch { /* ignore */ } }

                if (enemy != null)
                {
                    EnemySpawnTracker.Track(enemy);
                    enemy.EnemyTeleported(position);
                    try
                    {
                        foreach (var player in PlayerTargeting.AllPlayers())
                        {
                            if (player?.photonView == null) continue;
                            try { enemy.PlayerAdded(player.photonView.ViewID); } catch { /* ignore */ }
                        }
                    }
                    catch { /* ignore */ }
                }

                try
                {
                    if (LevelGenerator.Instance != null)
                    {
                        var field = typeof(LevelGenerator).GetField("EnemiesSpawnTarget",
                            System.Reflection.BindingFlags.Instance |
                            System.Reflection.BindingFlags.Public |
                            System.Reflection.BindingFlags.NonPublic);
                        if (field != null && field.FieldType == typeof(int))
                        {
                            field.SetValue(LevelGenerator.Instance, (int)field.GetValue(LevelGenerator.Instance) + 1);
                        }
                    }
                }
                catch { /* ignore */ }

                EnemyDirector.instance?.FirstSpawnPointAdd(parent);
            }

            RunManager.instance.EnemiesSpawnedRemoveEnd();

            FinalizeEnemySpawn(instance, position, displayName);
            return true;
        }
        catch (Exception ex)
        {
            ModLog.Error($"Instantiate failed for {displayName}: {ex.Message}");
            try { RunManager.instance?.EnemiesSpawnedRemoveEnd(); } catch { /* ignore */ }
            return false;
        }
    }

    private static void TryActivateEnemyNear(Vector3 position)
    {
        EnemyParent? closest = null;
        var bestDist = 4f;

        foreach (var parent in UnityEngine.Object.FindObjectsOfType<EnemyParent>())
        {
            if (parent == null) continue;
            var dist = Vector3.Distance(parent.transform.position, position);
            if (dist >= bestDist) continue;
            bestDist = dist;
            closest = parent;
        }

        if (closest != null)
        {
            FinalizeEnemySpawn(closest.gameObject, position, closest.name);
        }
    }

    private static void FinalizeEnemySpawn(GameObject instance, Vector3 position, string internalName)
    {
        if (instance.GetComponentInChildren<EnemyHeartHugger>(true) != null)
        {
            FinalizeHeartHuggerSpawn(instance, position);
            return;
        }

        var normalized = NormalizeEnemyToken(internalName);
        if (normalized.Contains("bang"))
        {
            FinalizeBangSpawn(instance, position);
            return;
        }

        if (normalized.Contains("gnome"))
        {
            FinalizeGnomeSpawn(instance, position);
            return;
        }

        if (normalized.Contains("ceiling") || normalized.Contains("peeper"))
        {
            FinalizeCeilingEyeSpawn(instance, position);
            return;
        }

        ForceActivateEnemy(instance, position);
    }

    private static string NormalizeEnemyToken(string value)
    {
        value = value.Trim();
        if (value.StartsWith("Enemy - ", StringComparison.OrdinalIgnoreCase))
        {
            value = value.Substring("Enemy - ".Length);
        }

        return value.Replace('_', ' ').Trim().ToLowerInvariant();
    }

    private static void FinalizeBangSpawn(GameObject instance, Vector3 position)
    {
        var director = instance.GetComponentInChildren<EnemyBangDirector>(true);
        var bangs = instance.GetComponentsInChildren<EnemyBang>(true);
        EnemyBang? activeBang = null;

        if (director?.units != null && director.units.Count > 0)
        {
            activeBang = director.units[0];
        }
        else if (bangs.Length > 0)
        {
            activeBang = bangs[0];
        }

        foreach (var bangUnit in bangs)
        {
            if (bangUnit == null || bangUnit == activeBang) continue;
            bangUnit.gameObject.SetActive(false);
            UnityEngine.Object.Destroy(bangUnit.gameObject);
        }

        if (director?.units != null && activeBang != null)
        {
            director.units.RemoveAll(u => u == null || u != activeBang);
        }

        var grounded = SpawnHelper.SnapToFloor(position, SpawnHelper.EnemyGroundOffset);
        instance.SetActive(true);
        instance.transform.position = grounded;

        var parent = instance.GetComponent<EnemyParent>();
        if (parent != null)
        {
            parent.SetupDone = true;
            parent.transform.position = grounded;
        }

        if (activeBang == null)
        {
            AttachNoRespawnGuard(instance);
            ModLog.Warn("Bang spawn: no active unit found");
            return;
        }

        activeBang.gameObject.SetActive(true);
        var enemy = activeBang.GetComponent<Enemy>() ?? activeBang.GetComponentInChildren<Enemy>(true);
        RegisterSpawnedEnemy(enemy, grounded);

        if (director != null)
        {
            director.debugOneOnly = true;
            director.SetupSingle(activeBang);
            director.OnSpawn(activeBang);
        }

        TryInvoke(activeBang, "OnSpawn");

        if (parent != null)
        {
            try { parent.Spawn(); } catch { TryInvoke(parent, "Spawn"); }
            EnemyDirector.instance?.FirstSpawnPointAdd(parent);
        }

        AttachNoRespawnGuard(instance);
        if (enemy != null) EnemyLifetimeGuard.Register(enemy);
    }

    private static void FinalizeGnomeSpawn(GameObject instance, Vector3 position)
    {
        var director = instance.GetComponentInChildren<EnemyGnomeDirector>(true);
        var gnomes = instance.GetComponentsInChildren<EnemyGnome>(true);
        EnemyGnome? activeGnome = null;

        if (director?.gnomes != null && director.gnomes.Count > 0)
        {
            activeGnome = director.gnomes[0];
        }
        else if (gnomes.Length > 0)
        {
            activeGnome = gnomes[0];
        }

        foreach (var gnome in gnomes)
        {
            if (gnome == null || gnome == activeGnome) continue;
            gnome.gameObject.SetActive(false);
            UnityEngine.Object.Destroy(gnome.gameObject);
        }

        if (director?.gnomes != null && activeGnome != null)
        {
            director.gnomes.RemoveAll(g => g == null || g != activeGnome);
        }

        if (activeGnome == null)
        {
            ForceActivateEnemy(instance, position);
            return;
        }

        var grounded = SpawnHelper.SnapToFloor(position, SpawnHelper.EnemyGroundOffset);
        instance.SetActive(true);
        instance.transform.position = grounded;

        var parent = instance.GetComponent<EnemyParent>();
        if (parent != null)
        {
            parent.SetupDone = true;
            parent.transform.position = grounded;
        }

        activeGnome.gameObject.SetActive(true);
        var enemy = activeGnome.GetComponent<Enemy>() ?? activeGnome.GetComponentInChildren<Enemy>(true);
        RegisterSpawnedEnemy(enemy, grounded);

        if (director != null)
        {
            director.debugOneOnly = true;
            director.SetupSingle(activeGnome);
            director.OnSpawn(activeGnome);
        }

        TryInvoke(activeGnome, "OnSpawn");

        if (parent != null)
        {
            try { parent.Spawn(); } catch { TryInvoke(parent, "Spawn"); }
            EnemyDirector.instance?.FirstSpawnPointAdd(parent);
        }

        AttachNoRespawnGuard(instance);
        if (enemy != null) EnemyLifetimeGuard.Register(enemy);
    }

    private static void AttachNoRespawnGuard(GameObject instance)
    {
        var parent = instance.GetComponent<EnemyParent>();
        var enemy = instance.GetComponentInChildren<Enemy>(true);
        if (parent == null || enemy == null) return;

        var guard = instance.GetComponent<DirectorEnemyDeathGuard>() ?? instance.AddComponent<DirectorEnemyDeathGuard>();
        guard.Configure(parent, enemy);
        EnemyLifetimeGuard.Register(enemy);
    }

    private static void FinalizeCeilingEyeSpawn(GameObject instance, Vector3 position)
    {
        var ceilingPos = ResolveCeilingSpawnPosition(position);
        ForceActivateEnemy(instance, ceilingPos);

        var eye = instance.GetComponentInChildren<EnemyCeilingEye>(true);
        if (eye == null) return;

        eye.transform.position = ceilingPos;
        TryInvoke(eye, "OnSpawn");
        TryInvokeEnum(eye, "UpdateState", "Spawn");
        AttachNoRespawnGuard(instance);
    }

    private static Vector3 ResolveCeilingSpawnPosition(Vector3 position)
    {
        var origin = position + Vector3.up * 0.5f;
        if (Physics.Raycast(origin, Vector3.up, out var hit, 12f, ~0, QueryTriggerInteraction.Ignore))
        {
            return hit.point - Vector3.up * 0.15f;
        }

        return origin + Vector3.up * 2.5f;
    }

    private static void FinalizeHeartHuggerSpawn(GameObject instance, Vector3 position)
    {
        var grounded = SpawnHelper.SnapToFloor(position, SpawnHelper.EnemyGroundOffset);
        var parent = instance.GetComponent<EnemyParent>();
        var hugger = instance.GetComponentInChildren<EnemyHeartHugger>(true);

        if (parent != null)
        {
            parent.transform.position = grounded;
        }

        instance.transform.position = grounded;

        if (hugger != null)
        {
            hugger.transform.position = grounded;
            TryInvoke(hugger, "StateSpawn");
            TryInvoke(hugger, "VisualStateNormal");
        }

        if (parent != null)
        {
            EnemyDirector.instance?.FirstSpawnPointAdd(parent);
        }

        AttachNoRespawnGuard(instance);
    }

    private static void ForceActivateEnemy(GameObject instance, Vector3 position)
    {
        instance.SetActive(true);

        // Keep the requested map point — do not re-snap far away after instantiate.
        var grounded = position;
        var parent = instance.GetComponent<EnemyParent>();
        var enemy = instance.GetComponentInChildren<Enemy>(true);

        if (parent != null)
        {
            try
            {
                var field = typeof(EnemyParent).GetField("SetupDone",
                    System.Reflection.BindingFlags.Instance |
                    System.Reflection.BindingFlags.Public |
                    System.Reflection.BindingFlags.NonPublic);
                if (field != null && field.FieldType == typeof(bool))
                {
                    field.SetValue(parent, true);
                }
                else
                {
                    parent.SetupDone = true;
                }
            }
            catch { try { parent.SetupDone = true; } catch { /* ignore */ } }
        }

        if (enemy != null)
        {
            EnemySpawnTracker.Track(enemy);
            enemy.gameObject.SetActive(true);
            try
            {
                foreach (var player in PlayerTargeting.AllPlayers())
                {
                    if (player?.photonView == null) continue;
                    try { enemy.PlayerAdded(player.photonView.ViewID); } catch { /* ignore */ }
                }
            }
            catch { /* ignore */ }

            TryInvoke(enemy, "Spawned");
            TryInvoke(enemy, "WakeUp");
            enemy.EnemyTeleported(grounded);
            enemy.transform.position = grounded;
        }

        if (parent != null)
        {
            parent.transform.position = grounded;
            try { parent.Spawn(); } catch { TryInvoke(parent, "Spawn"); }
        }

        instance.transform.position = grounded;

        if (parent != null)
        {
            EnemyDirector.instance?.FirstSpawnPointAdd(parent);
        }

        AttachNoRespawnGuard(instance);
        EnemyLifetimeGuard.Register(enemy);

        var dist = Vector3.Distance(grounded, SpawnHelper.GetPlayerBodyPosition());
        ModLog.Info($"Enemy activated at {grounded} ({dist:F1}m from player)");
    }

    private static void RegisterSpawnedEnemy(Enemy? enemy, Vector3 grounded)
    {
        if (enemy == null) return;
        EnemySpawnTracker.Track(enemy);
        enemy.gameObject.SetActive(true);
        try
        {
            foreach (var player in PlayerTargeting.AllPlayers())
            {
                if (player?.photonView == null) continue;
                try { enemy.PlayerAdded(player.photonView.ViewID); } catch { /* ignore */ }
            }
        }
        catch { /* ignore */ }

        TryInvoke(enemy, "Spawned");
        TryInvoke(enemy, "WakeUp");
        enemy.EnemyTeleported(grounded);
        enemy.transform.position = grounded;
    }

    private static void TryInvoke(Component comp, string methodName)
    {
        try
        {
            var method = comp.GetType().GetMethod(methodName,
                System.Reflection.BindingFlags.Instance |
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.NonPublic);
            if (method == null || method.GetParameters().Length != 0) return;
            method.Invoke(comp, null);
        }
        catch
        {
            // Best-effort activation.
        }
    }

    private static void TryInvokeEnum(Component comp, string methodName, string enumValueName)
    {
        try
        {
            var method = comp.GetType().GetMethod(methodName,
                System.Reflection.BindingFlags.Instance |
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.NonPublic);
            if (method == null || method.GetParameters().Length != 1) return;

            var enumType = method.GetParameters()[0].ParameterType;
            if (!enumType.IsEnum) return;

            var value = Enum.Parse(enumType, enumValueName);
            method.Invoke(comp, new[] { value });
        }
        catch
        {
            // Best-effort activation.
        }
    }

    private static void TrySetBoolField(Component comp, string fieldName)
    {
        try
        {
            var field = comp.GetType().GetField(fieldName,
                System.Reflection.BindingFlags.Instance |
                System.Reflection.BindingFlags.Public |
                System.Reflection.BindingFlags.NonPublic);
            if (field == null || field.FieldType != typeof(bool)) return;
            field.SetValue(comp, true);
        }
        catch
        {
            // Best-effort activation.
        }
    }

    private static void LogSpawnDiagnostics(string targetName)
    {
        var repolibCount = Enemies.AllEnemies?.Count ?? 0;
        ModLog.Warn(
            $"Enemy spawn failed: '{targetName}' | REPOLib={repolibCount} | RunManager={(RunManager.instance != null)} | MenuLevel={SemiFunc.MenuLevel()}");

        if (repolibCount > 0)
        {
            var sample = string.Join(", ",
                Enemies.AllEnemies.Where(s => s != null).Take(16).Select(s => s.name));
            ModLog.Info($"REPOLib names: {sample}");
        }
    }
}

