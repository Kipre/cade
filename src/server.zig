const std = @import("std");
const http = std.http;
const net = std.net;
const print = std.debug.print;
const fs = std.fs;
const mem = std.mem;

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

pub fn serve(allocator: std.mem.Allocator) !void {

    const serve_dir = "./";
    const port = 8111;

    // Create the address to listen on
    const addr = std.net.Address.parseIp4("127.0.0.1", port) catch |err| {
        std.debug.print("error parsing address {any}\n", .{err});
        return;
    };

    // Create a base server that listens for connections
    var server_base = addr.listen(.{}) catch |err| {
        std.debug.print("error listening on address {any}\n", .{err});
        return;
    };
    defer server_base.deinit();

    std.debug.print("Server started on port {d}...\n", .{port});

    while (true) {
        // Accept a connection
        var conn = server_base.accept() catch |err| {
            std.debug.print("error accept {any}\n", .{err});
            continue;
        };
        defer conn.stream.close();

        // This is the read buffer for HTTP headers
        var header_buf: [4096]u8 = undefined;

        // Initialize the HTTP server with the connection and header buffer
        var server = std.http.Server.init(conn, &header_buf);

        // Receive and handle the request
        var req = server.receiveHead() catch |err| {
            std.debug.print("error receiving head {any}\n", .{err});
            continue;
        };

        // Handle the request
        handleRequest(&req, allocator, serve_dir) catch |err| {
            print("Error handling request: {}\n", .{err});
        };
    }
}

fn handleRequest(req: *http.Server.Request, allocator: std.mem.Allocator, serve_dir: []const u8) !void {
    // Get request details
    const method = req.head.method;
    const target = req.head.target;

    print("Request: {s} {s}\n", .{ @tagName(method), target });


    if (method != .GET and method != .POST) {
        try sendError(req, .method_not_allowed, allocator, "Method not allowed");
        return;
    }

    // Decode URL and remove query parameters
    var path_buf: [std.fs.max_path_bytes]u8 = undefined;
    @memcpy(path_buf[0..target.len], target);

    const decoded_path = std.Uri.percentDecodeInPlace(path_buf[0..target.len]);

    // Remove query parameters
    const path = if (mem.indexOf(u8, decoded_path, "?")) |idx| decoded_path[0..idx] else decoded_path;

    if (method == .POST) {
        try handlePostRequest(req, allocator, path);
        return;
    }

    // Serve the file or directory
    try serveFileOrDirectory(req, allocator, serve_dir, path);
}

fn serveFileOrDirectory(req: *http.Server.Request, allocator: std.mem.Allocator, serve_dir: []const u8, path: []const u8) !void {

    // Construct full path
    const full_path = try fs.path.join(allocator, &[_][]const u8{ serve_dir, path });
    defer allocator.free(full_path);

    // Check if path exists and get file info
    _ = fs.cwd().statFile(full_path) catch |err| switch (err) {
        error.FileNotFound => {
            try sendError(req, .not_found, allocator, "File not found");
            return;
        },
        error.IsDir => {
            if (!std.mem.endsWith(u8, full_path, "/")) {
                const with_trailing_slash = try std.fmt.allocPrint(allocator, "{s}/", .{full_path});
                defer allocator.free(with_trailing_slash);

                try sendRedirect(req, with_trailing_slash[1..]);
                return;
            }
            try serveDirectory(req, allocator, full_path);
            return;
        },
        else => {
            try sendError(req, .internal_server_error, allocator, "Internal server error");
            return err;
        },
    };

    try serveFile(req, allocator, full_path);
}

fn serveFile(req: *http.Server.Request, allocator: std.mem.Allocator, file_path: []const u8) !void {
    // Open and read file
    const file = fs.cwd().openFile(file_path, .{}) catch {
        try sendError(req, .internal_server_error, allocator, "Cannot read file");
        return;
    };
    defer file.close();

    const file_size = try file.getEndPos();
    const content = try allocator.alloc(u8, file_size);
    defer allocator.free(content);

    _ = try file.readAll(content);

    // Determine content type
    const content_type = getMimeType(file_path);

    try req.respond(content, .{ .status = .ok, .extra_headers = &[_]std.http.Header{
        .{ .name = "content-type", .value = content_type },
        .{ .name = "content-length", .value = try std.fmt.allocPrint(allocator, "{d}", .{content.len}) },
        .{ .name = "connection", .value = "close" },
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

    req.respond(error_html, .{ .status = status, .extra_headers = &[_]std.http.Header{
        .{ .name = "content-type", .value = "text/html" },
        .{ .name = "connection", .value = "close" },
        .{ .name = "server", .value = "my-zig-server" },
    } }) catch |err| {
        std.debug.print("error responding {any}\n", .{err});
        return;
    };
}

fn sendRedirect(req: *http.Server.Request, location: []const u8) !void {
    try req.respond("", .{
        .status = .found, // 302 redirect
        .extra_headers = &[_]std.http.Header{
            .{ .name = "location", .value = location },
        }
    });
}

fn getMimeType(file_path: []const u8) []const u8 {
    const ext = fs.path.extension(file_path);
    return MIME_TYPES.get(ext) orelse "application/octet-stream";
}
