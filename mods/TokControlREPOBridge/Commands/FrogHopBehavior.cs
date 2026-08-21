using UnityEngine;

namespace TokControlREPOBridge.Commands;

internal sealed class FrogHopBehavior : MonoBehaviour
{
    private Rigidbody? _rb;
    private float _nextHop;
    private float _duration = 120f;
    private float _elapsed;
    private bool _wasAirborne;

    public void Configure(float durationSeconds = 120f)
    {
        _duration = Mathf.Max(10f, durationSeconds);
        _rb = GetComponentInChildren<Rigidbody>();
        _nextHop = Random.Range(0.4f, 1f);

        if (_rb != null)
        {
            _rb.isKinematic = false;
            _rb.WakeUp();
        }
    }

    private void FixedUpdate()
    {
        if (_rb == null || ValuableDamageHelper.IsDestroyed(gameObject))
        {
            Destroy(this);
            return;
        }

        _elapsed += Time.fixedDeltaTime;
        if (_elapsed >= _duration)
        {
            Destroy(this);
            return;
        }

        var grounded = IsGrounded();
        if (grounded && _wasAirborne)
        {
            ValuableDamageHelper.ApplyImpactDamage(gameObject, 0.18f, heavy: false);
            if (ValuableDamageHelper.IsDestroyed(gameObject))
            {
                Destroy(this);
                return;
            }
        }

        _wasAirborne = !grounded;

        _nextHop -= Time.fixedDeltaTime;
        if (_nextHop > 0f) return;
        if (!grounded) return;
        if (_rb.velocity.y > 1.5f) return;

        _nextHop = Random.Range(1.1f, 2f);

        var forward = transform.forward;
        forward.y = 0f;
        if (forward.sqrMagnitude < 0.01f) forward = Vector3.forward;
        forward.Normalize();

        var hop = forward * Random.Range(1.2f, 2.4f) + Vector3.up * Random.Range(2.8f, 4.2f);
        _rb.AddForce(hop, ForceMode.Impulse);
    }

    private bool IsGrounded()
    {
        var origin = transform.position + Vector3.up * 0.15f;
        return Physics.Raycast(origin, Vector3.down, 0.55f, Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore);
    }
}
