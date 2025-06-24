const std = @import("std");
const sources_TKernel = @import("TKernel_generated-build-config.zig").sources;
const sources_TKMath = @import("TKMath_generated-build-config.zig").sources;

pub fn build(b: *std.Build) void {
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

    const TKernel = b.addStaticLibrary(.{
        .name = "TKernel",
        .target = target,
        .optimize = optimize,
    });

    TKernel.addCSourceFiles(.{ .files = &sources_TKernel });
    TKernel.addIncludePath(b.path("inc"));
    TKernel.linkLibCpp();
    b.installArtifact(TKernel);

    const TKMath = b.addStaticLibrary(.{
        .name = "TKernel",
        .target = target,
        .optimize = optimize,
    });

    TKMath.addCSourceFiles(.{ .files = &sources_TKMath });
    TKMath.addIncludePath(b.path("inc"));
    TKMath.linkLibCpp();
    b.installArtifact(TKMath);


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
    exe.linkLibCpp();
    exe.addIncludePath(b.path("src"));
    exe.addIncludePath(b.path("inc"));

    exe.linkLibrary(TKernel);
    exe.linkLibrary(TKMath);

    exe.addCSourceFile(.{ .file = b.path("src/MakeBottle.cxx") });

    b.installArtifact(exe);
}

