const std = @import("std");
const sources_TKernel = @import("TKernel_generated-build-config.zig").sources;
const sources_TKMath = @import("TKMath_generated-build-config.zig").sources;
const sources_TKG2d = @import("TKG2d_generated-build-config.zig").sources;
const sources_TKG3d = @import("TKG3d_generated-build-config.zig").sources;
const sources_TKGeomBase = @import("TKGeomBase_generated-build-config.zig").sources;
const sources_TKBRep = @import("TKBRep_generated-build-config.zig").sources;
const sources_TKGeomAlgo = @import("TKGeomAlgo_generated-build-config.zig").sources;
const sources_TKTopAlgo = @import("TKTopAlgo_generated-build-config.zig").sources;
const sources_TKPrim = @import("TKPrim_generated-build-config.zig").sources;
const sources_TKFillet = @import("TKFillet_generated-build-config.zig").sources;
const sources_TKOffset = @import("TKOffset_generated-build-config.zig").sources;
const sources_TKFeat = @import("TKFeat_generated-build-config.zig").sources;
const sources_TKBool = @import("TKBool_generated-build-config.zig").sources;
const sources_TKDESTEP = @import("TKDESTEP_generated-build-config.zig").sources;
const sources_TKXSBase = @import("TKXSBase_generated-build-config.zig").sources;
const sources_TKShHealing = @import("TKShHealing_generated-build-config.zig").sources;
const sources_TKBO = @import("TKBO_generated-build-config.zig").sources;

fn addOCCTModule(b: *std.Build, target: std.Build.ResolvedTarget, optimize: std.builtin.OptimizeMode, name: []const u8, sources: []const []const u8) *std.Build.Step.Compile {
    const module = b.addStaticLibrary(.{
        .name = name,
        .target = target,
        .optimize = optimize,
    });

    module.addCSourceFiles(.{ .files = sources });
    module.addIncludePath(b.path("inc"));
    module.linkLibCpp();
    b.installArtifact(module);
    return module;
}

pub fn build(b: *std.Build) void {
    const only_gen_tool = b.option(
        bool,
        "only_tools",
        "Only build the generator tool executable",
    ) orelse false;

    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const exe_mod = b.createModule(.{
        .root_source_file = b.path("tools/gen_build_file.zig"),
        .target = target,
        .optimize = optimize,
    });

    // Create a tool that generates the source list
    const gen_sources = b.addExecutable(.{
        .name = "gen_build_file",
        .root_module = exe_mod,
    });

    b.installArtifact(gen_sources);

    if (only_gen_tool) return;

    // main module
    const mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });

    const exe = b.addExecutable(.{
        .name = "cade",
        .root_module = mod,
    });

    // link with the standard library libcpp
    exe.linkSystemLibrary("Ws2_32");
    exe.linkLibCpp();
    exe.addIncludePath(b.path("src"));
    exe.addIncludePath(b.path("inc"));
    exe.addCSourceFile(.{ .file = b.path("src/MakeBottle.cxx") });
    exe.addCSourceFile(.{ .file = b.path("src/Solidify.cxx") });

    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKernel", &sources_TKernel));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKMath", &sources_TKMath));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKG2d", &sources_TKG2d));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKG3d", &sources_TKG3d));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKGeomBase", &sources_TKGeomBase));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKBRep", &sources_TKBRep));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKGeomAlgo", &sources_TKGeomAlgo));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKTopAlgo", &sources_TKTopAlgo));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKPrim", &sources_TKPrim));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKFillet", &sources_TKFillet));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKOffset", &sources_TKOffset));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKFeat", &sources_TKFeat));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKBool", &sources_TKBool));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKDESTEP", &sources_TKDESTEP));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKXSBase", &sources_TKXSBase));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKShHealing", &sources_TKShHealing));
    exe.linkLibrary(addOCCTModule(b, target, optimize, "TKBO", &sources_TKBO));

    b.installArtifact(exe);
}
