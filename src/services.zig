const std = @import("std");
const http = std.http;
const parse = @import("parse_path.zig");
const api = @import("api.zig");

const reqBodySize = 1024 * std.math.pow(i32, 2, 8);
const meshBodySize = 1024 * std.math.pow(i32, 2, 10);

const ServerAction = enum {
    export_step,
    solidify,
    project,
    unknown,
};

const actions_map = std.StaticStringMap(ServerAction).initComptime(.{
    .{ "/occ/export", .export_step },
    .{ "/occ/solidify", .solidify },
    .{ "/occ/project", .project },
});

fn solidify(req: *http.Server.Request, allocator: std.mem.Allocator) !void {
    const body = readRequestBody(req, allocator, reqBodySize) catch |err| {
        try sendJsonError(req, "Failed to read request body", 400);
        return err;
    };
    defer allocator.free(body);

    std.debug.print("Received body: {s}\n", .{body});

    var input = std.json.parseFromSlice(std.json.Value, allocator, body, .{}) catch |err| {
        std.debug.print("JSON parse error: {any}\n", .{err});
        try sendJsonError(req, "Invalid JSON format", 400);
        return;
    };
    defer input.deinit();

    var output_buffer: [meshBodySize]u8 = undefined;
    const obj_size = try api.solidify(allocator, &input.value, &output_buffer);

    if (obj_size == 0) {
        std.debug.print("Failed to solidify part\n", .{});
        try sendJsonError(req, "Part defninition did not yield a valid solid", 400);
        return;
    }

    const response_body = output_buffer[0..obj_size];
    try req.respond(response_body, .{ .extra_headers = &.{
        .{ .name = "content-type", .value = "application/text" },
    } });
}

fn export_step(req: *http.Server.Request, allocator: std.mem.Allocator) !void {
    const body = readRequestBody(req, allocator, reqBodySize) catch |err| {
        try sendJsonError(req, "Failed to read request body", 400);
        return err;
    };
    defer allocator.free(body);

    std.debug.print("Received body: {s}\n", .{body});

    // Parse JSON into our struct
    var input = std.json.parseFromSlice(api.CompactPartDefinition, allocator, body, .{
        .ignore_unknown_fields = true, // Ignore extra fields
    }) catch |err| {
        std.debug.print("JSON parse error: {any}\n", .{err});
        try sendJsonError(req, "Invalid JSON format", 400);
        return;
    };
    defer input.deinit();

    try api.exportAsSTEP(allocator, &input.value);

    try req.respond("wrote successfully", .{ .extra_headers = &.{
        .{ .name = "content-type", .value = "application/text" },
    } });
}

fn project(req: *http.Server.Request, allocator: std.mem.Allocator) !void {
    const body = readRequestBody(req, allocator, reqBodySize) catch |err| {
        try sendJsonError(req, "Failed to read request body", 400);
        return err;
    };
    defer allocator.free(body);

    std.debug.print("Received body: {s}\n", .{body});

    // Parse JSON into our struct
    var input = std.json.parseFromSlice(api.CompactPartDefinition, allocator, body, .{
        .ignore_unknown_fields = true, // Ignore extra fields
    }) catch |err| {
        std.debug.print("JSON parse error: {any}\n", .{err});
        try sendJsonError(req, "Invalid JSON format", 400);
        return;
    };
    defer input.deinit();

    try api.projectSVG(allocator, &input.value);

    try req.respond("wrote successfully", .{ .extra_headers = &.{
        .{ .name = "content-type", .value = "application/text" },
    } });
}

pub fn handlePostRequest(req: *http.Server.Request, allocator: std.mem.Allocator, path: []const u8) !void {
    const action = actions_map.get(path) orelse .unknown;

    switch (action) {
        .export_step => try export_step(req, allocator),
        .project => try project(req, allocator),
        .solidify => try solidify(req, allocator),
        .unknown => {
            std.debug.print("Failed to understand request: {s}\n", .{path});
            try sendJsonError(req, "Action not found", 404);
            return;
        },
    }
}

fn readRequestBody(req: *std.http.Server.Request, allocator: std.mem.Allocator, max_size: usize) ![]u8 {

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

    var transfer_buffer: [64]u8 = undefined;
    const body_reader = req.server.reader.bodyReader(&transfer_buffer, .none, content_length);
    const req_body = try body_reader.allocRemaining(allocator, @enumFromInt(max_size));

    if (req_body.len != content_length) {
        allocator.free(req_body);
        return error.IncompleteRead;
    }

    return req_body;
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
