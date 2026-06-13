const std = @import("std");
const Allocator = std.mem.Allocator;

pub fn main(init: std.process.Init) !void {
    std.log.info("starting header flattening", .{});
    const io = init.io;
    var output_dir_path: [:0]const u8 = undefined;
    const src_path = "./OCCT/src";

    const args = try init.minimal.args.toSlice(init.arena.allocator());
    for (args) |arg| {
        output_dir_path = arg;
    }

    // Create the output directory in the zig-cache
    const cwd = std.Io.Dir.cwd();

    try cwd.deleteTree(io, output_dir_path);
    try cwd.createDirPath(io, output_dir_path);
    var dir = try cwd.openDir(io, src_path, .{ .iterate = true });
    defer dir.close(io);

    // Perform the recursive walk here
    try walkAndCopy(init.gpa, io, src_path, output_dir_path);
}

fn walkAndCopy(allocator: Allocator, io: std.Io, src: []const u8, dest: []const u8) !void {
    const cwd = std.Io.Dir.cwd();
    var dir = try cwd.openDir(io, src, .{ .iterate = true });
    defer dir.close(io);

    var it = dir.iterate();
    while (try it.next(io)) |entry| {
        const full_src = try std.fs.path.join(allocator, &.{ src, entry.name });
        defer allocator.free(full_src);

        // skip test directories
        if (std.mem.indexOf(u8, full_src, "GTests") != null) continue;

        if (entry.kind == .directory) {
            try walkAndCopy(allocator, io, full_src, dest);
            continue;
        }
        if (entry.kind != .file) continue;
        if (std.mem.eql(u8, std.fs.path.extension(entry.name), ".hxx") or std.mem.eql(u8, std.fs.path.extension(entry.name), ".h") or std.mem.eql(u8, std.fs.path.extension(entry.name), ".lxx") or std.mem.eql(u8, std.fs.path.extension(entry.name), ".pxx") or std.mem.eql(u8, std.fs.path.extension(entry.name), ".gxx")) {
            const full_dest = try std.fs.path.join(allocator, &.{ dest, entry.name });
            defer allocator.free(full_dest);
            // Only copy if the file is different/newer
            try cwd.copyFile(full_src, cwd, full_dest, io, .{ .replace = true });
        }
    }
}
