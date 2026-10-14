// Vibet — External Offsets
// Auto-generated. Do not edit manually.
#pragma once
#include <cstdint>

namespace Offsets {
    // DataModel
    constexpr uintptr_t DataModel_PlaceId        = 0x1A8;
    constexpr uintptr_t DataModel_JobId          = 0x1C0;
    constexpr uintptr_t DataModel_PlaceName      = 0x1D8;

    // Workspace
    constexpr uintptr_t Workspace_Gravity        = 0x2C8;
    constexpr uintptr_t Workspace_CurrentCamera  = 0x2E0;

    // Camera
    constexpr uintptr_t Camera_CFrame            = 0x118;
    constexpr uintptr_t Camera_Focus             = 0x138;
    constexpr uintptr_t Camera_ViewportSize      = 0x158;
    constexpr uintptr_t Camera_FieldOfView       = 0x170;

    // Players
    constexpr uintptr_t Players_LocalPlayer      = 0x1D0;
    constexpr uintptr_t Player_Character         = 0x2B8;
    constexpr uintptr_t Player_Name              = 0x060;
    constexpr uintptr_t Player_DisplayName       = 0x090;

    // Character / Humanoid
    constexpr uintptr_t Humanoid_Health          = 0x380;
    constexpr uintptr_t Humanoid_MaxHealth       = 0x390;
    constexpr uintptr_t Humanoid_WalkSpeed       = 0x3A0;
    constexpr uintptr_t Humanoid_JumpPower       = 0x3B8;
    constexpr uintptr_t HumanoidRootPart_CFrame  = 0x140;

    // Rendering
    constexpr uintptr_t ViewMatrix               = 0x00;
    constexpr uintptr_t ProjectionMatrix         = 0x40;
    constexpr uintptr_t WorldToScreenMatrix      = 0x80;

    // Instance
    constexpr uintptr_t Instance_ClassName       = 0x018;
    constexpr uintptr_t Instance_Name            = 0x068;
    constexpr uintptr_t Instance_Children        = 0x070;
    constexpr uintptr_t Instance_Parent          = 0x080;
}
