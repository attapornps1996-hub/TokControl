using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal static class CartHelper
{
    public static PhysGrabCart[] GetAllCarts()
    {
        return UnityEngine.Object.FindObjectsOfType<PhysGrabCart>()
            .Where(c => c != null && c.isActiveAndEnabled)
            .ToArray();
    }

    public static List<PhysGrabObject> GetCartItemObjects(PhysGrabCart cart)
    {
        if (cart?.itemsInCart == null || cart.itemsInCart.Count == 0)
        {
            return new List<PhysGrabObject>();
        }

        return cart.itemsInCart.Where(o => o != null).ToList();
    }

    public static bool TeleportCart(PhysGrabCart cart, Vector3 targetPosition)
    {
        if (cart == null) return false;

        var rb = cart.rb;
        if (rb == null) return false;

        var height = GetCartHeight(cart);
        var grounded = targetPosition + Vector3.up * height;
        var oldPos = rb.position;
        rb.position = grounded;
        rb.velocity = Vector3.zero;
        rb.angularVelocity = Vector3.zero;
        TeleportItemsInCart(cart, grounded, oldPos);
        return true;
    }

    public static void TeleportItemsInCart(PhysGrabCart cart, Vector3 newPos, Vector3 oldPos)
    {
        var delta = newPos - oldPos;
        foreach (var item in GetCartItemObjects(cart))
        {
            try
            {
                item.Teleport(item.transform.position + delta, item.transform.rotation);
            }
            catch (Exception ex)
            {
                ModLog.Debug($"Cart item teleport failed: {ex.Message}");
            }
        }
    }

    public static void ShakeItemsInAllCarts(float minForce, float maxForce, float minDelay, float maxDelay)
    {
        var carts = GetAllCarts();
        if (carts.Length == 0) return;

        EffectTimerHost.Instance.RunRoutine(ShakeAllCartsRoutine(carts, minForce, maxForce, minDelay, maxDelay));
    }

    public static bool TeleportAllCarts(bool toStart)
    {
        var carts = GetAllCarts();
        if (carts.Length == 0) return false;

        LevelPoint? lastPoint = null;
        var applied = false;

        foreach (var cart in carts)
        {
            var target = toStart
                ? GetNextStartRoomPoint(ref lastPoint)
                : GetNextRandomMapPoint(ref lastPoint, excludePlayerRooms: true);
            if (!target.HasValue) continue;

            if (TeleportCart(cart, target.Value)) applied = true;
        }

        return applied;
    }

    private static IEnumerator ShakeAllCartsRoutine(PhysGrabCart[] carts, float minForce, float maxForce, float minDelay, float maxDelay)
    {
        var delayLo = Mathf.Max(0f, Mathf.Min(minDelay, maxDelay));
        var delayHi = Mathf.Max(delayLo, Mathf.Max(minDelay, maxDelay));
        if (delayHi > 0.001f)
        {
            yield return new WaitForSeconds(UnityEngine.Random.Range(delayLo, delayHi));
        }
        else
        {
            // Immediate scatter — wait one frame so physics wakes
            yield return null;
        }

        foreach (var cart in carts)
        {
            if (cart == null) continue;

            foreach (var item in GetCartItemObjects(cart))
            {
                var rb = item.rb;
                if (rb == null) continue;

                rb.isKinematic = false;
                rb.WakeUp();

                var upForce = UnityEngine.Random.Range(minForce, maxForce);
                rb.velocity = Vector3.zero;
                rb.angularVelocity = Vector3.zero;
                rb.AddForce(Vector3.up * upForce, ForceMode.Impulse);

                var scatter = item.gameObject.GetComponent<CartItemScatterBehavior>()
                              ?? item.gameObject.AddComponent<CartItemScatterBehavior>();
                scatter.Begin();
            }
        }
    }

    private static float GetCartHeight(PhysGrabCart cart)
    {
        var collider = cart.GetComponentInParent<Collider>();
        if (collider == null) return 1f;
        return collider.bounds.size.y;
    }

    private static Vector3? GetNextStartRoomPoint(ref LevelPoint? lastPoint)
    {
        try
        {
            var points = SemiFunc.LevelPointsGetInStartRoom();
            if (points == null || points.Count == 0)
            {
                return GetPlayerSpawnPoint();
            }

            lastPoint = PickNextPoint(points, lastPoint);
            return lastPoint?.transform.position;
        }
        catch (Exception ex)
        {
            ModLog.Debug($"GetNextStartRoomPoint failed: {ex.Message}");
            return GetPlayerSpawnPoint();
        }
    }

    private static Vector3? GetNextRandomMapPoint(ref LevelPoint? lastPoint, bool excludePlayerRooms)
    {
        try
        {
            var points = SemiFunc.LevelPointsGetAll();
            if (points == null || points.Count == 0) return null;

            if (excludePlayerRooms)
            {
                var playerRooms = SemiFunc.LevelPointsGetInPlayerRooms() ?? new List<LevelPoint>();
                points = points.Where(p => p != null && !playerRooms.Contains(p)).ToList();
            }

            if (points.Count == 0) return null;

            lastPoint = PickNextPoint(points, lastPoint);
            return lastPoint?.transform.position;
        }
        catch (Exception ex)
        {
            ModLog.Debug($"GetNextRandomMapPoint failed: {ex.Message}");
            return null;
        }
    }

    private static LevelPoint PickNextPoint(IReadOnlyList<LevelPoint> points, LevelPoint? lastPoint)
    {
        if (points.Count == 1) return points[0];

        LevelPoint next;
        var attempts = 0;
        do
        {
            next = points[UnityEngine.Random.Range(0, points.Count)];
            attempts++;
        } while (next == lastPoint && attempts < 8);

        return next;
    }

    private static Vector3? GetPlayerSpawnPoint()
    {
        var spawnPoints = UnityEngine.Object.FindObjectsOfType<SpawnPoint>();
        if (spawnPoints == null || spawnPoints.Length == 0) return null;
        return spawnPoints[UnityEngine.Random.Range(0, spawnPoints.Length)].transform.position;
    }

    public static Vector3? GetRandomPlayerSpawnPoint(Vector3 avoidNear)
    {
        var spawnPoints = UnityEngine.Object.FindObjectsOfType<SpawnPoint>()
            .Where(p => p != null)
            .Select(p => p.transform.position)
            .ToList();

        if (spawnPoints.Count == 0)
        {
            return SpawnHelper.TryGetStartRoomLevelPoint(0);
        }

        var ordered = spawnPoints
            .OrderByDescending(pos => (pos - avoidNear).sqrMagnitude)
            .ToList();

        return ordered[UnityEngine.Random.Range(0, ordered.Count)];
    }
}
