using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal sealed class CartItemScatterBehavior : MonoBehaviour
{
    private Rigidbody? _rb;
    private bool _airborne;
    private float _airTime;
    private bool _ceilingHitThisArc;
    private float _cooldown;

    public void Begin()
    {
        _rb = GetComponentInChildren<Rigidbody>();
    }

    private void FixedUpdate()
    {
        if (_rb == null || ValuableDamageHelper.IsDestroyed(gameObject))
        {
            Destroy(this);
            return;
        }

        _cooldown -= Time.fixedDeltaTime;
        CheckCeilingHit();

        var grounded = IsGrounded();
        if (!grounded)
        {
            _airborne = true;
            _airTime += Time.fixedDeltaTime;
            return;
        }

        if (_airborne && _airTime > 0.12f)
        {
            ApplyImpact(false);
            if (ValuableDamageHelper.IsDestroyed(gameObject))
            {
                Destroy(this);
                return;
            }
        }

        _airborne = false;
        _airTime = 0f;
        _ceilingHitThisArc = false;
    }

    private void CheckCeilingHit()
    {
        if (_rb == null || _ceilingHitThisArc || _rb.velocity.y < 0.8f) return;

        var origin = transform.position + Vector3.up * 0.15f;
        if (!Physics.Raycast(origin, Vector3.up, out var hit, 1.4f, Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore))
        {
            return;
        }

        if (hit.normal.y > -0.2f) return;
        if (_cooldown > 0f) return;

        ApplyImpact(heavy: true);
        _ceilingHitThisArc = true;
    }

    private void ApplyImpact(bool heavy)
    {
        if (_cooldown > 0f) return;
        _cooldown = 0.18f;
        ValuableDamageHelper.ApplyImpactDamage(gameObject, 0.22f, heavy);
    }

    private bool IsGrounded()
    {
        var origin = transform.position + Vector3.up * 0.1f;
        return Physics.Raycast(origin, Vector3.down, 0.35f, Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore);
    }
}
