using UnityEngine;

namespace TokControlREPOBridge.Commands;

/// <summary>
/// Active stream-event subject: the player who triggered the gift (Player Effect = this avatar).
/// Mass Effect commands ignore this and target all alive players instead.
/// </summary>
internal static class EventContext
{
    public static PlayerAvatar? TargetPlayer { get; private set; }

    /// <summary>
    /// Gift combo / multiplier stacks for the current command.
    /// Duration-based effects (poop, player buffs) multiply or extend by this.
    /// </summary>
    public static int StackCount { get; private set; } = 1;

    public static void SetTarget(PlayerAvatar? player) => TargetPlayer = player;

    public static void SetStackCount(int count) =>
        StackCount = Mathf.Max(1, Mathf.Min(count, 100));

    public static void Clear()
    {
        TargetPlayer = null;
        StackCount = 1;
    }

    /// <summary>Solo / Player Effect subject (requesting player, else local).</summary>
    public static PlayerAvatar? SoloTarget()
    {
        if (TargetPlayer != null) return TargetPlayer;
        return SemiFunc.PlayerAvatarLocal();
    }
}
