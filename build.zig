const std = @import("std");

const modules = [_][]const u8{
    "OCCT/src/FoundationClasses/TKernel",
    "OCCT/src/FoundationClasses/TKMath",
    "OCCT/src/ModelingData/TKG2d",
    "OCCT/src/ModelingData/TKG3d",
    "OCCT/src/ModelingData/TKGeomBase",
    "OCCT/src/ModelingData/TKBRep",
    "OCCT/src/ModelingAlgorithms/TKGeomAlgo",
    "OCCT/src/ModelingAlgorithms/TKTopAlgo",
    "OCCT/src/ModelingAlgorithms/TKPrim",
    "OCCT/src/ModelingAlgorithms/TKFillet",
    "OCCT/src/ModelingAlgorithms/TKOffset",
    "OCCT/src/ModelingAlgorithms/TKFeat",
    "OCCT/src/ModelingAlgorithms/TKBool",
    "OCCT/src/ModelingAlgorithms/TKShHealing",
    "OCCT/src/ModelingAlgorithms/TKBO",
    "OCCT/src/ModelingAlgorithms/TKMesh",
    "OCCT/src/DataExchange/TKDESTEP",
    "OCCT/src/DataExchange/TKXSBase",
    "OCCT/src/ModelingAlgorithms/TKHLR",
};

fn addOCCTLibs(occt_libs: []const *std.Build.Step.Compile, exe: *std.Build.Step.Compile) void {
    for (occt_libs) |lib| {
        exe.root_module.linkLibrary(lib);
    }
}

fn addStaticOCCTLibs(b: *std.Build, path: []const u8, exe: *std.Build.Step.Compile) void {
    for (modules) |mod| {
        const module_name = std.fs.path.stem(mod);
        exe.root_module.addObjectFile(b.path(b.fmt("{s}/{s}.lib", .{ path, module_name })));
    }
}

pub fn addOCCTModule(b: *std.Build, io: std.Io, target: std.Build.ResolvedTarget, optimize: std.builtin.OptimizeMode, name: []const u8) *std.Build.Step.Compile {
    const module_name = std.fs.path.stem(name);
    const lib = b.addLibrary(.{
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
        .name = module_name,
    });

    addCSourceFilesRecursive(b, io, lib, name, &.{"-fno-sanitize=undefined"}) catch |err| {
        std.debug.print("Failed to add source files: {}\n", .{err});
    };

    lib.root_module.link_libcpp = true;
    b.installArtifact(lib);
    return lib;
}

fn addCSourceFilesRecursive(b: *std.Build, io: std.Io, exe: *std.Build.Step.Compile, path: []const u8, flags: []const []const u8) !void {
    var dir = try std.Io.Dir.cwd().openDir(io, path, .{ .iterate = true });
    defer dir.close(io);

    var it = dir.iterate();
    while (try it.next(io)) |entry| {
        const full_path = try std.fs.path.join(b.allocator, &.{ path, entry.name });

        if (std.mem.indexOf(u8, full_path, "GTests") != null) continue;

        if (entry.kind == .directory) {
            try addCSourceFilesRecursive(b, io, exe, full_path, flags);
        } else if (entry.kind == .file) {
            const ext = std.fs.path.extension(entry.name);
            if (std.mem.eql(u8, ext, ".cpp") or std.mem.eql(u8, ext, ".cxx") or std.mem.eql(u8, ext, ".c")) {
                exe.root_module.addCSourceFile(.{
                    .file = b.path(full_path),
                    .flags = flags,
                });
            }
        }
    }
}

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    var threaded: std.Io.Threaded = .init_single_threaded;
    defer threaded.deinit();

    const io = threaded.io();

    // ideally we should read the values from version.cmake
    const standard_version_h = b.addConfigHeader(.{
        .style = .{ .cmake = b.path("OCCT/adm/templates/Standard_Version.hxx.in") },
        .include_path = "Standard_Version.hxx",
    }, .{
        .OCCT_VERSION_DATE = "01/01/2026", // hardcoding to avoid cache misses
        .OCC_VERSION_MAJOR = "8",
        .OCC_VERSION_MINOR = "0",
        .OCC_VERSION_MAINTENANCE = "0",
        .SET_OCC_VERSION_DEVELOPMENT = "",
    });

    const skip_header_flattening = b.option(
        bool,
        "skip-headers",
        "Skip headers flattening (default is false)",
    ) orelse false;

    const staticOCCT = b.option(
        []const u8,
        "static-occt",
        "Path to a folder with static OCCT libs",
    ) orelse "";
    const buildOCCTLibs = std.mem.eql(u8, staticOCCT, "");

    const occ = b.addTranslateC(.{
        .root_source_file = b.path("src/occ.h"),
        .target = target,
        .optimize = optimize,
    });

    const flattening_tool = b.addExecutable(.{
        .name = "header-flattening-tool",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/flatten_headers.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });
    const flatten_headers = b.addRunArtifact(flattening_tool);

    const include_dir = b.path(".zig-cache/flattened-headers");

    flatten_headers.addArg(include_dir.src_path.sub_path);

    var occt_libs: [19]*std.Build.Step.Compile = undefined;

    for (modules, 0..) |module, i| {
        var lib = addOCCTModule(b, io, target, optimize, module);
        if (!skip_header_flattening)
            lib.step.dependOn(&flatten_headers.step);

        lib.root_module.addIncludePath(include_dir);
        lib.root_module.addIncludePath(standard_version_h.getOutputDir());
        if (buildOCCTLibs)
            b.installArtifact(lib);
        occt_libs[i] = lib;
    }

    const mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
        .imports = &.{
            .{
                .name = "occ",
                .module = occ.createModule(),
            },
        },
    });

    const exe = b.addExecutable(.{
        .name = "cade",
        .root_module = mod,
    });
    exe.root_module.addIncludePath(include_dir);
    exe.root_module.addIncludePath(standard_version_h.getOutputDir());

    if (target.result.os.tag == .windows) {
        exe.root_module.linkSystemLibrary("Ws2_32", .{});
    }

    exe.root_module.link_libcpp = true;
    exe.root_module.addIncludePath(b.path("src"));
    exe.root_module.addCSourceFile(.{ .file = b.path("src/occ.cxx"), .flags = &.{"-fno-sanitize=undefined"} });
    exe.root_module.addCSourceFile(.{ .file = b.path("src/svg.cxx"), .flags = &.{"-fno-sanitize=undefined"} });

    if (buildOCCTLibs) {
        addOCCTLibs(&occt_libs, exe);
    } else {
        addStaticOCCTLibs(b, staticOCCT, exe);
    }

    b.installArtifact(exe);
}

