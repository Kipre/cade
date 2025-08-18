const std = @import("std");
const http = std.http;
const parse = @import("parse_path.zig");

const solidify = @cImport({
    @cInclude("Solidify.h");
});

const PathSegment = solidify.PathSegment;

const ServerAction = enum {
    thicken,
    unknown,
};

const actions_map = std.StaticStringMap(ServerAction).initComptime(.{
    .{ "/occ/thicken", .thicken },
});

const RawFlatPart = struct {
    outside: []const u8,
    insides: [][]const u8,
};

fn thicken(req: *http.Server.Request, allocator: std.mem.Allocator) !void {
    const body = readRequestBody(req, allocator, 2048 * 2) catch |err| {
        try sendJsonError(req, "Failed to read request body", 400);
        return err;
    };
    defer allocator.free(body);

    std.debug.print("Received body: {s}\n", .{body});

    // Parse JSON into our struct
    var input = std.json.parseFromSlice(RawFlatPart, allocator, body, .{
        .ignore_unknown_fields = true, // Ignore extra fields
    }) catch |err| {
        std.debug.print("JSON parse error: {any}\n", .{err});
        try sendJsonError(req, "Invalid JSON format", 400);
        return;
    };
    defer input.deinit();

    var segments = std.ArrayList(PathSegment).init(allocator);

    try parse.parsePathAndAppend(&segments, input.value.outside);

    for (input.value.insides) |path| {
        try parse.parsePathAndAppend(&segments, path);
    }

    var output_buffer: [1024 * 16]u8 = undefined;

    const size = segments.items.len;
    const array = try segments.toOwnedSlice();
    const obj_size: usize = @intCast(solidify.pathToSolid(array.ptr, size, &output_buffer));

    std.debug.print("Received obj of length: {d}\n", .{obj_size});
    // std.debug.print("Received obj of length: {s}\n", .{output_buffer[0..obj_size]});

    const response_body = output_buffer[0..obj_size];
    try req.respond(response_body, .{ .status = .ok, .extra_headers = &[_]std.http.Header{
        .{ .name = "content-type", .value = "application/text" },
        // .{ .name = "content-length", .value = try std.fmt.allocPrint(allocator, "{d}", .{obj_length}) },
    } });
}

pub fn handlePostRequest(req: *http.Server.Request, allocator: std.mem.Allocator, path: []const u8) !void {
    const action = actions_map.get(path) orelse .unknown;

    switch (action) {
        .thicken => try thicken(req, allocator),
        .unknown => {
            std.debug.print("Failed to understand request: {s}\n", .{path});
            try sendJsonError(req, "Action not found", 404);
            return;
        },
    }
}

fn readRequestBody(req: *std.http.Server.Request, allocator: std.mem.Allocator, max_size: usize) ![]u8 {
    const reader = req.reader() catch return error.ReaderError;

    // Check Content-Length header
    const content_length = blk: {
        var headers = req.iterateHeaders();
        while (headers.next()) |header| {
            if (std.ascii.eqlIgnoreCase(header.name, "content-length")) {
                break :blk std.fmt.parseInt(usize, header.value, 10) catch 0;
            }
        }
        break :blk 0;
    };

    if (content_length == 0) {
        return error.NoContentLength;
    }
    if (content_length > max_size) {
        return error.ContentTooLarge;
    }

    const body = allocator.alloc(u8, content_length) catch return error.AllocationFailed;
    const bytes_read = reader.readAll(body) catch {
        allocator.free(body);
        return error.ReadError;
    };

    if (bytes_read != content_length) {
        allocator.free(body);
        return error.IncompleteRead;
    }

    return body;
}

fn sendJsonError(req: *std.http.Server.Request, message: []const u8, status_code: u16) !void {
    const status = switch (status_code) {
        400 => std.http.Status.bad_request,
        404 => std.http.Status.not_found,
        500 => std.http.Status.internal_server_error,
        else => std.http.Status.bad_request,
    };

    // Create a simple error JSON response on the stack
    var error_buf: [256]u8 = undefined;
    const error_json = std.fmt.bufPrint(&error_buf, "{{\"success\": false, \"error\": \"{s}\"}}", .{message}) catch "{{\"success\": false, \"error\": \"Unknown error\"}}";

    req.respond(error_json, .{
        .status = status,
        .extra_headers = &[_]std.http.Header{
            .{ .name = "content-type", .value = "application/json" },
        },
    }) catch {};
}
