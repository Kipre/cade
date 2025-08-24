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
const sources_TKMesh = @import("TKMesh_generated-build-config.zig").sources;

fn addOCCTModule(b: *std.Build, target: std.Build.ResolvedTarget, optimize: std.builtin.OptimizeMode, name: []const u8, sources: []const []const u8) *std.Build.Step.Compile {
    const lib = b.addLibrary(.{
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
        .name = name,
    });

    lib.addCSourceFiles(.{ .files = sources, .flags = &.{"-fno-sanitize=undefined"} });
    lib.addIncludePath(b.path("inc"));
    lib.linkLibCpp();
    b.installArtifact(lib);
    return lib;
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

    // libraries
    const lib_TKernel = addOCCTModule(b, target, optimize, "TKernel", &sources_TKernel);
    const lib_TKMath = addOCCTModule(b, target, optimize, "TKMath", &sources_TKMath);
    const lib_TKG2d = addOCCTModule(b, target, optimize, "TKG2d", &sources_TKG2d);
    const lib_TKG3d = addOCCTModule(b, target, optimize, "TKG3d", &sources_TKG3d);
    const lib_TKGeomBase = addOCCTModule(b, target, optimize, "TKGeomBase", &sources_TKGeomBase);
    const lib_TKBRep = addOCCTModule(b, target, optimize, "TKBRep", &sources_TKBRep);
    const lib_TKGeomAlgo = addOCCTModule(b, target, optimize, "TKGeomAlgo", &sources_TKGeomAlgo);
    const lib_TKTopAlgo = addOCCTModule(b, target, optimize, "TKTopAlgo", &sources_TKTopAlgo);
    const lib_TKPrim = addOCCTModule(b, target, optimize, "TKPrim", &sources_TKPrim);
    const lib_TKFillet = addOCCTModule(b, target, optimize, "TKFillet", &sources_TKFillet);
    const lib_TKOffset = addOCCTModule(b, target, optimize, "TKOffset", &sources_TKOffset);
    const lib_TKFeat = addOCCTModule(b, target, optimize, "TKFeat", &sources_TKFeat);
    const lib_TKBool = addOCCTModule(b, target, optimize, "TKBool", &sources_TKBool);
    const lib_TKDESTEP = addOCCTModule(b, target, optimize, "TKDESTEP", &sources_TKDESTEP);
    const lib_TKXSBase = addOCCTModule(b, target, optimize, "TKXSBase", &sources_TKXSBase);
    const lib_TKShHealing = addOCCTModule(b, target, optimize, "TKShHealing", &sources_TKShHealing);
    const lib_TKBO = addOCCTModule(b, target, optimize, "TKBO", &sources_TKBO);
    const lib_TKMesh = addOCCTModule(b, target, optimize, "TKMesh", &sources_TKMesh);

    const occt_libs = [_]*std.Build.Step.Compile{
        lib_TKernel,     lib_TKMath,     lib_TKG2d,     lib_TKG3d,    lib_TKGeomBase,
        lib_TKBRep,      lib_TKGeomAlgo, lib_TKTopAlgo, lib_TKPrim,   lib_TKFillet,
        lib_TKOffset,    lib_TKFeat,     lib_TKBool,    lib_TKDESTEP, lib_TKXSBase,
        lib_TKShHealing, lib_TKBO,       lib_TKMesh,
    };

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

    if (target.result.os.tag == .windows) {
        exe.linkSystemLibrary("Ws2_32");
    }

    // link with the standard library libcpp
    exe.linkLibCpp();
    exe.addIncludePath(b.path("src"));
    exe.addIncludePath(b.path("inc"));
    exe.addCSourceFile(.{ .file = b.path("src/Solidify.cxx"), .flags = &.{"-fno-sanitize=undefined"} });

    for (occt_libs) |lib| {
        exe.linkLibrary(lib);
    }

    b.installArtifact(exe);

    // specific test
    const specific_test = b.addTest(.{
        .name = "test",
        .root_module = mod,
    });

    if (target.result.os.tag == .windows) {
        exe.linkSystemLibrary("Ws2_32");
    }
    specific_test.linkLibCpp();
    specific_test.addIncludePath(b.path("src"));
    specific_test.addIncludePath(b.path("inc"));
    specific_test.addCSourceFile(.{ .file = b.path("src/Solidify.cxx"), .flags = &.{"-fno-sanitize=undefined"} });

    for (occt_libs) |lib| {
        specific_test.linkLibrary(lib);
    }

    const specific_test_step = b.step("test", "Run tests");
    const run_specific = b.addRunArtifact(specific_test);
    specific_test_step.dependOn(&run_specific.step);
}
