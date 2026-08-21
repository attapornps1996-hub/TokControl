using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using TokControlREPOBridge.Logging;
using TokControlREPOBridge.Ui;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal static class SpawnHelper
{
    public const float ItemForwardBase = 1.1f;
    public const float ItemForwardSpread = 0.45f;
    public const float ItemEyeHeightFallback = 1.45f;
    public const float EnemyForwardOffset = 3f;
    public const float SellPointForwardOffset = 2.5f;

    public const float ItemGroundOffset = 0.35f;
    public const float EnemyGroundOffset = 0.2f;
    public const float ValuableGroundOffset = 0.35f;
    public const float MaxSpawnDistanceFromLevelPoint = 16f;
    public const float MinEnemySpawnDistance = 2.5f;
    public const float MaxEnemyDoorSpawnDistance = 18f;
    public const float ActiveNadeForwardDistance = 0.65f;
    public const float WallCheckDistance = 1.6f;

    public static Vector3 GetItemSpawnPosition(int index = 0)
    {
        return GetItemSpawnPosition(0f, 1f, index);
    }

    /// <summary>Spawn in front of the player at eye level (do not snap to floor).</summary>
    public static Vector3 GetItemSpawnPosition(float length, float height, int index = 0)
    {
        var player = EventContext.SoloTarget() ?? SemiFunc.PlayerAvatarLocal();
        if (player == null)
        {
            return GetEyeLevelPositionInFront(index, Mathf.Max(ItemForwardBase, length + 0.5f));
        }

        var tr = player.transform;
        var forward = GetSpawnForwardDirection();
        var right = Vector3.Cross(Vector3.up, forward).normalized;
        var lateral = (index % 5 - 2f) * 0.12f;

        // commands.data often uses length=0 — still push slightly forward so it isn't inside the player
        var forwardDist = length > 0.05f ? length : ItemForwardBase;
        var eyeHeight = height > 0.2f ? height : ItemEyeHeightFallback;

        // Prefer camera height when available
        try
        {
            if (player.localCamera != null)
            {
                var camY = player.localCamera.transform.position.y - tr.position.y;
                if (camY > 0.8f) eyeHeight = Mathf.Max(eyeHeight, camY);
            }
        }
        catch { /* ignore */ }

        var pos = tr.position
                  + forward * forwardDist
                  + Vector3.up * eyeHeight
                  + right * lateral;

        return KeepEyeLevelPosition(pos, eyeHeight);
    }

    /// <summary>Preserve eye-level Y; only nudge horizontally if blocked by a wall.</summary>
    public static Vector3 KeepEyeLevelPosition(Vector3 candidate, float eyeHeight)
    {
        var body = GetPlayerBodyPosition();
        var minY = body.y + Mathf.Max(0.95f, eyeHeight * 0.75f);
        var pos = candidate;
        if (pos.y < minY) pos.y = minY;

        var forward = GetSpawnForwardDirection();
        var origin = body + Vector3.up * GetEyeHeightOffset();
        var toPos = pos - origin;
        toPos.y = 0f;
        if (toPos.sqrMagnitude > 0.01f
            && Physics.Raycast(origin, toPos.normalized, out var hit, toPos.magnitude + 0.15f, ~0, QueryTriggerInteraction.Ignore)
            && hit.normal.y < 0.55f)
        {
            pos = body - forward * ItemForwardBase + Vector3.up * (pos.y - body.y);
            if (pos.y < minY) pos.y = minY;
        }

        return pos;
    }

    public static Vector3 GetActiveItemSpawnPosition(int index = 0)
    {
        return GetItemSpawnPosition(ActiveNadeForwardDistance, ItemEyeHeightFallback, index);
    }

    public static void GetItemOffsetForName(string itemName, out float length, out float height)
    {
        length = 0f;
        height = 1f;
        var n = (itemName ?? "").ToLowerInvariant();
        if (n.Contains("cart") || n.Contains("vehicle") || n.Contains("scooter"))
        {
            length = 1f;
            height = 1f;
        }
    }

    public static Vector3 GetValuableSpawnPosition(int index = 0)
    {
        return GetItemSpawnPosition(0f, 1f, index);
    }

    public static Vector3 GetEnemySpawnPosition(int index = 0)
    {
        return GetInstantEnemySpawnPosition(index);
    }

    /// <summary>
    /// Enemy spawn near the player on the floor (simple + reliable).
    /// </summary>
    public static Vector3 GetInstantEnemySpawnPosition(int index = 0)
    {
        var playerPos = GetPlayerBodyPosition();
        var forward = GetPlayerBodyForward();

        // Prefer closest level point that is not on top of the player.
        var point = TryGetClosestLevelPointToPlayer(playerPos, index);
        if (point.HasValue)
        {
            return ClampEnemySpawnNearPlayer(point.Value);
        }

        // Fallback: a few meters in front / around the player.
        var angle = 35f + index * 40f;
        var dist = 3.5f + index * 0.35f;
        var dir = Quaternion.Euler(0f, angle, 0f) * forward;
        return SnapToFloor(playerPos + dir.normalized * dist, EnemyGroundOffset);
    }

    public static Vector3 GetEnemyFallbackSpawnNearPlayer(int index)
    {
        var playerPos = GetPlayerBodyPosition();
        var forward = GetPlayerBodyForward();
        var dist = 3.2f + index * 0.4f;
        return SnapToFloor(playerPos + forward * dist, EnemyGroundOffset);
    }

    private static Vector3? TryGetClosestLevelPointToPlayer(Vector3 start, int index)
    {
        try
        {
            var all = SemiFunc.LevelPointsGetAll();
            if (all == null || all.Count == 0) return null;

            var candidates = all
                .Where(p => p != null && !p.Truck)
                .Select(p => SnapToFloor(p.transform.position, EnemyGroundOffset))
                .Where(pos => HorizontalDistance(pos, start) >= MinEnemySpawnDistance * 0.85f)
                .OrderBy(pos => HorizontalDistanceSqr(pos, start))
                .ToList();

            if (candidates.Count == 0)
            {
                candidates = all
                    .Where(p => p != null && !p.Truck)
                    .Select(p => SnapToFloor(p.transform.position, EnemyGroundOffset))
                    .OrderBy(pos => HorizontalDistanceSqr(pos, start))
                    .ToList();
            }

            if (candidates.Count == 0) return null;
            return candidates[Math.Min(index % candidates.Count, candidates.Count - 1)];
        }
        catch (Exception ex)
        {
            ModLog.Debug($"TryGetClosestLevelPointToPlayer failed: {ex.Message}");
            return null;
        }
    }

    private static Vector3? TryGetClosestLevelPointOutsidePlayerRooms(Vector3 start, int index)
    {
        try
        {
            var playerRooms = SemiFunc.LevelPointsGetInPlayerRooms() ?? new List<LevelPoint>();
            var playerRoomSet = new HashSet<LevelPoint>(playerRooms.Where(p => p != null));
            var all = SemiFunc.LevelPointsGetAll();
            if (all == null || all.Count == 0) return null;

            var candidates = all
                .Where(p => p != null && !p.Truck && !playerRoomSet.Contains(p))
                .Select(p => SnapToFloor(p.transform.position, EnemyGroundOffset))
                .OrderBy(pos => HorizontalDistanceSqr(pos, start))
                .ToList();

            if (candidates.Count == 0)
            {
                candidates = all
                    .Where(p => p != null && !p.Truck)
                    .Select(p => SnapToFloor(p.transform.position, EnemyGroundOffset))
                    .OrderBy(pos => HorizontalDistanceSqr(pos, start))
                    .ToList();
            }

            if (candidates.Count == 0) return null;
            return candidates[Math.Min(index % candidates.Count, candidates.Count - 1)];
        }
        catch (Exception ex)
        {
            ModLog.Debug($"TryGetClosestLevelPointOutsidePlayerRooms failed: {ex.Message}");
            return null;
        }
    }

    private static Vector3 GetEnemyFallbackSpawnPosition(int index)
    {
        var angle = 85f + index * 40f;
        var distance = 4f + index * 0.35f;
        return SnapToFloor(GetOffsetFromPlayerBody(distance, angle), EnemyGroundOffset);
    }

    public static Vector3 GetEnemyClusterPosition(Vector3 basePosition, int index)
    {
        if (index <= 0) return basePosition;

        var angle = index * 137.50776405f * Mathf.Deg2Rad;
        var radius = Mathf.Min(1.25f, 0.12f + index * 0.03f);
        var offset = new Vector3(Mathf.Cos(angle) * radius, 0f, Mathf.Sin(angle) * radius);
        return ClampEnemySpawnNearPlayer(basePosition + offset);
    }

    /// <summary>Active nades: short forward eye-level spawn (not floor).</summary>
    public static Vector3 GetGrenadeSpreadPosition(int scatterIndex)
    {
        return GetItemSpawnPosition(ActiveNadeForwardDistance, ItemEyeHeightFallback, scatterIndex);
    }

    public static Vector3 GetEyeLevelPositionInFront(int scatterIndex, float distance)
    {
        return GetItemSpawnPosition(distance, ItemEyeHeightFallback, scatterIndex);
    }

    /// <summary>Clamp a spawn candidate to floor inside the current map (not truck / void / exterior).</summary>
    public static Vector3 ResolveInMapPosition(Vector3 candidate, float groundOffset, int fallbackIndex = 0, bool enemySpawn = false)
    {
        var grounded = SnapToFloor(candidate, groundOffset);
        if (IsInsideMap(grounded, groundOffset))
        {
            return enemySpawn ? ClampEnemySpawnNearPlayer(grounded) : grounded;
        }

        foreach (var alt in GetInMapFallbackPositions(fallbackIndex, groundOffset, enemySpawn))
        {
            if (!IsInsideMap(alt, groundOffset)) continue;

            if (enemySpawn)
            {
                var clamped = ClampEnemySpawnNearPlayer(alt);
                if (HorizontalDistance(clamped, GetPlayerBodyPosition()) >= MinEnemySpawnDistance)
                {
                    return clamped;
                }

                continue;
            }

            return alt;
        }

        if (enemySpawn)
        {
            return ClampEnemySpawnNearPlayer(GetEnemyFallbackSpawnPosition(fallbackIndex));
        }

        var body = GetPlayerBodyPosition();
        var forward = GetSpawnForwardDirection();
        return SnapToFloor(body + forward * 1.2f, groundOffset);
    }

    public static Vector3 ClampEnemySpawnNearPlayer(Vector3 pos)
    {
        var playerPos = GetPlayerBodyPosition();
        var dist = HorizontalDistance(pos, playerPos);
        if (dist >= MinEnemySpawnDistance)
        {
            return SnapToFloor(pos, EnemyGroundOffset);
        }

        var away = pos - playerPos;
        away.y = 0f;
        if (away.sqrMagnitude < 0.01f || Vector3.Dot(GetPlayerBodyForward(), away.normalized) > 0.55f)
        {
            away = Quaternion.Euler(0f, 75f + UnityEngine.Random.Range(-15f, 15f), 0f) * GetPlayerBodyForward();
        }

        return SnapToFloor(playerPos + away.normalized * MinEnemySpawnDistance, EnemyGroundOffset);
    }

    public static Vector3 EnforceEnemySpawnDistance(Vector3 pos) => ClampEnemySpawnNearPlayer(pos);

    /// <summary>If a wall is directly ahead, spawn behind the player instead.</summary>
    public static Vector3 GetSpawnForwardDirection()
    {
        var forward = GetPlayerBodyForward();
        var body = GetPlayerBodyPosition();
        var eyeOrigin = body + Vector3.up * GetEyeHeightOffset();

        if (Physics.Raycast(eyeOrigin, forward, out var hit, WallCheckDistance, ~0, QueryTriggerInteraction.Ignore)
            && hit.normal.y < 0.55f)
        {
            return -forward;
        }

        return forward;
    }

    private static bool IsDirectlyAheadOfPlayer(Vector3 pos, float maxDistance)
    {
        var playerPos = GetPlayerBodyPosition();
        var toPos = pos - playerPos;
        toPos.y = 0f;
        if (toPos.sqrMagnitude > maxDistance * maxDistance) return false;
        if (toPos.sqrMagnitude < 0.25f) return true;

        var forward = GetPlayerBodyForward();
        var dot = Vector3.Dot(forward.normalized, toPos.normalized);
        return dot > 0.55f;
    }

    private static Vector3? TryGetEnemySpawnAtNearestDoor(int index)
    {
        try
        {
            var playerPos = GetPlayerBodyPosition();
            var playerRooms = SemiFunc.LevelPointsGetInPlayerRooms() ?? new List<LevelPoint>();
            var playerRoomSet = new HashSet<LevelPoint>(playerRooms.Where(p => p != null));
            var candidates = new List<Vector3>();
            var seen = new HashSet<long>();

            void AddDoorCandidate(Vector3 pos)
            {
                if (HorizontalDistance(pos, playerPos) > MaxEnemyDoorSpawnDistance) return;
                var key = ((long)Mathf.Round(pos.x * 4f) << 32) | (uint)Mathf.Round(pos.z * 4f);
                if (!seen.Add(key)) return;
                candidates.Add(pos);
            }

            foreach (var roomPoint in playerRooms.Where(p => p != null && !p.Truck))
            {
                if (!roomPoint.ModuleConnect || roomPoint.ConnectedPoints == null) continue;

                foreach (var connected in roomPoint.ConnectedPoints)
                {
                    if (connected == null || connected.Truck || playerRoomSet.Contains(connected)) continue;

                    var doorPos = Vector3.Lerp(
                        roomPoint.transform.position,
                        connected.transform.position,
                        0.58f);
                    AddDoorCandidate(SnapToFloor(doorPos, EnemyGroundOffset));
                }
            }

            var all = SemiFunc.LevelPointsGetAll();
            if (all != null)
            {
                foreach (var point in all.Where(p => p != null && !p.Truck && p.ModuleConnect))
                {
                    if (!playerRoomSet.Contains(point) || point.ConnectedPoints == null) continue;

                    foreach (var connected in point.ConnectedPoints)
                    {
                        if (connected == null || connected.Truck || playerRoomSet.Contains(connected)) continue;

                        var doorPos = Vector3.Lerp(
                            point.transform.position,
                            connected.transform.position,
                            0.58f);
                        AddDoorCandidate(SnapToFloor(doorPos, EnemyGroundOffset));
                    }
                }
            }

            if (candidates.Count == 0) return null;

            var ordered = candidates
                .Where(pos => HorizontalDistance(pos, playerPos) >= MinEnemySpawnDistance)
                .Where(pos => !IsDirectlyAheadOfPlayer(pos, 3.5f))
                .OrderBy(pos => HorizontalDistanceSqr(pos, playerPos))
                .ToList();

            if (ordered.Count == 0)
            {
                ordered = candidates
                    .OrderBy(pos => HorizontalDistanceSqr(pos, playerPos))
                    .ToList();
            }

            return ordered[Math.Min(index % ordered.Count, ordered.Count - 1)];
        }
        catch (Exception ex)
        {
            ModLog.Debug($"TryGetEnemySpawnAtNearestDoor failed: {ex.Message}");
            return null;
        }
    }

    private static Vector3? TryGetEnemySpawnOutsidePlayerRoom(int index)
    {
        try
        {
            var playerPos = GetPlayerBodyPosition();
            var playerRooms = SemiFunc.LevelPointsGetInPlayerRooms() ?? new List<LevelPoint>();
            var playerRoomSet = new HashSet<LevelPoint>(playerRooms.Where(p => p != null));

            var all = SemiFunc.LevelPointsGetAll();
            if (all == null || all.Count == 0) return null;

            var minDistSqr = MinEnemySpawnDistance * MinEnemySpawnDistance;

            var candidates = all
                .Where(p => p != null && !p.Truck && !playerRoomSet.Contains(p))
                .Select(p => SnapToFloor(p.transform.position, EnemyGroundOffset))
                .Where(pos => HorizontalDistanceSqr(pos, playerPos) >= minDistSqr)
                .Where(pos => HorizontalDistance(pos, playerPos) <= MaxEnemyDoorSpawnDistance)
                .Where(pos => !HudRoomHelper.IsInCurrentRoom(pos))
                .Where(pos => !IsDirectlyAheadOfPlayer(pos, 6f))
                .OrderBy(pos => HorizontalDistanceSqr(pos, playerPos))
                .ToList();

            if (candidates.Count == 0)
            {
                candidates = all
                    .Where(p => p != null && !p.Truck)
                    .Select(p => SnapToFloor(p.transform.position, EnemyGroundOffset))
                    .Where(pos => HorizontalDistanceSqr(pos, playerPos) >= minDistSqr)
                    .Where(pos => HorizontalDistance(pos, playerPos) <= MaxEnemyDoorSpawnDistance)
                    .Where(pos => !HudRoomHelper.IsInCurrentRoom(pos))
                    .Where(pos => !IsDirectlyAheadOfPlayer(pos, 6f))
                    .OrderBy(pos => HorizontalDistanceSqr(pos, playerPos))
                    .ToList();
            }

            if (candidates.Count == 0)
            {
                candidates = all
                    .Where(p => p != null && !p.Truck)
                    .Select(p => SnapToFloor(p.transform.position, EnemyGroundOffset))
                    .Where(pos => HorizontalDistanceSqr(pos, playerPos) >= minDistSqr)
                    .Where(pos => !HudRoomHelper.IsInCurrentRoom(pos))
                    .OrderBy(pos => HorizontalDistanceSqr(pos, playerPos))
                    .ToList();
            }

            if (candidates.Count == 0) return null;
            return candidates[Math.Min(index % candidates.Count, candidates.Count - 1)];
        }
        catch (Exception ex)
        {
            ModLog.Debug($"TryGetEnemySpawnOutsidePlayerRoom failed: {ex.Message}");
            return null;
        }
    }

    private static bool IsInsideMap(Vector3 pos, float groundOffset)
    {
        if (IsPositionInTruckArea(pos)) return false;

        var referenceY = GetPlayerBodyPosition().y;
        var floor = FindFloorHit(pos, referenceY, 12f);
        if (!floor.HasValue) return false;

        var floorPoint = floor.Value.point;
        if (Physics.Raycast(floorPoint + Vector3.up * 0.08f, Vector3.up, 0.55f, ~0, QueryTriggerInteraction.Ignore))
        {
            return false;
        }

        if (!IsNearValidLevelPoint(floorPoint)) return false;

        return true;
    }

    private static bool IsPositionInTruckArea(Vector3 pos)
    {
        try
        {
            if (SemiFunc.MenuLevel()) return true;
        }
        catch
        {
            // ignore
        }

        var spawnPoints = UnityEngine.Object.FindObjectsOfType<SpawnPoint>();
        if (spawnPoints == null || spawnPoints.Length == 0) return false;

        return spawnPoints.Any(p =>
            p != null && HorizontalDistanceSqr(p.transform.position, pos) < 64f);
    }

    private static bool IsNearValidLevelPoint(Vector3 pos)
    {
        try
        {
            var all = SemiFunc.LevelPointsGetAll();
            if (all != null && all.Count > 0)
            {
                return all.Any(p =>
                    p != null && !p.Truck &&
                    HorizontalDistance(p.transform.position, pos) <= MaxSpawnDistanceFromLevelPoint);
            }

            var nearby = SemiFunc.LevelPointGetWithinDistance(
                GetPlayerBodyPosition(), 2f, MaxSpawnDistanceFromLevelPoint + 6f);
            if (nearby != null && nearby.Count > 0)
            {
                return nearby.Any(p =>
                    p != null && !p.Truck &&
                    HorizontalDistance(p.transform.position, pos) <= MaxSpawnDistanceFromLevelPoint);
            }

            var rooms = SemiFunc.LevelPointsGetInPlayerRooms();
            if (rooms != null && rooms.Count > 0)
            {
                return rooms.Any(p =>
                    p != null && !p.Truck &&
                    HorizontalDistance(p.transform.position, pos) <= MaxSpawnDistanceFromLevelPoint);
            }
        }
        catch (Exception ex)
        {
            ModLog.Debug($"IsNearValidLevelPoint failed: {ex.Message}");
        }

        return false;
    }

    private static IEnumerable<Vector3> GetInMapFallbackPositions(int index, float groundOffset, bool enemySpawn = false)
    {
        for (var i = 0; i < 10; i++)
        {
            var idx = (index + i) % 10;
            var nearby = TryGetNearbyLevelPointSpawn(idx, enemySpawn);
            if (nearby.HasValue) yield return nearby.Value;

            var start = TryGetStartRoomLevelPoint(idx, enemySpawn);
            if (start.HasValue) yield return start.Value;
        }

        if (enemySpawn)
        {
            for (var i = 0; i < 8; i++)
            {
                yield return GetEnemyFallbackSpawnPosition(index + i);
            }

            yield break;
        }

        var body = GetPlayerBodyPosition();
        var forward = GetSpawnForwardDirection();
        for (var ring = 0; ring < 6; ring++)
        {
            var angle = ring * 60f + index * 13f;
            var dir = (Quaternion.Euler(0f, angle, 0f) * forward).normalized;
            yield return SnapToFloor(body + dir * (0.9f + ring * 0.25f), groundOffset);
        }

        var behind = -GetPlayerBodyForward();
        yield return SnapToFloor(body + behind * 1.4f, groundOffset);
    }

    private static bool ShouldUseExteriorEnemySpawn()
    {
        if (IsInTruckArea()) return true;

        try
        {
            var playerPos = GetPlayerBodyPosition();
            var startPoints = SemiFunc.LevelPointsGetInStartRoom();
            if (startPoints == null || startPoints.Count == 0) return false;

            return startPoints.Any(p =>
                p != null && HorizontalDistanceSqr(p.transform.position, playerPos) < 144f);
        }
        catch
        {
            return false;
        }
    }

    private static Vector3? TryGetExteriorDoorSpawn(int index)
    {
        var truckRef = GetTruckReferencePosition();
        var playerPos = GetPlayerBodyPosition();
        var candidates = new List<SpawnCandidate>();

        try
        {
            var allPoints = SemiFunc.LevelPointsGetAll();
            if (allPoints != null)
            {
                foreach (var point in allPoints)
                {
                    if (point == null || point.Truck) continue;

                    var pos = SnapToFloor(point.transform.position, EnemyGroundOffset);
                    var distFromTruck = HorizontalDistance(pos, truckRef);
                    if (distFromTruck < 4.5f) continue;

                    var priority = 100;
                    if (point.ModuleConnect) priority -= 40;
                    if (!point.inStartRoom) priority -= 25;
                    if (distFromTruck >= 5f && distFromTruck <= 8.5f) priority -= 20;
                    else if (distFromTruck <= 12f) priority -= 5;
                    else priority += 15;

                    candidates.Add(new SpawnCandidate(pos, priority, HorizontalDistanceSqr(pos, playerPos)));
                }

                foreach (var startPoint in allPoints.Where(p => p != null && p.inStartRoom && p.ModuleConnect))
                {
                    if (startPoint.ConnectedPoints == null) continue;
                    foreach (var connected in startPoint.ConnectedPoints)
                    {
                        if (connected == null || connected.Truck) continue;

                        var pos = SnapToFloor(connected.transform.position, EnemyGroundOffset);
                        var distFromTruck = HorizontalDistance(pos, truckRef);
                        if (distFromTruck < 4.5f) continue;

                        var priority = 10;
                        if (connected.ModuleConnect) priority -= 5;
                        if (distFromTruck >= 5f && distFromTruck <= 8.5f) priority -= 10;

                        candidates.Add(new SpawnCandidate(pos, priority, HorizontalDistanceSqr(pos, playerPos)));
                    }
                }
            }
        }
        catch (Exception ex)
        {
            ModLog.Debug($"TryGetExteriorDoorSpawn level points failed: {ex.Message}");
        }

        if (candidates.Count == 0)
        {
            var fallback = GetTruckExteriorSpawn(index);
            return fallback;
        }

        var ordered = candidates
            .OrderBy(c => c.Priority)
            .ThenBy(c => c.DistanceToPlayer)
            .ToList();

        return ordered[System.Math.Min(index, ordered.Count - 1)].Position;
    }

    private static Vector3 GetTruckReferencePosition()
    {
        var spawnPoints = UnityEngine.Object.FindObjectsOfType<SpawnPoint>();
        if (spawnPoints != null && spawnPoints.Length > 0)
        {
            var valid = spawnPoints.Where(p => p != null).Select(p => p.transform.position).ToList();
            if (valid.Count > 0)
            {
                var sum = Vector3.zero;
                foreach (var pos in valid) sum += pos;
                return sum / valid.Count;
            }
        }

        return GetPlayerBodyPosition();
    }

    private readonly struct SpawnCandidate
    {
        public SpawnCandidate(Vector3 position, int priority, float distanceToPlayer)
        {
            Position = position;
            Priority = priority;
            DistanceToPlayer = distanceToPlayer;
        }

        public Vector3 Position { get; }
        public int Priority { get; }
        public float DistanceToPlayer { get; }
    }

    public static Vector3 SnapToGround(Vector3 position, float heightOffset = ItemGroundOffset)
    {
        return SnapToFloor(position, heightOffset);
    }

    public static Vector3 SnapToFloor(Vector3 position, float heightOffset)
    {
        var referenceY = GetPlayerBodyPosition().y;
        var best = FindFloorHit(position, referenceY, 12f);
        if (best.HasValue)
        {
            return best.Value.point + Vector3.up * heightOffset;
        }

        best = FindFloorHit(position + Vector3.up * 40f, referenceY, 120f);
        if (best.HasValue)
        {
            return best.Value.point + Vector3.up * heightOffset;
        }

        return new Vector3(position.x, referenceY + heightOffset, position.z);
    }

    private static Vector3 ResolveVisibleSpawnPosition(int index, float forwardDistance, Vector3? forwardOverride = null, bool holdAtEyeLevel = false)
    {
        var body = GetPlayerBodyPosition();
        var forward = forwardOverride ?? GetSpawnForwardDirection();
        var yaw = index * 22f;
        var dir = (Quaternion.Euler(0f, yaw, 0f) * forward).normalized;
        var eyeHeight = GetEyeHeightOffset();
        var eyeOrigin = body + Vector3.up * eyeHeight;

        var target = AvoidObstacleSpawn(eyeOrigin, dir, forwardDistance, eyeHeight);

        if (holdAtEyeLevel)
        {
            return target;
        }

        return SnapToFloor(target, ItemGroundOffset);
    }

    private static Vector3 AvoidObstacleSpawn(Vector3 eyeOrigin, Vector3 dir, float forwardDistance, float eyeHeight)
    {
        var preferred = eyeOrigin + dir * forwardDistance;

        if (Physics.Raycast(eyeOrigin, dir, out var frontHit, forwardDistance + 0.35f, ~0, QueryTriggerInteraction.Ignore))
        {
            if (frontHit.normal.y > 0.55f && frontHit.point.y > GetPlayerBodyPosition().y + 0.25f)
            {
                return frontHit.point + Vector3.up * ItemGroundOffset;
            }

            var body = GetPlayerBodyPosition();
            var behind = -GetPlayerBodyForward().normalized;
            var behindYaw = UnityEngine.Random.Range(-25f, 25f);
            behind = (Quaternion.Euler(0f, behindYaw, 0f) * behind).normalized;
            return SnapToFloor(body + behind * (forwardDistance + 0.4f), ItemGroundOffset);
        }

        var lowCeiling = Physics.Raycast(eyeOrigin, Vector3.up, out _, 2.2f, ~0, QueryTriggerInteraction.Ignore);
        if (lowCeiling || Physics.Raycast(eyeOrigin, dir, out _, 0.6f, ~0, QueryTriggerInteraction.Ignore))
        {
            var body = GetPlayerBodyPosition();
            var behind = -GetPlayerBodyForward().normalized;
            return SnapToFloor(body + behind * (forwardDistance + 0.5f), ItemGroundOffset);
        }

        return preferred;
    }

    private static float GetEyeHeightOffset()
    {
        var player = SemiFunc.PlayerAvatarLocal();
        if (player?.localCamera != null)
        {
            return Mathf.Max(1.15f, player.localCamera.transform.position.y - GetPlayerBodyPosition().y);
        }

        return ItemEyeHeightFallback;
    }

    private static RaycastHit? FindFloorHit(Vector3 fromPosition, float referenceY, float maxDistance)
    {
        var origin = fromPosition + Vector3.up * 0.5f;
        var hits = Physics.RaycastAll(origin, Vector3.down, maxDistance, ~0, QueryTriggerInteraction.Ignore);
        RaycastHit? best = null;
        var bestScore = float.MaxValue;

        foreach (var hit in hits)
        {
            if (hit.normal.y < 0.6f) continue;
            if (hit.point.y > referenceY + 1.5f) continue;

            var score = Mathf.Abs(hit.point.y - referenceY) + HorizontalDistance(hit.point, fromPosition) * 0.05f;
            if (score >= bestScore) continue;
            bestScore = score;
            best = hit;
        }

        return best;
    }

    private static bool IsShopDoorOpen()
    {
        foreach (var door in UnityEngine.Object.FindObjectsOfType<TruckDoor>())
        {
            if (door != null && door.doorOpen) return true;
        }

        foreach (var comp in UnityEngine.Object.FindObjectsOfType<MonoBehaviour>())
        {
            if (comp == null) continue;
            var field = comp.GetType().GetField("doorOpen",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field?.FieldType == typeof(bool) && (bool)field.GetValue(comp))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsInTruckArea()
    {
        try
        {
            if (SemiFunc.MenuLevel()) return true;
        }
        catch
        {
            // ignore
        }

        var playerPos = GetPlayerPosition();
        var spawnPoints = UnityEngine.Object.FindObjectsOfType<SpawnPoint>();
        if (spawnPoints == null || spawnPoints.Length == 0) return false;

        return spawnPoints.Any(p =>
            p != null && HorizontalDistanceSqr(p.transform.position, playerPos) < 36f);
    }

    public static Vector3? TryGetNearbyLevelPointSpawn(int index, bool enemySpawn = false)
    {
        try
        {
            var playerPos = GetPlayerBodyPosition();
            var minDist = enemySpawn ? MinEnemySpawnDistance : 0f;
            var minDistSqr = minDist * minDist;
            var points = SemiFunc.LevelPointGetWithinDistance(playerPos, minDist, enemySpawn ? 48f : 22f);
            if (points == null || points.Count == 0) return null;

            var ordered = points
                .Where(p => p != null && !p.Truck)
                .Select(p => SnapToFloor(p.transform.position, EnemyGroundOffset))
                .Where(pos => !enemySpawn || HorizontalDistanceSqr(pos, playerPos) >= minDistSqr)
                .Where(pos => !enemySpawn || !IsDirectlyAheadOfPlayer(pos, 6f))
                .OrderBy(pos => HorizontalDistanceSqr(pos, playerPos))
                .ToList();

            if (enemySpawn && ordered.Count == 0)
            {
                ordered = points
                    .Where(p => p != null && !p.Truck)
                    .Select(p => SnapToFloor(p.transform.position, EnemyGroundOffset))
                    .Where(pos => HorizontalDistanceSqr(pos, playerPos) >= minDistSqr)
                    .OrderBy(pos => HorizontalDistanceSqr(pos, playerPos))
                    .ToList();
            }
            else if (!enemySpawn && ordered.Count == 0)
            {
                ordered = points
                    .Where(p => p != null && !p.Truck)
                    .Select(p => SnapToFloor(p.transform.position, EnemyGroundOffset))
                    .OrderBy(pos => HorizontalDistanceSqr(pos, playerPos))
                    .ToList();
            }

            if (ordered.Count == 0) return null;
            return ordered[System.Math.Min(index, ordered.Count - 1)];
        }
        catch
        {
            return null;
        }
    }

    public static Vector3? TryGetStartRoomLevelPoint(int index, bool enemySpawn = false)
    {
        try
        {
            var playerPos = GetPlayerBodyPosition();
            var points = SemiFunc.LevelPointsGetInStartRoom();
            if (points == null || points.Count == 0) return null;

            var ordered = points
                .Where(p => p != null && !p.Truck)
                .Select(p => SnapToFloor(p.transform.position, EnemyGroundOffset))
                .Where(pos => !enemySpawn || HorizontalDistanceSqr(pos, playerPos) >= MinEnemySpawnDistance * MinEnemySpawnDistance)
                .OrderBy(pos => HorizontalDistanceSqr(pos, playerPos))
                .ToList();

            if (ordered.Count == 0) return null;
            return ordered[System.Math.Min(index, ordered.Count - 1)];
        }
        catch
        {
            return null;
        }
    }

    private static Vector3? GetTruckExteriorSpawn(int index)
    {
        var truckRef = GetTruckReferencePosition();
        var playerPos = GetPlayerPosition();
        var spawnPoints = UnityEngine.Object.FindObjectsOfType<SpawnPoint>();
        if (spawnPoints != null && spawnPoints.Length > 0)
        {
            var ordered = spawnPoints
                .Where(p => p != null)
                .Select(p => p.transform.position)
                .OrderBy(pos => HorizontalDistanceSqr(pos, playerPos))
                .ToList();

            if (ordered.Count > 0)
            {
                var pick = ordered[System.Math.Min(index, ordered.Count - 1)];
                var away = (pick - truckRef).normalized;
                if (away.sqrMagnitude < 0.01f)
                {
                    away = GetPlayerBodyForward().normalized;
                }

                var distance = 6.5f + index * 0.35f;
                return SnapToFloor(truckRef + away * distance, EnemyGroundOffset);
            }
        }

        return SnapToFloor(GetOffsetFromPlayerBody(6.5f + index * 1.5f, index * 60f), EnemyGroundOffset);
    }

    public static Vector3 GetPlayerPosition() => GetPlayerBodyPosition();

    public static Vector3 GetPlayerForward() => GetPlayerBodyForward();

    public static Vector3 GetPlayerBodyPosition()
    {
        var t = GetPlayerBodyTransform();
        return t != null ? t.position : Vector3.up * 2f;
    }

    public static Vector3 GetPlayerBodyForward()
    {
        var t = GetPlayerBodyTransform();
        if (t == null) return Vector3.forward;

        var forward = t.forward;
        forward.y = 0f;
        return forward.sqrMagnitude > 0.01f ? forward.normalized : Vector3.forward;
    }

    private static Vector3 GetOffsetFromPlayerBody(float distance, float yawDegrees)
    {
        var playerPos = GetPlayerBodyPosition();
        var forward = GetPlayerBodyForward();
        var rotated = Quaternion.Euler(0f, yawDegrees, 0f) * forward;
        return playerPos + rotated.normalized * distance;
    }

    private static Transform? GetPlayerBodyTransform()
    {
        var subject = EventContext.SoloTarget() ?? SemiFunc.PlayerAvatarLocal();
        if (subject != null) return subject.transform;

        var player = GameObject.FindGameObjectWithTag("Player");
        return player != null ? player.transform : null;
    }

    private static float HorizontalDistanceSqr(Vector3 a, Vector3 b)
    {
        a.y = 0f;
        b.y = 0f;
        return (a - b).sqrMagnitude;
    }

    private static float HorizontalDistance(Vector3 a, Vector3 b) => Mathf.Sqrt(HorizontalDistanceSqr(a, b));
}
