// Polyfill for C# 9+ `init` accessors on .NET Standard 2.1
// https://github.com/dotnet/roslyn/issues/45510

namespace System.Runtime.CompilerServices
{
    internal static class IsExternalInit
    {
    }
}
