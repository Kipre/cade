const builtin = @import("builtin");
const std = @import("std");
const mem = std.mem;
const Allocator = std.mem.Allocator;
const assert = std.debug.assert;
const Cache = std.Build.Cache;
const http = std.http;
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
    io: std.Io,
};

const serve_dir = "./";

pub fn serve(allocator: Allocator, io: std.Io) !void {
    const listen_port = 8111;

    const address = std.Io.net.IpAddress.parseIp4("127.0.0.1", listen_port) catch unreachable;
    var http_server = try address.listen(io, .{ .reuse_address = true });
    print("server started at 127.0.0.1:{d}\n", .{listen_port});

    var context: Context = .{
        .gpa = allocator,
        .io = io,
    };

    while (true) {
        const stream = try http_server.accept(io);
        _ = std.Thread.spawn(.{}, accept, .{ &context, stream })
            catch |err| {
            std.log.err("unable to accept connection: {s}", .{@errorName(err)});
            stream.close(io);
            return err;
            // continue;
        };
    }
}

fn accept(context: *Context, stream: std.Io.net.Stream) !void {
    defer stream.close(context.io);

    var path_buf: [std.fs.max_path_bytes]u8 = undefined;

    var recv_buffer: [4000]u8 = undefined;
    var send_buffer: [4000]u8 = undefined;
    var conn_reader = stream.reader(context.io, &recv_buffer);
    var conn_writer = stream.writer(context.io, &send_buffer);
    var server = std.http.Server.init(&conn_reader.interface, &conn_writer.interface);

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
            .GET => serveFileOrDirectory(&request, context.gpa, context.io, path),
            .POST => handlePostRequest(&request, context.gpa, path),
            else => sendError(&request, .method_not_allowed, context.gpa, "Method not allowed"),
        } catch |err| {
            std.log.err("unable to accept connection: {s}", .{@errorName(err)});
            return err;
        };
    }
}

fn serveFileOrDirectory(req: *http.Server.Request, allocator: std.mem.Allocator, io: std.Io, path: []const u8) !void {

    // Construct full path
    const full_path = try fs.path.join(allocator, &.{ serve_dir, path });
    defer allocator.free(full_path);

    const cwd = std.Io.Dir.cwd();

    const Kind = enum {
        file,
        directory,
    };

    const kind: Kind = blk: {
        const stat = cwd.statFile(io, full_path, .{}) catch |err| switch (err) {
            error.IsDir => break :blk .directory,
            error.FileNotFound => {
                try sendError(req, .not_found, allocator, "File not found");
                return;
            },
            else => {
                try sendError(req, .internal_server_error, allocator, "Internal server error");
                return err;
            },
        };

        if (stat.kind == .directory) {
            break :blk .directory;
        }

        break :blk .file;
    };

    switch (kind) {
        .directory => {
            // serve directory
            try serveDirectory(req, allocator, io, full_path);
        },
        .file => {
            // serve file
            try serveFile(req, allocator, io, full_path);
        },
    } 
}

fn serveFile(req: *http.Server.Request, allocator: std.mem.Allocator, io: std.Io, file_path: []const u8) !void {
    const content = try std.Io.Dir.cwd().readFileAlloc(
        io,
        file_path, 
        allocator, 
        .limited(10 * 1024 * 1024),
    );
    defer allocator.free(content);

    // Determine content type
    const content_type = getMimeType(file_path);

    try req.respond(content, .{ .extra_headers = &.{
        .{ .name = "content-type", .value = content_type },
    } });
}

fn serveDirectory(req: *http.Server.Request, allocator: std.mem.Allocator, io: std.Io, full_path: []const u8) !void {
    // Try to serve index.html if it exists
    const index_path = try fs.path.join(allocator, &[_][]const u8{ full_path, "index.html" });
    defer allocator.free(index_path);

    print("full path {s}", .{full_path});

    if (std.Io.Dir.cwd().statFile(io, index_path, .{})) |_| {
        try serveFile(req, allocator, io, index_path);
        return;
    } else |_| {
        if (std.mem.eql(u8, full_path, "./")) {
            try serveFile(req, allocator, io, "./cade/lib/index.html");
            return;
        }
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
