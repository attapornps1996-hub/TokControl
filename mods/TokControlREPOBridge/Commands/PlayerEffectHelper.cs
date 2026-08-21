using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using TokControlREPOBridge.Logging;
using UnityEngine;
using UnityEngine.InputSystem;

namespace TokControlREPOBridge.Commands;

internal static class PlayerEffectHelper
{
    public static PlayerAvatar? GetLocalPlayer() => EventContext.SoloTarget() ?? SemiFunc.PlayerAvatarLocal();

    public static bool DisableAiming(float seconds)
    {
        var im = InputManager.instance;
        if (im == null) return false;
        im.DisableAiming(seconds);
        return true;
    }

    public static bool DisableMovement(float seconds)
    {
        var im = InputManager.instance;
        if (im == null) return false;
        im.DisableMovement(seconds);
        return true;
    }

    public static bool DisableInputKey(string keyName, float seconds)
    {
        if (!Enum.TryParse(keyName, true, out InputKey key))
        {
            ModLog.Warn($"Unknown input key: {keyName}");
            return false;
        }

        if (key == InputKey.Movement)
        {
            return DisableMovement(seconds);
        }

        var im = InputManager.instance;
        if (im == null) return false;

        var allowed = Enum.GetValues(typeof(InputKey)).Cast<InputKey>()
            .Where(k => k != key)
            .ToList();
        im.DisableControlsExcept(seconds, allowed);
        return true;
    }

    public static bool HoldInputKey(string keyName, float seconds)
    {
        if (!Enum.TryParse(keyName, true, out InputKey key))
        {
            return false;
        }

        if (key == InputKey.Crouch)
        {
            EffectTimerHost.Instance.RunForSeconds(
                "hold_crouch",
                seconds,
                _ =>
                {
                    var player = GetLocalPlayer();
                    if (player == null || player.isCrouching) return;
                    player.StandToCrouch();
                });
            return true;
        }

        return DisableInputKey(keyName, seconds);
    }

    public static bool ShuffleMovement(float seconds)
    {
        seconds = Mathf.Max(1f, seconds);

        // Already shuffling → only extend timer (don't reset binds mid-effect).
        if (_movementShuffleActive && EffectTimerHost.Instance.GetRemaining("shuffle_movement") > 0.05f)
        {
            EffectTimerHost.Instance.RunForSeconds(
                "shuffle_movement",
                seconds,
                _ => { },
                () =>
                {
                    RestoreMovementBinds();
                    ModLog.Info("shuffle_player_movement ends — WASD restored");
                });
            return true;
        }

        // Fresh start — end previous cleanly then apply binds.
        ForceEndMovementShuffle();

        if (!ShuffleMovementBinds())
        {
            return false;
        }

        _movementShuffleActive = true;
        ModLog.Info($"shuffle_player_movement active for {seconds:0}s");

        EffectTimerHost.Instance.RunForSeconds(
            "shuffle_movement",
            seconds,
            _ => { },
            () =>
            {
                RestoreMovementBinds();
                ModLog.Info("shuffle_player_movement ends — WASD restored");
            });

        return true;
    }

    /// <summary>Force-clear timed WASD shuffle (e.g. when returning to menu).</summary>
    public static void ForceEndMovementShuffle()
    {
        try
        {
            EffectTimerHost.Instance.Stop("shuffle_movement", invokeEnd: false);
        }
        catch
        {
            // ignore
        }

        RestoreMovementBinds();
    }

    private static bool _movementShuffleActive;

    private static readonly string[] MovementBindNames = { "Up", "Down", "Left", "Right" };

    public static bool IsMovementShuffleActive => _movementShuffleActive;

    private static InputAction? GetMovementAction()
    {
        var im = InputManager.instance;
        if (im == null) return null;

        try
        {
            if (im.inputActions != null && im.inputActions.TryGetValue(InputKey.Movement, out var action))
            {
                return action;
            }
        }
        catch
        {
            // Fall through to GetMovementAction API.
        }

        try { return im.GetMovementAction(); }
        catch { return null; }
    }

    private static bool ShuffleMovementBinds()
    {
        var action = GetMovementAction();
        if (action == null)
        {
            ModLog.Warn("shuffle_player_movement: Movement InputAction missing");
            return false;
        }

        InputBinding? up = null, down = null, left = null, right = null;
        foreach (var binding in action.bindings)
        {
            var name = binding.name;
            if (name == "Up") up = binding;
            else if (name == "Down") down = binding;
            else if (name == "Left") left = binding;
            else if (name == "Right") right = binding;
        }

        if (up == null || down == null || left == null || right == null)
        {
            ModLog.Warn("shuffle_player_movement: missing Up/Down/Left/Right bindings");
            return false;
        }

        SwapMovementBind(action, up.Value, down.Value);
        SwapMovementBind(action, left.Value, right.Value);
        return true;
    }

    private static void SwapMovementBind(InputAction action, InputBinding a, InputBinding b)
    {
        var pathA = a.path;
        var pathB = b.path;
        a.overridePath = pathB;
        b.overridePath = pathA;
        action.ApplyBindingOverride(a);
        action.ApplyBindingOverride(b);
        ModLog.Debug($"WASD swap {a.name}:{pathA}->{pathB}, {b.name}:{pathB}->{pathA}");
    }

    private static void RestoreMovementBinds()
    {
        _movementShuffleActive = false;
        var action = GetMovementAction();
        if (action == null) return;

        try
        {
            foreach (var binding in action.bindings)
            {
                if (!MovementBindNames.Contains(binding.name)) continue;
                var cleared = binding;
                cleared.overridePath = null;
                action.ApplyBindingOverride(cleared);
            }

            // Clear temporary overrides only — keep the player's saved base binds.
        }
        catch (Exception ex)
        {
            ModLog.Warn($"RestoreMovementBinds failed: {ex.Message}");
        }
    }

    public static bool Knockdown(float force, float rotatePower)
    {
        var player = GetLocalPlayer();
        if (player?.tumble == null) return false;

        var direction = player.localCamera != null
            ? player.localCamera.transform.forward * force
            : player.transform.forward * force;

        ActivateTumble(player.tumble, player, direction, rotatePower);
        return true;
    }

    public static bool HurtPlayerAmount(bool allPlayers, int amount, bool savingGrace)
    {
        var applied = false;
        foreach (var player in GetTargets(allPlayers))
        {
            if (player?.playerHealth == null) continue;
            var health = player.playerHealth.health;
            var damage = amount;
            if (savingGrace && health <= damage)
            {
                damage = Mathf.Max(0, health - 1);
                if (damage == 0) continue;
            }

            player.playerHealth.HurtOther(damage, Vector3.zero, savingGrace, -1, false);
            applied = true;
        }

        return applied;
    }

    public static bool SlapAllRoom(int amount)
    {
        var local = SemiFunc.PlayerAvatarLocal();
        var applied = false;

        foreach (var player in PlayerTargeting.AlivePlayers())
        {
            if (player?.playerHealth == null) continue;

            var health = player.playerHealth.health;
            if (health <= 0) continue;

            var isSelf = local != null && (player == local || SameAvatar(player, local));
            if (isSelf)
            {
                var damage = Mathf.Max(1, amount);
                if (health <= damage) damage = Mathf.Max(0, health - 1);
                if (damage > 0)
                {
                    player.playerHealth.HurtOther(damage, Vector3.zero, true, -1, false);
                }
            }
            else
            {
                try { player.PlayerDeath(-1); }
                catch
                {
                    player.playerHealth.HurtOther(Mathf.Max(health, 999), Vector3.zero, false, -1, false);
                }
            }

            applied = true;
        }

        return applied;
    }

    private static bool SameAvatar(PlayerAvatar a, PlayerAvatar b)
    {
        if (a == null || b == null) return false;
        try
        {
            if (a.photonView != null && b.photonView != null)
                return a.photonView.ViewID == b.photonView.ViewID;
        }
        catch { /* ignore */ }
        return false;
    }

    public static bool HealPlayerAmount(bool allPlayers, int amount)
    {
        var applied = false;
        foreach (var player in GetTargets(allPlayers))
        {
            if (player?.playerHealth == null) continue;
            player.playerHealth.HealOther(amount, true);
            applied = true;
        }

        return applied;
    }

    public static bool ExplodeLocalPlayer()
    {
        var player = GetLocalPlayer();
        if (player == null) return false;
        player.PlayerDeath(-1);
        return true;
    }

    public static bool RestoreStamina()
    {
        var pc = PlayerController.instance;
        if (pc == null) return false;
        pc.EnergyCurrent = pc.EnergyStart;
        return true;
    }

    public static bool InfiniteStamina(float seconds)
    {
        var id = "infinite_stamina";
        EffectTimerHost.Instance.RunForSeconds(id, seconds, _ =>
        {
            var pc = PlayerController.instance;
            if (pc == null) return;
            pc.EnergyCurrent = pc.EnergyStart;
        });
        return true;
    }

    public static bool DrainStamina(float seconds, float powerPerSecond)
    {
        EffectTimerHost.Instance.RunForSeconds("drain_stamina", seconds, dt =>
        {
            var pc = PlayerController.instance;
            if (pc == null) return;
            pc.EnergyCurrent = Mathf.Max(0f, pc.EnergyCurrent - powerPerSecond * dt);
        });
        return true;
    }

    public static bool Invincible(float seconds)
    {
        EffectTimerHost.Instance.RunForSeconds("invincible", seconds, _ =>
        {
            var player = GetLocalPlayer();
            player?.playerHealth?.InvincibleSet(0.25f);
        });
        return true;
    }

    public static bool SetSpeedMultiplier(float seconds, float multiplier)
    {
        var pc = PlayerController.instance;
        if (pc == null) return false;
        pc.OverrideSpeed(multiplier, seconds);
        return true;
    }

    public static bool SetJumpPower(float seconds, float jumpForce)
    {
        var pc = PlayerController.instance;
        if (pc == null) return false;

        var original = pc.JumpForce;
        pc.JumpForce = jumpForce;
        EffectTimerHost.Instance.RunForSeconds("jump_power", seconds, _ => { pc.JumpForce = jumpForce; }, () =>
        {
            if (PlayerController.instance != null)
            {
                PlayerController.instance.JumpForce = original;
            }
        });
        return true;
    }

    public static bool EnableAntiGravity(float seconds)
    {
        var pc = PlayerController.instance;
        if (pc == null) return false;
        pc.AntiGravity(seconds);
        return true;
    }

    public static bool SetHeavyGravity(float seconds, float gravity)
    {
        var pc = PlayerController.instance;
        if (pc == null) return false;

        var original = pc.CustomGravity;
        var originalPlayer = ReadFloatField(pc, "playerOriginalCustomGravity", original);
        pc.CustomGravity = gravity;
        WriteFloatField(pc, "playerOriginalCustomGravity", gravity);

        EffectTimerHost.Instance.RunForSeconds("heavy_gravity", seconds, _ =>
        {
            if (PlayerController.instance == null) return;
            PlayerController.instance.CustomGravity = gravity;
            WriteFloatField(PlayerController.instance, "playerOriginalCustomGravity", gravity);
        }, () =>
        {
            if (PlayerController.instance == null) return;
            PlayerController.instance.CustomGravity = original;
            WriteFloatField(PlayerController.instance, "playerOriginalCustomGravity", originalPlayer);
        });

        return true;
    }

    public static bool RelativeForceMove(float forward, float right, float rotatePower)
    {
        var player = GetLocalPlayer();
        if (player == null) return false;

        var force = player.transform.forward.normalized * forward +
                    player.transform.right.normalized * (-right);
        player.ForceImpulse(force);

        if (player.isCrouching || player.isCrawling)
        {
            ActivateTumble(player.tumble, player, force, rotatePower);
        }

        return true;
    }

    public static bool ForceRigidBody(float x, float y, float z, float rotatePower)
    {
        var player = GetLocalPlayer();
        if (player?.tumble == null) return false;
        ActivateTumble(player.tumble, player, new Vector3(x, y, z), rotatePower);
        return true;
    }

    public static bool SetHealthPercent(bool allPlayers, float percent)
    {
        var applied = false;
        foreach (var player in GetTargets(allPlayers))
        {
            if (player?.playerHealth == null) continue;

            var max = player.playerHealth.maxHealth;
            var target = Mathf.Clamp(Mathf.CeilToInt(max * (percent / 100f)), 1, max);
            var delta = target - player.playerHealth.health;
            if (delta > 0)
            {
                player.playerHealth.HealOther(delta, true);
            }
            else if (delta < 0)
            {
                player.playerHealth.HurtOther(-delta, Vector3.zero, false, -1, false);
            }

            applied = true;
        }

        return applied;
    }

    private static IEnumerable<PlayerAvatar> GetTargets(bool allPlayers) =>
        PlayerTargeting.GetAliveEventTargets(allPlayers);

    public static bool DropInventory()
    {
        var player = GetLocalPlayer();
        if (player == null || PlayerTargeting.IsPlayerDead(player)) return false;

        try
        {
            var physGrab = player.GetComponentInChildren<PhysGrabber>(true);
            if (physGrab != null)
            {
                TryInvoke(physGrab, "ReleaseObject");
                TryInvoke(physGrab, "DropObject");
            }
        }
        catch (Exception ex)
        {
            ModLog.Debug($"DropInventory: {ex.Message}");
        }

        return true;
    }

    private static void TryInvoke(Component comp, string methodName)
    {
        try
        {
            var method = comp.GetType().GetMethod(methodName,
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (method == null || method.GetParameters().Length != 0) return;
            method.Invoke(comp, null);
        }
        catch { /* ignore */ }
    }

    private static void ActivateTumble(PlayerTumble tumble, PlayerAvatar player, Vector3 force, float rotatePower)
    {
        tumble.TumbleForce(force);
        tumble.TumbleTorque(tumble.transform.right * rotatePower);

        try
        {
            var method = typeof(PlayerTumble).GetMethod("BreakFree",
                BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            var forward = player.localCamera != null
                ? player.localCamera.transform.forward
                : player.transform.forward;
            method?.Invoke(tumble, new object[] { forward });
        }
        catch (Exception ex)
        {
            ModLog.Debug($"BreakFree failed: {ex.Message}");
        }

        tumble.TumbleSet(true, false);
    }

    private static float ReadFloatField(object target, string fieldName, float fallback)
    {
        var field = target.GetType().GetField(fieldName,
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        return field != null ? (float)field.GetValue(target) : fallback;
    }

    private static void WriteFloatField(object target, string fieldName, float value)
    {
        var field = target.GetType().GetField(fieldName,
            BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
        field?.SetValue(target, value);
    }
}
