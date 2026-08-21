using System.Reflection;
using TokControlREPOBridge.Logging;
using UnityEngine;

namespace TokControlREPOBridge.Commands;

/// <summary>
/// TokControl-spawned enemies: behave normally, but never auto-respawn after real death.
/// A new stream spawn command still creates a fresh enemy instance.
/// </summary>
internal sealed class DirectorEnemyDeathGuard : MonoBehaviour
{
    private const float SpawnGraceSeconds = 5f;

    private EnemyParent? _parent;
    private Enemy? _enemy;
    private float _graceTimer;
    private float _checkTimer;
    private bool _wasAlive;
    private bool _handled;

    public void Configure(EnemyParent parent, Enemy enemy)
    {
        _parent = parent;
        _enemy = enemy;
        _graceTimer = SpawnGraceSeconds;
        _wasAlive = false;
        _handled = false;
    }

    private void Update()
    {
        if (_handled || _parent == null) return;

        if (_graceTimer > 0f)
        {
            _graceTimer -= Time.deltaTime;
            return;
        }

        _checkTimer += Time.deltaTime;
        if (_checkTimer < 0.35f) return;
        _checkTimer = 0f;

        if (IsEnemyTrulyDead(_enemy, _parent))
        {
            if (!_wasAlive) return;

            _handled = true;
            PreventRespawn(_parent);
            ModLog.Info("TokControl enemy removed after death (no auto-respawn)");

            try
            {
                Destroy(_parent.gameObject);
            }
            catch
            {
                try { Destroy(gameObject); } catch { /* ignore */ }
            }

            return;
        }

        if (IsEnemyPresent(_enemy, _parent))
        {
            _wasAlive = true;
        }
    }

    internal static void PreventRespawn(EnemyParent? parent)
    {
        if (parent == null) return;

        try { parent.DespawnedTimerSet(999999f, true); } catch { /* ignore */ }
        try { parent.DespawnedTimerSet(999999f, false); } catch { /* ignore */ }
    }

    /// <summary>
    /// Only treat real death as dead — NOT temporary StateDespawn / inactive spawn cycles.
    /// Mis-classifying despawn as death was destroying freshly spawned ghosts.
    /// </summary>
    private static bool IsEnemyTrulyDead(Enemy? enemy, EnemyParent? parent)
    {
        if (enemy == null || parent == null) return true;
        if (parent.gameObject == null) return true;

        if (ReadBool(enemy, "isDead") || ReadBool(enemy, "dead")) return true;
        if (ReadBool(parent, "dead")) return true;

        try
        {
            var hasDeathProp = enemy.GetType().GetProperty("HasStateDeath");
            var stateDeathProp = enemy.GetType().GetProperty("StateDeath");
            if (hasDeathProp?.PropertyType == typeof(bool) && (bool)hasDeathProp.GetValue(enemy)!)
            {
                var state = stateDeathProp?.GetValue(enemy);
                if (state != null)
                {
                    var activeProp = state.GetType().GetProperty("Active");
                    if (activeProp?.PropertyType == typeof(bool) && (bool)activeProp.GetValue(state)!)
                    {
                        return true;
                    }
                }
            }
        }
        catch
        {
            // Ignore probe failures.
        }

        return false;
    }

    private static bool IsEnemyPresent(Enemy? enemy, EnemyParent? parent)
    {
        if (enemy == null || parent == null) return false;
        if (!parent.gameObject.activeInHierarchy) return false;
        if (!enemy.gameObject.activeInHierarchy) return false;
        if (ReadBool(enemy, "isDead") || ReadBool(enemy, "dead")) return false;
        return true;
    }

    private static bool ReadBool(object target, string fieldName)
    {
        try
        {
            var field = target.GetType().GetField(fieldName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (field?.FieldType == typeof(bool))
            {
                return (bool)field.GetValue(target);
            }
        }
        catch
        {
            // ignore
        }

        return false;
    }
}
