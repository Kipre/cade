const builtin = @import("builtin");
const std = @import("std");
const mem = std.mem;
const io = std.io;
const Allocator = std.mem.Allocator;
const assert = std.debug.assert;
const Cache = std.Build.Cache;
const http = std.http;
const net = std.net;
const print = std.debug.print;
const fs = std.fs;

const handlePostRequest = @import("services.zig").handlePostRequest;

const MIME_TYPES = std.StaticStringMap([]const u8).initComptime(.{
    .{ ".html", "text/html" },
    .{ ".htm", "text/html" },
    .{ ".css", "text/css" },
    .{ ".js", "application/javascript" },
    .{ ".json", "application/json" },
    .{ ".png", "image/png" },
    .{ ".jpg", "image/jpeg" },
    .{ ".jpeg", "image/jpeg" },
    .{ ".gif", "image/gif" },
    .{ ".svg", "image/svg+xml" },
    .{ ".txt", "text/plain" },
    .{ ".md", "text/markdown" },
    .{ ".pdf", "application/pdf" },
    .{ ".zip", "application/zip" },
    .{ ".wasm", "application/wasm" },
});

const Context = struct {
    gpa: Allocator,
};

const serve_dir = "./";

pub fn serve(allocator: Allocator) !void {
    const listen_port = 8111;

    const address = std.net.Address.parseIp("127.0.0.1", listen_port) catch unreachable;
    var http_server = try address.listen(.{ .reuse_address = true });
    print("server started at 127.0.0.1:{d}\n", .{listen_port});

    var context: Context = .{
        .gpa = allocator,
    };

    while (true) {
        const connection = try http_server.accept();
        _ = std.Thread.spawn(.{}, accept, .{ &context, connection }) catch |err| {
            std.log.err("unable to accept connection: {s}", .{@errorName(err)});
            connection.stream.close();
            continue;
        };
    }
}

fn accept(context: *Context, connection: std.net.Server.Connection) void {
    defer connection.stream.close();

    var path_buf: [std.fs.max_path_bytes]u8 = undefined;

    var recv_buffer: [4000]u8 = undefined;
    var send_buffer: [4000]u8 = undefined;
    var conn_reader = connection.stream.reader(&recv_buffer);
    var conn_writer = connection.stream.writer(&send_buffer);
    var server = std.http.Server.init(conn_reader.interface(), &conn_writer.interface);

    while (server.reader.state == .ready) {
        var request = server.receiveHead() catch |err| switch (err) {
            error.HttpConnectionClosing => return,
            else => {
                std.log.err("closing http connection: {s}", .{@errorName(err)});

                return;
            },
        };

        const method = request.head.method;
        const target = request.head.target;

        print("Request: {s} {s}\n", .{ @tagName(method), target });

        const decoded_path = std.Uri.percentDecodeBackwards(&path_buf, target);

        // Remove query parameters
        const path = if (mem.indexOf(u8, decoded_path, "?")) |idx| decoded_path[0..idx] else decoded_path;

        // Handle the request
        _ = switch (method) {
            .GET => serveFileOrDirectory(&request, context.gpa, path),
            .POST => handlePostRequest(&request, context.gpa, path),
            else => sendError(&request, .method_not_allowed, context.gpa, "Method not allowed"),
        } catch |err| {
            std.log.err("unable to accept connection: {s}", .{@errorName(err)});
        };
    }
}

fn serveFileOrDirectory(req: *http.Server.Request, allocator: std.mem.Allocator, path: []const u8) !void {

    // Construct full path
    const full_path = try fs.path.join(allocator, &.{ serve_dir, path });
    defer allocator.free(full_path);

    // Check if path exists and get file info
    const stat = fs.cwd().statFile(full_path) catch |err| switch (err) {
        error.FileNotFound => {
            try sendError(req, .not_found, allocator, "File not found");
            return;
        },
        // windows throws error
        error.IsDir => fs.File.Stat{
            .kind = .directory,
            .inode = 0,
            .size = 0,
            .mode = 0,
            .atime = 0,
            .mtime = 0,
            .ctime = 0,
        },
        else => {
            try sendError(req, .internal_server_error, allocator, "Internal server error");
            return err;
        },
    };

    if (stat.kind == .directory) {
        if (!std.mem.endsWith(u8, full_path, "/")) {
            const with_trailing_slash = try std.fmt.allocPrint(allocator, "{s}/", .{full_path});
            defer allocator.free(with_trailing_slash);

            try sendRedirect(req, with_trailing_slash[1..]);
            return;
        }
        try serveDirectory(req, allocator, full_path);
        return;
    }

    try serveFile(req, allocator, full_path);
}

fn serveFile(req: *http.Server.Request, allocator: std.mem.Allocator, file_path: []const u8) !void {
    const content = try fs.cwd().readFileAlloc(allocator, file_path, 10 * 1024 * 1024);
    defer allocator.free(content);

    // Determine content type
    const content_type = getMimeType(file_path);

    try req.respond(content, .{ .extra_headers = &.{
        .{ .name = "content-type", .value = content_type },
    } });
}

fn serveDirectory(req: *http.Server.Request, allocator: std.mem.Allocator, full_path: []const u8) !void {
    // Try to serve index.html if it exists
    const index_path = try fs.path.join(allocator, &[_][]const u8{ full_path, "index.html" });
    defer allocator.free(index_path);

    if (fs.cwd().statFile(index_path)) |_| {
        try serveFile(req, allocator, index_path);
        return;
    } else |_| {
        try sendError(req, .not_found, allocator, "index.html file not found");
    }
}

fn sendError(req: *http.Server.Request, status: http.Status, allocator: std.mem.Allocator, message: []const u8) !void {
    const error_html = try std.fmt.allocPrint(allocator,
        \\<!DOCTYPE html>
        \\<html>
        \\<head><title>Error {d}</title></head>
        \\<body>
        \\<h1>Error {d}</h1>
        \\<p>{s}</p>
        \\</body>
        \\</html>
    , .{ @intFromEnum(status), @intFromEnum(status), message });
    defer allocator.free(error_html);

    try req.respond(error_html, .{ .status = status, .extra_headers = &.{
        .{ .name = "content-type", .value = "text/html" },
    } });
}

fn sendRedirect(req: *http.Server.Request, location: []const u8) !void {
    try req.respond("", .{
        .status = .found, // 302 redirect
        .extra_headers = &.{
            .{ .name = "location", .value = location },
        }
    });
}

fn getMimeType(file_path: []const u8) []const u8 {
    const ext = fs.path.extension(file_path);
    return MIME_TYPES.get(ext) orelse "application/octet-stream";
}
