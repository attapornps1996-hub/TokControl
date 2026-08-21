using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal sealed class ToyPlaneDriveBehavior : MonoBehaviour
{
    private const float PatrolForce = 7f;
    private const float DiveForce = 14f;
    private const float PatrolMaxSpeed = 5.5f;
    private const float DiveMaxSpeed = 10f;
    private const float IdealPatrolHeight = 5f;
    private const float MinPatrolHeight = 3f;
    private const float CeilingClearance = 1.15f;
    private const float FloorClearance = 1.8f;
    private const float DiveChance = 0.3f;
    private const float UnstickImpulse = 5f;

    private enum FlightPhase
    {
        Launch,
        Patrol,
        Dive
    }

    private ValuablePlane? _plane;
    private Rigidbody? _rb;
    private Transform? _playerTarget;
    private Vector3 _patrolTarget;
    private FlightPhase _phase = FlightPhase.Patrol;
    private bool _hitPlayer;
    private float _duration = 120f;
    private float _elapsed;
    private float _retryTimer;
    private float _patrolRetargetTimer;
    private float _diveCooldown;
    private float _diveTimer;
    private Vector3 _lastPosition;
    private float _launchTimer;
    private float _launchTargetY;
    private float _stuckCheckTimer;

    public void Configure(ValuablePlane plane, bool aggressive = false, float durationSeconds = 120f)
    {
        _plane = plane;
        _rb = plane.GetComponentInChildren<Rigidbody>();
        _playerTarget = PlayerEffectHelper.GetLocalPlayer()?.transform;
        _duration = Mathf.Max(10f, durationSeconds);
        _phase = FlightPhase.Launch;
        _patrolTarget = PickHighPatrolTarget();
        _lastPosition = plane.transform.position;
        _retryTimer = 0.1f;
        _patrolRetargetTimer = 0f;
        _stuckCheckTimer = 0.35f;
        _diveCooldown = UnityEngine.Random.Range(2.5f, 6f);
        _diveTimer = 0f;
        _launchTimer = 3.5f;

        PlaceAtPlayerHead();
        TryActivateFlight();
    }

    private void PlaceAtPlayerHead()
    {
        if (_plane == null || _rb == null) return;

        var head = GetPlayerHeadPosition();
        var side = UnityEngine.Random.insideUnitSphere;
        side.y = 0f;
        if (side.sqrMagnitude < 0.01f) side = Vector3.right;
        side.Normalize();

        var spawnPos = head + side * 0.65f;
        _launchTargetY = GetFlightBounds(spawnPos).PatrolY;

        _plane.transform.position = spawnPos;
        _rb.position = spawnPos;
        _rb.velocity = Vector3.zero;
        _rb.angularVelocity = Vector3.zero;
    }

    private Vector3 GetPlayerHeadPosition()
    {
        var anchor = _playerTarget != null ? _playerTarget.position : _plane!.transform.position;
        return anchor + Vector3.up * 1.55f;
    }

    private void FixedUpdate()
    {
        if (_plane == null || _rb == null) return;

        _elapsed += Time.fixedDeltaTime;
        if (_elapsed >= _duration)
        {
            Destroy(this);
            return;
        }

        UpdateFlightPhase();
        if (_phase == FlightPhase.Launch)
        {
            UpdateLaunchFlight();
            return;
        }

        UpdatePatrolTarget();
        var forward = GetDriveDirection();
        _plane.transform.rotation = Quaternion.Slerp(
            _plane.transform.rotation,
            Quaternion.LookRotation(forward, Vector3.up),
            _phase == FlightPhase.Dive ? 0.18f : 0.09f);

        var force = _phase == FlightPhase.Dive ? DiveForce : PatrolForce;
        _rb.AddForce(forward * force, ForceMode.Acceleration);
        ApplyAltitudeControl();
        EnforceMinimumAltitude();
        ClampSpeed(_phase == FlightPhase.Dive ? DiveMaxSpeed : PatrolMaxSpeed);

        _retryTimer -= Time.fixedDeltaTime;
        if (_retryTimer <= 0f)
        {
            _retryTimer = 0.25f;
            TryActivateFlight();
        }

        _stuckCheckTimer -= Time.fixedDeltaTime;
        if (_stuckCheckTimer <= 0f)
        {
            _stuckCheckTimer = 0.35f;
            CheckAndUnstick(forward);
        }
    }

    private void ClampSpeed(float maxSpeed)
    {
        if (_rb == null) return;

        var vel = _rb.velocity;
        if (vel.sqrMagnitude <= maxSpeed * maxSpeed) return;

        _rb.velocity = vel.normalized * maxSpeed;
    }

    private void OnCollisionEnter(Collision collision)
    {
        ValuableDamageHelper.ApplyImpactDamage(gameObject, 0.15f, heavy: true);

        if (ValuableDamageHelper.IsDestroyed(gameObject))
        {
            Destroy(this);
            return;
        }

        if (_phase != FlightPhase.Dive || _hitPlayer) return;

        var player = collision.gameObject.GetComponentInParent<PlayerAvatar>();
        if (player == null) return;

        _hitPlayer = true;
        if (player.playerHealth != null)
        {
            player.playerHealth.HurtOther(5, Vector3.zero, false, -1, false);
        }

        if (player == PlayerEffectHelper.GetLocalPlayer())
        {
            PlayerEffectHelper.Knockdown(12f, 10f);
        }

        ReturnToPatrol();
    }

    private void UpdateLaunchFlight()
    {
        if (_plane == null || _rb == null) return;

        _launchTimer -= Time.fixedDeltaTime;
        _playerTarget = PlayerEffectHelper.GetLocalPlayer()?.transform ?? _playerTarget;

        var head = GetPlayerHeadPosition();
        var away = _plane.transform.position - head;
        away.y = 0f;
        if (away.sqrMagnitude < 0.04f) away = _plane.transform.forward;
        away.Normalize();

        _plane.transform.rotation = Quaternion.Slerp(
            _plane.transform.rotation,
            Quaternion.LookRotation((away + Vector3.up * 0.85f).normalized, Vector3.up),
            0.16f);

        _rb.AddForce(Vector3.up * 11f + away * 3f, ForceMode.Acceleration);

        var bounds = GetFlightBounds(_plane.transform.position);
        if (_plane.transform.position.y >= _launchTargetY - 0.2f || _launchTimer <= 0f)
        {
            _phase = FlightPhase.Patrol;
            _patrolTarget = PickHighPatrolTarget();
            _patrolRetargetTimer = 0f;
        }

        if (bounds.HasCeiling && _plane.transform.position.y > bounds.CeilingY - CeilingClearance)
        {
            _phase = FlightPhase.Patrol;
            var pos = _plane.transform.position;
            pos.y = bounds.CeilingY - CeilingClearance;
            _plane.transform.position = pos;
            _rb.position = pos;
            _patrolTarget = PickHighPatrolTarget();
        }
    }

    private void UpdateFlightPhase()
    {
        if (_phase == FlightPhase.Launch) return;

        if (_phase == FlightPhase.Dive)
        {
            _diveTimer -= Time.fixedDeltaTime;
            if (_diveTimer <= 0f || _hitPlayer)
            {
                ReturnToPatrol();
            }

            return;
        }

        _diveCooldown -= Time.fixedDeltaTime;
        if (_diveCooldown > 0f) return;

        _diveCooldown = UnityEngine.Random.Range(4f, 9f);
        if (UnityEngine.Random.value > DiveChance) return;

        _playerTarget = PlayerEffectHelper.GetLocalPlayer()?.transform;
        if (_playerTarget == null) return;

        _phase = FlightPhase.Dive;
        _diveTimer = UnityEngine.Random.Range(4f, 7f);
        _hitPlayer = false;
    }

    private void ReturnToPatrol()
    {
        _phase = FlightPhase.Patrol;
        _diveCooldown = UnityEngine.Random.Range(4f, 9f);
        _patrolTarget = PickHighPatrolTarget();
        _patrolRetargetTimer = 0f;
    }

    private void EnforceMinimumAltitude()
    {
        if (_plane == null || _rb == null || _phase == FlightPhase.Dive || _phase == FlightPhase.Launch) return;

        var bounds = GetFlightBounds(_plane.transform.position);
        var minY = bounds.FloorY + MinPatrolHeight;
        if (_plane.transform.position.y >= minY) return;

        var pos = _plane.transform.position;
        pos.y = bounds.PatrolY;
        _plane.transform.position = pos;
        _rb.position = pos;

        var vel = _rb.velocity;
        if (vel.y < 0f)
        {
            vel.y = 0f;
            _rb.velocity = vel;
        }
    }

    private void ApplyAltitudeControl()
    {
        if (_plane == null || _rb == null || _phase == FlightPhase.Dive) return;

        var bounds = GetFlightBounds(_plane.transform.position);
        var targetY = bounds.PatrolY;
        var delta = targetY - _plane.transform.position.y;

        if (delta > 0.35f)
        {
            _rb.AddForce(Vector3.up * Mathf.Clamp(delta * 2f, 1.2f, 5f), ForceMode.Acceleration);
        }
        else if (delta < -0.45f)
        {
            _rb.AddForce(Vector3.up * delta * 1.8f, ForceMode.Acceleration);
        }

        if (bounds.HasCeiling && _plane.transform.position.y > bounds.CeilingY - CeilingClearance)
        {
            var pushDown = _plane.transform.position.y - (bounds.CeilingY - CeilingClearance);
            _rb.AddForce(Vector3.down * Mathf.Clamp(pushDown * 3f, 1f, 8f), ForceMode.Acceleration);
        }
    }

    private void LiftToPatrolAltitude()
    {
        if (_plane == null || _rb == null) return;

        var bounds = GetFlightBounds(_plane.transform.position);
        var target = _plane.transform.position;
        target.y = bounds.PatrolY;
        _plane.transform.position = target;
        _rb.position = target;
        _rb.velocity = Vector3.zero;
    }

    private readonly struct FlightBounds
    {
        public float FloorY { get; init; }
        public float CeilingY { get; init; }
        public bool HasCeiling { get; init; }

        public float PatrolY
        {
            get
            {
                var desired = FloorY + IdealPatrolHeight;
                var minY = FloorY + MinPatrolHeight;
                if (!HasCeiling)
                {
                    return Mathf.Max(desired, minY);
                }

                var maxY = CeilingY - CeilingClearance;
                if (maxY <= minY)
                {
                    return Mathf.Max(FloorY + FloorClearance, (FloorY + CeilingY) * 0.5f);
                }

                return Mathf.Clamp(desired, minY, maxY);
            }
        }
    }

    private static FlightBounds GetFlightBounds(Vector3 position)
    {
        var floorY = GetFloorHeight(position);
        var hasCeiling = false;
        var ceilingY = floorY + IdealPatrolHeight + 8f;

        var origin = new Vector3(position.x, floorY + 0.35f, position.z);
        if (Physics.Raycast(origin, Vector3.up, out var hit, 24f, Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore))
        {
            if (hit.normal.y < -0.25f || hit.point.y > floorY + MinPatrolHeight + 0.5f)
            {
                ceilingY = hit.point.y;
                hasCeiling = true;
            }
        }

        return new FlightBounds
        {
            FloorY = floorY,
            CeilingY = ceilingY,
            HasCeiling = hasCeiling
        };
    }

    private static float GetFloorHeight(Vector3 position)
    {
        var fromHigh = new Vector3(position.x, position.y + 40f, position.z);
        if (Physics.Raycast(fromHigh, Vector3.down, out var highHit, 90f, Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore)
            && highHit.normal.y > 0.5f)
        {
            return highHit.point.y;
        }

        var origin = position + Vector3.up * 2f;
        if (Physics.Raycast(origin, Vector3.down, out var hit, 40f, Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore)
            && hit.normal.y > 0.5f)
        {
            return hit.point.y;
        }

        try
        {
            var snapped = SpawnHelper.SnapToFloor(position, 0.05f);
            if (snapped.y > position.y - 8f)
            {
                return snapped.y;
            }
        }
        catch
        {
            // ignore
        }

        var player = SemiFunc.PlayerAvatarLocal();
        if (player != null)
        {
            var playerOrigin = player.transform.position + Vector3.up * 1.5f;
            if (Physics.Raycast(playerOrigin, Vector3.down, out var playerHit, 30f, Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore)
                && playerHit.normal.y > 0.5f)
            {
                return playerHit.point.y;
            }
        }

        return position.y;
    }

    private void UpdatePatrolTarget()
    {
        if (_phase == FlightPhase.Dive) return;

        _patrolRetargetTimer -= Time.fixedDeltaTime;
        if (_patrolRetargetTimer <= 0f || Vector3.Distance(_plane!.transform.position, _patrolTarget) < 3f)
        {
            _patrolRetargetTimer = UnityEngine.Random.Range(4f, 8f);
            _patrolTarget = PickHighPatrolTarget();
        }
    }

    private Vector3 PickHighPatrolTarget()
    {
        var anchor = _playerTarget != null ? _playerTarget.position : (_plane != null ? _plane.transform.position : transform.position);
        var angle = UnityEngine.Random.Range(0f, 360f) * Mathf.Deg2Rad;
        var radius = UnityEngine.Random.Range(4f, 10f);
        var horizontal = anchor + new Vector3(Mathf.Cos(angle) * radius, 0f, Mathf.Sin(angle) * radius);
        var patrolY = GetFlightBounds(horizontal).PatrolY;
        return new Vector3(horizontal.x, patrolY, horizontal.z);
    }

    private Vector3 GetDriveDirection()
    {
        if (_phase == FlightPhase.Dive && _playerTarget != null)
        {
            var head = _playerTarget.position + Vector3.up * 1.6f;
            var dir = head - _plane!.transform.position;
            if (dir.sqrMagnitude > 0.04f) return dir.normalized;
        }

        var patrolDir = _patrolTarget - _plane!.transform.position;
        if (patrolDir.sqrMagnitude > 0.04f) return patrolDir.normalized;

        var forward = _plane.transform.forward;
        return forward.sqrMagnitude > 0.01f ? forward.normalized : Vector3.forward;
    }

    private void CheckAndUnstick(Vector3 forward)
    {
        if (_plane == null || _rb == null) return;

        var moved = Vector3.Distance(_plane.transform.position, _lastPosition);
        _lastPosition = _plane.transform.position;
        if (moved > 0.1f) return;

        _rb.AddForce(forward * UnstickImpulse + Vector3.up * 2f, ForceMode.VelocityChange);
    }

    private void TryActivateFlight()
    {
        if (_plane == null) return;

        try
        {
            _plane.TrapStart();
        }
        catch (Exception ex)
        {
            ModLog.Debug($"ToyPlane TrapStart failed: {ex.Message}");
        }

        try
        {
            var method = typeof(ValuablePlane).GetMethod("UpdateState",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            method?.Invoke(_plane, new object[] { ValuablePlane.State.Flying });
        }
        catch (Exception ex)
        {
            ModLog.Debug($"ToyPlane UpdateState failed: {ex.Message}");
        }
    }
}
