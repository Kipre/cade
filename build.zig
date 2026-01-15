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
    const flatten_step = FlattenHeadersStep.create(b, .{
        .src_dir = b.path("OCCT/src"),
    });

    const fill_step = FillStandardVersion.create(b, .{
        .output_path = flatten_step.getOutput(),
    });

    fill_step.step.dependOn(&flatten_step.step);

    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    var occt_libs: [19]*std.Build.Step.Compile = undefined;

    for (modules, 0..) |module, i| {
        var lib = addOCCTModule(b, target, optimize, module);
        lib.step.dependOn(&flatten_step.step);
        lib.step.dependOn(&fill_step.step);
        lib.addIncludePath(flatten_step.getOutput());
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

    addDependencies(b, target, &occt_libs, exe);
    b.installArtifact(exe);
}

const FlattenHeadersStep = struct {
    step: std.Build.Step,
    b: *std.Build,
    src_dir: std.Build.LazyPath,
    dst_dir: std.Build.GeneratedFile,

    pub fn create(b: *std.Build, options: struct { src_dir: std.Build.LazyPath }) *FlattenHeadersStep {
        const self = b.allocator.create(FlattenHeadersStep) catch unreachable;
        const step = std.Build.Step.init(.{
            .id = .custom,
            .name = "copy-and-flatten-headers",
            .owner = b,
            .makeFn = make,
        });
        self.* = .{
            .step = step,
            .b = b,
            .src_dir = options.src_dir,
            .dst_dir = .{ .step = &self.step },
        };
        // _ = step.addDirectoryWatchInput(self.src_dir) catch {
        //     @panic("cannot watch directory");
        // };
        self.src_dir.addStepDependencies(&self.step);
        return self;
    }

    pub fn getOutput(self: *FlattenHeadersStep) std.Build.LazyPath {
        return .{ .generated = .{ .file = &self.dst_dir } };
    }

    fn make(step: *std.Build.Step, make_options: std.Build.Step.MakeOptions) !void {
        std.debug.print("{any}", .{make_options});

        const self: *FlattenHeadersStep = @fieldParentPtr("step", step);
        const b = self.b;

        self.dst_dir.path = b.pathJoin(&.{ b.cache_root.path.?, "flattened-headers" });
        // Create the output directory in the zig-cache
        const output_dir_path = b.pathFromRoot(self.dst_dir.path.?);

        try std.fs.cwd().makePath(output_dir_path);

        const src_path = self.src_dir.getPath(b);
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

const FillStandardVersion = struct {
    step: std.Build.Step,
    b: *std.Build,
    output_path: std.Build.LazyPath,
    name: []const u8,

    pub fn create(b: *std.Build, options: struct { output_path: std.Build.LazyPath }) *FillStandardVersion {
        const self = b.allocator.create(FillStandardVersion) catch unreachable;
        const step = std.Build.Step.init(.{
            .id = .custom,
            .name = "fill-standard-version",
            .owner = b,
            .makeFn = make,
        });
        self.* = .{
            .step = step,
            .b = b,
            .output_path = options.output_path,
            .name = "Standard_Version.hxx",
        };
        // step.addDirectoryWatchInput(options.src_dir);
        options.output_path.addStepDependencies(&self.step);
        return self;
    }

    fn make(step: *std.Build.Step, _: std.Build.Step.MakeOptions) !void {
        const self: *FillStandardVersion = @fieldParentPtr("step", step);
        const b = self.b;

        // const input_file_path = "OCCT/adm/templates/Standard_Version.hxx.in";
        const input_file_path = b.pathJoin(&.{ "OCCT/adm/templates/", b.fmt("{s}.in", .{self.name}) });
        const output_file_path = try self.output_path.join(b.allocator, self.name);

        // --- Hardcoded Replacements ---
        var replacements = std.StringHashMap([]const u8).init(b.allocator);
        defer replacements.deinit();

        try replacements.put("OCC_VERSION_MAJOR", "7");
        try replacements.put("OCC_VERSION_MINOR", "9");
        try replacements.put("OCC_VERSION_MAINTENANCE", "1");
        try replacements.put("SET_OCC_VERSION_DEVELOPMENT", "");

        const file_content = try std.fs.cwd().readFileAlloc(b.allocator, input_file_path, 10 * 1024 * 1024); // Max 10MB file
        defer b.allocator.free(file_content);

        const modified_content = try replacePlaceholders(b.allocator, file_content, &replacements);
        defer b.allocator.free(modified_content);

        // --- Write Output File ---
        const output_file = try std.fs.cwd().createFile(try output_file_path.getPath3(b, &self.step).toString(b.allocator), .{ .read = true });
        defer output_file.close();

        try output_file.writeAll(modified_content);
    }

    fn replacePlaceholders(
        allocator: std.mem.Allocator,
        content: []const u8,
        replacements: *std.StringHashMap([]const u8),
    ) ![]u8 {
        var builder = std.array_list.Managed(u8).init(allocator);
        defer builder.deinit();

        var current_index: usize = 0;
        while (current_index < content.len) {
            const start_marker = std.mem.indexOf(u8, content[current_index..], "@");
            if (start_marker == null) {
                // No more '@' symbols, append the rest of the content
                try builder.appendSlice(content[current_index..]);
                break;
            }

            // Append content before the first '@'
            try builder.appendSlice(content[current_index .. current_index + start_marker.?]);
            current_index += start_marker.? + 1; // Move past the first '@'

            const end_marker = std.mem.indexOf(u8, content[current_index..], "@");
            if (end_marker == null) {
                // Unmatched '@', treat the rest as literal
                try builder.appendSlice(content[current_index - 1 ..]); // Include the unmatched '@'
                break;
            }

            const placeholder_name = content[current_index .. current_index + end_marker.?];
            if (replacements.get(placeholder_name)) |value| {
                // Found a replacement, append its value
                try builder.appendSlice(value);
            } else {
                // Placeholder not found in map, append it as is (including '@' symbols)
                try builder.appendSlice(content[current_index - 1 .. current_index + end_marker.? + 1]);
            }
            current_index += end_marker.? + 1; // Move past the second '@'
        }

        return builder.toOwnedSlice();
    }
};
