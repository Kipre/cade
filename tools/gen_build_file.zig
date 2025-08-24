const std = @import("std");
const fs = std.fs;
const endsWith = std.mem.endsWith;
const process = std.process;
const mem = std.mem;

/// Replaces placeholders in a string with values from a provided map.
/// Placeholders are expected to be surrounded by '@' symbols (e.g., "@NAME@").
///
/// Args:
///   allocator: The allocator to use for memory allocations.
///   content: The string content to perform replacements on.
///   replacements: A map where keys are placeholder names (without '@') and values are their replacements.
///
/// Returns:
///   A new string with placeholders replaced, or an error.
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

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    const input_file_path = "OCCT/adm/templates/Standard_Version.hxx.in";
    const output_file_path = "inc/Standard_Version.hxx";

    // --- Hardcoded Replacements ---
    var replacements = std.StringHashMap([]const u8).init(allocator);
    defer replacements.deinit();

    try replacements.put("OCC_VERSION_MAJOR", "7");
    try replacements.put("OCC_VERSION_MINOR", "9");
    try replacements.put("OCC_VERSION_MAINTENANCE", "1");
    try replacements.put("SET_OCC_VERSION_DEVELOPMENT", "");

    std.debug.print("Filling in Standard_Version\n", .{});

    // --- Read Input File ---
    const file_content = try std.fs.cwd().readFileAlloc(allocator, input_file_path, 10 * 1024 * 1024); // Max 10MB file
    defer allocator.free(file_content);

    // --- Perform Replacements ---
    const modified_content = try replacePlaceholders(allocator, file_content, &replacements);
    defer allocator.free(modified_content);

    // --- Write Output File ---
    const output_file = try std.fs.cwd().createFile(output_file_path, .{ .read = true });
    defer output_file.close();

    try output_file.writeAll(modified_content);

    std.debug.print("Successfully processed '{s}' and wrote to '{s}'.\n", .{ input_file_path, output_file_path });

    const args = try process.argsAlloc(allocator);
    defer process.argsFree(allocator, args);

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

    try generateSourceLists(allocator, "OCCT/src/FoundationClasses/TKernel");
    try generateSourceLists(allocator, "OCCT/src/FoundationClasses/TKMath");
    try generateSourceLists(allocator, "OCCT/src/ModelingData/TKG2d");
    try generateSourceLists(allocator, "OCCT/src/ModelingData/TKG3d");
    try generateSourceLists(allocator, "OCCT/src/ModelingData/TKGeomBase");
    try generateSourceLists(allocator, "OCCT/src/ModelingData/TKBRep");
    try generateSourceLists(allocator, "OCCT/src/ModelingAlgorithms/TKGeomAlgo");
    try generateSourceLists(allocator, "OCCT/src/ModelingAlgorithms/TKTopAlgo");
    try generateSourceLists(allocator, "OCCT/src/ModelingAlgorithms/TKPrim");
    try generateSourceLists(allocator, "OCCT/src/ModelingAlgorithms/TKFillet");
    try generateSourceLists(allocator, "OCCT/src/ModelingAlgorithms/TKOffset");
    try generateSourceLists(allocator, "OCCT/src/ModelingAlgorithms/TKFeat");
    try generateSourceLists(allocator, "OCCT/src/ModelingAlgorithms/TKBool");
    try generateSourceLists(allocator, "OCCT/src/ModelingAlgorithms/TKShHealing");
    try generateSourceLists(allocator, "OCCT/src/ModelingAlgorithms/TKBO");
    try generateSourceLists(allocator, "OCCT/src/ModelingAlgorithms/TKMesh");
    try generateSourceLists(allocator, "OCCT/src/DataExchange/TKDESTEP");
    try generateSourceLists(allocator, "OCCT/src/DataExchange/TKXSBase");
}

pub fn fatal(comptime format: []const u8, args: anytype) noreturn {
    std.log.err(format, args);
    process.exit(1);
}

fn copyHeaderFiles(allocator: std.mem.Allocator) !void {
    var headers = std.array_list.Managed([]const u8).init(allocator);
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
        if (!endsWith(u8, source, ".h") and !endsWith(u8, source, ".hxx") and !endsWith(u8, source, ".lxx") and !endsWith(u8, source, ".gxx") and !endsWith(u8, source, ".pxx")) continue;
        try std.fs.cwd().copyFile(source, std.fs.cwd(), dest_path, .{});
    }
}

fn generateSourceLists(allocator: std.mem.Allocator, dir_path: []const u8) !void {
    var sources = std.array_list.Managed([]const u8).init(allocator);
    defer {
        // Free all collected paths
        for (sources.items) |path| {
            allocator.free(path);
        }
        sources.deinit();
    }

    const module = std.fs.path.basename(dir_path);
    const sources_file_name = try std.fmt.allocPrint(allocator, "{s}_generated-build-config.zig", .{
        module,
    });
    defer allocator.free(sources_file_name);

    try collectFilesOneDeep(allocator, dir_path, &sources);

    // Generate sources.zig file
    const file = try std.fs.cwd().createFile(sources_file_name, .{});
    defer file.close();

    var write_buffer: [1024 * 4]u8 = undefined;
    var writer = file.writer(&write_buffer);
    const out = &writer.interface;

    _ = try out.write("pub const sources = [_][]const u8{\n");
    for (sources.items) |source| {
        if (std.mem.indexOf(u8, source, "GTests") != null) continue;
        if (endsWith(u8, source, "hxx")) continue;
        if (endsWith(u8, source, "pxx")) continue;
        if (endsWith(u8, source, "lxx")) continue;
        if (endsWith(u8, source, "gxx")) continue;
        if (!endsWith(u8, source, ".c") and !endsWith(u8, source, ".cxx") and !endsWith(u8, source, ".cpp")) continue;
        try out.print("    \"{s}\",\n", .{source});
    }
    _ = try out.write("};\n");
    try out.flush();

    std.debug.print("Collected sources for {s}\n", .{module});
}

fn collectFilesOneDeep(allocator: std.mem.Allocator, root_path: []const u8, file_list: *std.array_list.Managed([]const u8)) !void {
    // Collect files from root directory
    try collectFilesFromDirectory(allocator, root_path, file_list);

    // Get all subdirectories
    var subdirs = std.array_list.Managed([]const u8).init(allocator);
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

fn collectFilesDeep(allocator: std.mem.Allocator, root_path: []const u8, file_list: *std.array_list.Managed([]const u8)) !void {
    // Collect files from root directory
    try collectFilesFromDirectory(allocator, root_path, file_list);

    // Get all subdirectories
    var subdirs = std.array_list.Managed([]const u8).init(allocator);
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

fn collectFilesFromDirectory(allocator: std.mem.Allocator, path: []const u8, file_list: *std.array_list.Managed([]const u8)) !void {
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
