const std = @import("std");
const expect = std.testing.expect;
const expectError = std.testing.expectError;
const expectEqual = std.testing.expectEqual;

pub fn getFileFromQueryParams(path: []const u8) ![]const u8 {
    const query = if (std.mem.indexOf(u8, path, "?")) |idx| path[idx + 1 ..] else "";
    var it = std.mem.splitScalar(u8, query, '&');

    while (it.next()) |pair| {
        var kv = std.mem.splitScalar(u8, pair, '=');

        const key = kv.next() orelse continue;
        const value = kv.next() orelse "";
        if (std.mem.eql(u8, key, "file")) {
            return value[0..];
        }
    }
    return error.URLQueryParamNotFoundError;
}

test getFileFromQueryParams {
    var path_buf: [std.fs.max_path_bytes]u8 = undefined;
    try expectError(error.URLQueryParamNotFoundError, getFileFromQueryParams(path_buf[0..], "/hello"));
    try expect(std.mem.eql(u8, try getFileFromQueryParams(path_buf[0..], "/hello?file=here"), "here"));
    try expect(std.mem.eql(u8, try getFileFromQueryParams(path_buf[0..], "/hello?val=324&file=here"), "here"));
}
