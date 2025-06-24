const std = @import("std");
const fs = std.fs;
const endsWith = std.mem.endsWith;
const ArrayList = std.ArrayList;
const process = std.process;
const mem = std.mem;

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    const args = try process.argsAlloc(allocator);

    var skip_headers = false;
    {
        var i: usize = 1;
        while (i < args.len) : (i += 1) {
            const arg = args[i];
            if (mem.startsWith(u8, arg, "-")) {
                if (mem.eql(u8, arg, "--skip-headers")) {
                    skip_headers = true;
                    continue;
                } else {
                    fatal("unrecognized parameter: '{s}'", .{arg});
                }
            } else {
                fatal("unexpected extra parameter: '{s}'", .{arg});
            }
        }
    }

    if (!skip_headers) try copyHeaderFiles(allocator);

    try generateSourceLists(allocator,  "OCCT/src/FoundationClasses/TKernel");
    try generateSourceLists(allocator,  "OCCT/src/FoundationClasses/TKMath");
}


pub fn fatal(comptime format: []const u8, args: anytype) noreturn {
    std.log.err(format, args);
    process.exit(1);
}

fn copyHeaderFiles(allocator: std.mem.Allocator) !void {
    var headers = std.ArrayList([]const u8).init(allocator);
    defer {
        for (headers.items) |path| {
            allocator.free(path);
        }
        headers.deinit();
    }

    std.debug.print("Collecting header files\n", .{});
    try collectFilesDeep(allocator, "OCCT/src", &headers);

    std.debug.print("Copying header files\n", .{});
    for (headers.items) |source| {
        // Extract just the filename from the source path
        const filename = std.fs.path.basename(source);
        // Create the full destination path
        const dest_path = try std.fs.path.join(std.heap.page_allocator, &[_][]const u8{ "inc/", filename });
        defer std.heap.page_allocator.free(dest_path);

        // std.debug.print(" {s} {s}\n", .{source, dest_path});
        if (std.mem.indexOf(u8, source, "GTests") != null) continue;
        if (!endsWith(u8, source, "hxx") and !endsWith(u8, source, "lxx") and !endsWith(u8, source, "gxx")) continue;
        try std.fs.cwd().copyFile(source, std.fs.cwd(), dest_path, .{});
    }
}

fn generateSourceLists(allocator: std.mem.Allocator, dir_path: []const u8) !void {
    var sources = std.ArrayList([]const u8).init(allocator);
    defer {
        // Free all collected paths
        for (sources.items) |path| {
            allocator.free(path);
        }
        sources.deinit();
    }

    const module = std.fs.path.basename(dir_path);
    const sources_file_name = try std.fmt.allocPrint(allocator, "{s}_generated-build-config.zig", .{ module,  });
    defer allocator.free(sources_file_name);

    std.debug.print("Collecting source files\n", .{});
    try collectFilesOneDeep(allocator, dir_path, &sources);

    // Generate sources.zig file
    const file = try std.fs.cwd().createFile(sources_file_name, .{});
    defer file.close();

    try file.writeAll("pub const sources = [_][]const u8{\n");
    for (sources.items) |source| {
        if (std.mem.indexOf(u8, source, "GTests") != null) continue;
        if (endsWith(u8, source, "hxx")) continue;
        if (endsWith(u8, source, "pxx")) continue;
        if (endsWith(u8, source, "lxx")) continue;
        if (endsWith(u8, source, "gxx")) continue;
        if (!endsWith(u8, source, "xx")) continue;
        try file.writer().print("    \"{s}\",\n", .{source});
    }
    try file.writeAll("};\n");
    std.debug.print("Wrote build file\n", .{});
}

fn collectFilesOneDeep(allocator: std.mem.Allocator, root_path: []const u8, file_list: *ArrayList([]const u8)) !void {
    // Collect files from root directory
    try collectFilesFromDirectory(allocator, root_path, file_list);

    // Get all subdirectories
    var subdirs = ArrayList([]const u8).init(allocator);
    defer {
        for (subdirs.items) |subdir| {
            allocator.free(subdir);
        }
        subdirs.deinit();
    }

    var root_dir = fs.cwd().openDir(root_path, .{ .iterate = true }) catch |err| switch (err) {
        error.FileNotFound, error.AccessDenied => return,
        else => return err,
    };
    defer root_dir.close();

    var iterator = root_dir.iterate();

    while (try iterator.next()) |entry| {
        if (entry.kind == .directory) {
            const subdir_path = try std.fmt.allocPrint(allocator, "{s}/{s}", .{ root_path, entry.name });
            try subdirs.append(subdir_path);
        }
    }

    // Collect files from each subdirectory
    for (subdirs.items) |subdir_path| {
        try collectFilesFromDirectory(allocator, subdir_path, file_list);
    }
}

fn collectFilesDeep(allocator: std.mem.Allocator, root_path: []const u8, file_list: *ArrayList([]const u8)) !void {
    // Collect files from root directory
    try collectFilesFromDirectory(allocator, root_path, file_list);

    // Get all subdirectories
    var subdirs = ArrayList([]const u8).init(allocator);
    defer {
        for (subdirs.items) |subdir| {
            allocator.free(subdir);
        }
        subdirs.deinit();
    }

    var root_dir = fs.cwd().openDir(root_path, .{ .iterate = true }) catch |err| switch (err) {
        error.FileNotFound, error.AccessDenied => return,
        else => return err,
    };
    defer root_dir.close();

    var iterator = root_dir.iterate();

    while (try iterator.next()) |entry| {
        if (entry.kind == .directory) {
            const subdir_path = try std.fmt.allocPrint(allocator, "{s}/{s}", .{ root_path, entry.name });
            try subdirs.append(subdir_path);
        }
    }

    // Collect files from each subdirectory
    for (subdirs.items) |subdir_path| {
        try collectFilesDeep(allocator, subdir_path, file_list);
    }
}

fn collectFilesFromDirectory(allocator: std.mem.Allocator, path: []const u8, file_list: *ArrayList([]const u8)) !void {
    var dir = fs.cwd().openDir(path, .{ .iterate = true }) catch |err| switch (err) {
        error.FileNotFound, error.AccessDenied => return,
        else => return err,
    };
    defer dir.close();

    var iterator = dir.iterate();
    while (try iterator.next()) |entry| {
        if (entry.kind == .file or entry.kind == .sym_link) {
            const full_path = try std.fmt.allocPrint(allocator, "{s}/{s}", .{ path, entry.name });
            try file_list.append(full_path);
        }
    }
}
