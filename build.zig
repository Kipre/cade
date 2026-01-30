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

fn addDependencies(b: *std.Build, target: std.Build.ResolvedTarget, occt_libs: []const *std.Build.Step.Compile, exe: *std.Build.Step.Compile) void {
    if (target.result.os.tag == .windows) {
        exe.linkSystemLibrary("Ws2_32");
    }

    exe.linkLibCpp();
    exe.addIncludePath(b.path("src"));
    exe.addCSourceFile(.{ .file = b.path("src/occ.cxx"), .flags = &.{"-fno-sanitize=undefined"} });
    exe.addCSourceFile(.{ .file = b.path("src/svg.cxx"), .flags = &.{"-fno-sanitize=undefined"} });

    for (occt_libs) |lib| {
        exe.linkLibrary(lib);
    }
}

pub fn addOCCTModule(b: *std.Build, target: std.Build.ResolvedTarget, optimize: std.builtin.OptimizeMode, name: []const u8) *std.Build.Step.Compile {
    const module_name = std.fs.path.stem(name);
    const lib = b.addLibrary(.{
        .root_module = b.createModule(.{
            .target = target,
            .optimize = optimize,
        }),
        .name = module_name,
    });

    addCSourceFilesRecursive(b, lib, name, &.{"-fno-sanitize=undefined"}) catch |err| {
        std.debug.print("Failed to add source files: {}\n", .{err});
    };

    lib.linkLibCpp();
    b.installArtifact(lib);
    return lib;
}

fn addCSourceFilesRecursive(b: *std.Build, exe: *std.Build.Step.Compile, path: []const u8, flags: []const []const u8) !void {
    var dir = try std.fs.cwd().openDir(path, .{ .iterate = true });
    defer dir.close();

    var it = dir.iterate();
    while (try it.next()) |entry| {
        const full_path = try std.fs.path.join(b.allocator, &.{ path, entry.name });

        if (std.mem.indexOf(u8, full_path, "GTests") != null) continue;

        if (entry.kind == .directory) {
            try addCSourceFilesRecursive(b, exe, full_path, flags);
        } else if (entry.kind == .file) {
            const ext = std.fs.path.extension(entry.name);
            if (std.mem.eql(u8, ext, ".cpp") or std.mem.eql(u8, ext, ".cxx") or std.mem.eql(u8, ext, ".c")) {
                exe.addCSourceFile(.{
                    .file = b.path(full_path),
                    .flags = flags,
                });
            }
        }
    }
}

pub fn build(b: *std.Build) void {
    // ideally we should read the values from version.cmake
    const standard_version_h = b.addConfigHeader(.{
        .style = .{ .cmake = b.path("OCCT/adm/templates/Standard_Version.hxx.in") },
        .include_path = ".zig-cache/flattened-headers/Standard_Version.hxx",
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

    const flatten_step = FlattenHeadersStep.create(b, "OCCT/src", skip_header_flattening);

    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    var occt_libs: [19]*std.Build.Step.Compile = undefined;

    for (modules, 0..) |module, i| {
        var lib = addOCCTModule(b, target, optimize, module);
        lib.step.dependOn(&flatten_step.step);
        lib.addIncludePath(flatten_step.getOutput());
        lib.addConfigHeader(standard_version_h);
        occt_libs[i] = lib;
    }

    const mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });

    // // specific test
    // const specific_test = b.addTest(.{
    //     .name = "test",
    //     .root_module = mod,
    // });
    //
    // addDependencies(b, target, &occt_libs, specific_test);
    //
    // const specific_test_step = b.step("test", "Run tests");
    // const run_specific = b.addRunArtifact(specific_test);
    // specific_test_step.dependOn(&run_specific.step);

    const exe = b.addExecutable(.{
        .name = "cade",
        .root_module = mod,
    });
    exe.addIncludePath(flatten_step.getOutput());
    exe.addConfigHeader(standard_version_h);

    addDependencies(b, target, &occt_libs, exe);
    b.installArtifact(exe);
}

const FlattenHeadersStep = struct {
    step: std.Build.Step,
    b: *std.Build,
    src_dir: []const u8,
    dst_dir: std.Build.GeneratedFile,
    skip: bool,

    pub fn create(b: *std.Build, sub_path: []const u8, skip: bool) *FlattenHeadersStep {
        const self = b.allocator.create(FlattenHeadersStep) catch unreachable;

        self.* = .{
            .step = std.Build.Step.init(.{
                .id = .custom,
                .name = "flatten-submodule-headers",
                .owner = b,
                .makeFn = make,
            }),
            .b = b,
            .src_dir = sub_path,
            .dst_dir = .{ .step = &self.step },
            .skip = skip,
        };

        return self;
    }

    pub fn getOutput(self: *FlattenHeadersStep) std.Build.LazyPath {
        return .{ .generated = .{ .file = &self.dst_dir } };
    }

    fn make(step: *std.Build.Step, _: std.Build.Step.MakeOptions) !void {
        const self: *FlattenHeadersStep = @fieldParentPtr("step", step);

        const b = self.b;
        self.dst_dir.path = b.pathJoin(&.{ b.cache_root.path.?, "flattened-headers" });

        if (self.skip) return;

        // Create the output directory in the zig-cache
        const output_dir_path = b.pathFromRoot(self.dst_dir.path.?);

        try std.fs.cwd().makePath(output_dir_path);

        const src_path = self.src_dir;
        var dir = try std.fs.cwd().openDir(src_path, .{ .iterate = true });
        defer dir.close();

        // Perform the recursive walk here
        try walkAndCopy(b, src_path, output_dir_path);
    }

    fn walkAndCopy(b: *std.Build, src: []const u8, dest: []const u8) !void {
        var dir = try std.fs.cwd().openDir(src, .{ .iterate = true });
        defer dir.close();

        var it = dir.iterate();
        while (try it.next()) |entry| {
            const full_src = try std.fs.path.join(b.allocator, &.{ src, entry.name });
            if (std.mem.indexOf(u8, full_src, "GTests") != null) continue;

            if (entry.kind == .directory) {
                try walkAndCopy(b, full_src, dest);
                continue;
            }
            if (entry.kind != .file) continue;
            if (std.mem.eql(u8, std.fs.path.extension(entry.name), ".hxx") or std.mem.eql(u8, std.fs.path.extension(entry.name), ".h") or std.mem.eql(u8, std.fs.path.extension(entry.name), ".lxx") or std.mem.eql(u8, std.fs.path.extension(entry.name), ".pxx") or std.mem.eql(u8, std.fs.path.extension(entry.name), ".gxx")) {
                const full_dest = try std.fs.path.join(b.allocator, &.{ dest, entry.name });
                // Only copy if the file is different/newer
                try std.fs.cwd().copyFile(full_src, std.fs.cwd(), full_dest, .{});
            }
        }
    }
};
