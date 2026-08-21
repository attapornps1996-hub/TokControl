using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal sealed class ToyCarDriveBehavior : MonoBehaviour
{
    private const float DriveForce = 34f;
    private const float BoostForce = 55f;
    private const float AggressiveForce = 62f;
    private const float MinSpeed = 6f;
    private const float UnstickImpulse = 16f;
    private const float PatrolRetargetDistance = 1.4f;

    private ValuableCar? _car;
    private Rigidbody? _rb;
    private Transform? _playerTarget;
    private Vector3 _patrolTarget;
    private bool _aggressive;
    private float _duration = 120f;
    private float _elapsed;
    private float _retryTimer;
    private float _boostTimer;
    private Vector3 _lastPosition;
    private float _stuckCheckTimer;
    private float _patrolRetargetTimer;
    private bool _hitPlayer;

    public void Configure(ValuableCar car, bool aggressive, float durationSeconds = 120f)
    {
        _car = car;
        _rb = car.GetComponentInChildren<Rigidbody>();
        _playerTarget = PlayerEffectHelper.GetLocalPlayer()?.transform;
        _aggressive = aggressive;
        _duration = Mathf.Max(10f, durationSeconds);
        _retryTimer = 0.1f;
        _boostTimer = 3f;
        _lastPosition = car.transform.position;
        _stuckCheckTimer = 0.35f;
        _patrolRetargetTimer = 0f;
        _patrolTarget = PickPatrolTarget();

        ClearStuck();
        TryDrive();
        ApplyLaunchBoost();
    }

    private void FixedUpdate()
    {
        if (_car == null || _rb == null) return;

        _elapsed += Time.fixedDeltaTime;
        if (_elapsed >= _duration)
        {
            Destroy(this);
            return;
        }

        ClearStuck();
        UpdatePatrolTarget();

        var forward = GetDriveDirection();
        _car.transform.rotation = Quaternion.Slerp(
            _car.transform.rotation,
            Quaternion.LookRotation(forward, Vector3.up),
            _aggressive ? 0.38f : 0.24f);

        var speed = Vector3.Dot(_rb.velocity, forward);
        var force = _aggressive
            ? AggressiveForce
            : _boostTimer > 0f ? BoostForce : DriveForce;
        if (speed < MinSpeed)
        {
            _rb.AddForce(forward * force, ForceMode.Acceleration);
        }

        _boostTimer -= Time.fixedDeltaTime;
        _retryTimer -= Time.fixedDeltaTime;
        if (_retryTimer <= 0f)
        {
            _retryTimer = 0.2f;
            if (!IsDriving()) TryDrive();
        }

        _stuckCheckTimer -= Time.fixedDeltaTime;
        if (_stuckCheckTimer <= 0f)
        {
            _stuckCheckTimer = 0.3f;
            CheckAndUnstick(forward);
        }
    }

    private void OnCollisionEnter(Collision collision)
    {
        if (!_aggressive || _hitPlayer) return;

        var player = collision.gameObject.GetComponentInParent<PlayerAvatar>();
        if (player == null) return;

        _hitPlayer = true;
        if (player.playerHealth != null)
        {
            player.playerHealth.HurtOther(5, Vector3.zero, false, -1, false);
        }

        if (player.tumble != null)
        {
            var force = (_car?.transform.forward ?? transform.forward) * 12f;
            PlayerEffectHelper.Knockdown(12f, 10f);
        }
    }

    private void UpdatePatrolTarget()
    {
        if (_aggressive) return;

        _patrolRetargetTimer -= Time.fixedDeltaTime;
        var dist = Vector3.Distance(_car!.transform.position, _patrolTarget);
        if (_patrolRetargetTimer <= 0f || dist < PatrolRetargetDistance)
        {
            _patrolRetargetTimer = UnityEngine.Random.Range(2.5f, 5f);
            _patrolTarget = PickPatrolTarget();
        }
    }

    private Vector3 PickPatrolTarget()
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

        return _car != null ? _car.transform.position + _car.transform.forward * 6f : transform.position;
    }

    private Vector3 GetDriveDirection()
    {
        if (_aggressive && _playerTarget != null)
        {
            var dir = _playerTarget.position - _car!.transform.position;
            dir.y = 0f;
            if (dir.sqrMagnitude > 0.04f) return dir.normalized;
        }

        var patrolDir = _patrolTarget - _car!.transform.position;
        patrolDir.y = 0f;
        if (patrolDir.sqrMagnitude > 0.04f) return patrolDir.normalized;

        var forward = _car.transform.forward;
        forward.y = 0f;
        return forward.sqrMagnitude > 0.01f ? forward.normalized : Vector3.forward;
    }

    private void CheckAndUnstick(Vector3 forward)
    {
        if (_car == null || _rb == null) return;

        var moved = Vector3.Distance(_car.transform.position, _lastPosition);
        _lastPosition = _car.transform.position;

        if (moved > 0.08f) return;

        ClearStuck();
        _rb.velocity = forward * Mathf.Max(MinSpeed, _rb.velocity.magnitude + 2f);
        _rb.AddForce(forward * UnstickImpulse + Vector3.up * 1.5f, ForceMode.VelocityChange);
        _boostTimer = Mathf.Max(_boostTimer, 1.2f);
        TryDrive();
    }

    private void ApplyLaunchBoost()
    {
        if (_rb == null || _car == null) return;

        var forward = GetDriveDirection();
        _rb.velocity = forward * (_aggressive ? 8.5f : 7f);
        _rb.AddForce(forward * (_aggressive ? 12f : 10f) + Vector3.up * 0.8f, ForceMode.VelocityChange);
    }

    private bool IsDriving()
    {
        if (_car == null) return false;

        try
        {
            var field = typeof(ValuableCar).GetField("currentState",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field?.GetValue(_car) is ValuableCar.State state)
            {
                return state == ValuableCar.State.MoveForward;
            }
        }
        catch
        {
            // ignore
        }

        return false;
    }

    private void TryDrive()
    {
        if (_car == null) return;

        try
        {
            _car.TrapStart();
        }
        catch (Exception ex)
        {
            ModLog.Debug($"ToyCarDriveBehavior TrapStart failed: {ex.Message}");
        }

        try
        {
            var method = typeof(ValuableCar).GetMethod("UpdateState",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            method?.Invoke(_car, new object[] { ValuableCar.State.MoveForward });
        }
        catch (Exception ex)
        {
            ModLog.Debug($"ToyCarDriveBehavior UpdateState failed: {ex.Message}");
        }
    }

    private void ClearStuck()
    {
        if (_car == null) return;
        TrySetField(_car, "stuck", false);
        TrySetField(_car, "stuckTime", 0f);
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
        catch
        {
            // ignore
        }
    }
}
