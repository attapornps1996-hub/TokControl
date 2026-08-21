using System;
using TokControlREPOBridge.Logging;
using TokControlREPOBridge.Util;

namespace TokControlREPOBridge.Commands;

public sealed partial class GameActions
{
    internal CommandResult ApplyEffect(string eventId, string user) =>
        StreamEventRunner.Execute(eventId, user);
}
