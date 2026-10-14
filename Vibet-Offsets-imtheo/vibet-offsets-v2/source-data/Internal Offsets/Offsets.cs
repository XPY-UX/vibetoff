// Vibet — Internal Offsets (C#)
// Auto-generated. Do not edit manually.

public static class Offsets
{
    // Core
    public const ulong RenderView        = 0x060;
    public const ulong ScriptContext      = 0x0A0;
    public const ulong TaskScheduler      = 0x1E8;

    // Lua VM
    public const ulong LuaState          = 0x120;
    public const ulong LuaGlobals        = 0x130;
    public const ulong ExtraSpace        = 0x008;
    public const ulong Userdata          = 0x018;

    // Instance internals
    public const ulong ClassDescriptor   = 0x010;
    public const ulong ChildrenOffset    = 0x040;
    public const ulong RootInstance      = 0x060;

    // Physics
    public const ulong Primitives        = 0x190;
    public const ulong AssemblyVelocity  = 0x080;
    public const ulong CFrameOffset      = 0x044;

    // Anti-cheat bypass hooks (test)
    public const ulong CheckOffset       = 0x2F8;
    public const ulong FlagOffset        = 0x300;
}
