const std = @import("std");
const parse = @import("parse_path.zig");

const expect = std.testing.expect;

const solidify = @cImport({
    @cInclude("Solidify.h");
});

pub const PathSegment = solidify.PathSegment;

pub const RawFlatPart = struct {
    outside: []const u8,
    insides: [][]const u8,
};

pub fn parseFlatPart(part: *const RawFlatPart, segmentsArray: *std.ArrayList(PathSegment)) !void {
    try parse.parsePathAndAppend(segmentsArray, part.outside);

    for (part.insides) |path| {
        try parse.parsePathAndAppend(segmentsArray, path);
    }
}

pub fn flatPartToOBJ(allocator: std.mem.Allocator, part: *RawFlatPart, output_buffer: [*c]u8) !usize {
    var segments = std.ArrayList(PathSegment).init(allocator);
    // defer allocator.free(segments);

    try parseFlatPart(part, &segments);

    const size = segments.items.len;
    const array = try segments.toOwnedSlice();
    const cint_obj_size = solidify.pathToSolid(array.ptr, size, output_buffer);
    const obj_size: usize = @intCast(cint_obj_size);
    return obj_size;
}

test "simple case" {
    const json =
        \\ {"outside":"M -100 0 A 100 100 0 0 0 100 0 A 100 100 0 0 0 -100 0 Z","insides":["M -20 0 A 20 20 0 0 0 20 0 A 20 20 0 0 0 -20 0 Z"]}
    ;
    var part = try std.json.parseFromSlice(RawFlatPart, std.testing.allocator, json, .{});
    defer part.deinit();

    // var output_buffer: [1024 * 16]u8 = undefined;
    // const size = try flatPartToOBJ(std.testing.allocator, &part.value, &output_buffer);
    // try expect(size == 10);
}

// test "problematic case" {
//     const json =
//         \\\ {"outside":"M 0 35 L 174.47799427400602 35 A 3 3 0 0 1 180.47799427400602 35 L 180.47799427400602 50 L 210.47799427400602 50.00000000000001 L 210.47799427400602 35 A 3 3 0 0 1 216.47799427400602 35 L 465.43398282201804 35 A 3 3 0 0 1 471.43398282201804 35 L 471.43398282201804 50 L 501.43398282201804 50.00000000000001 L 501.43398282201804 35 A 3 3 0 0 1 507.43398282201804 35 L 756.38997137003 35 A 3 3 0 0 1 762.38997137003 35 L 762.38997137003 50 L 792.38997137003 50.00000000000001 L 792.38997137003 35 A 3 3 0 0 1 798.38997137003 35 L 972.8679656440361 35 L 972.8679656440358 -35 L 798.3899713700303 -35 A 3 3 0 0 1 792.38997137003 -35 L 792.3899713700303 -50.00000000000001 L 762.38997137003 -50 L 762.38997137003 -35 A 3 3 0 0 1 756.38997137003 -35 L 507.43398282201804 -35 A 3 3 0 0 1 501.43398282201804 -35 L 501.43398282201815 -50.00000000000001 L 471.43398282201804 -50 L 471.43398282201804 -35 A 3 3 0 0 1 465.43398282201815 -35 L 216.47799427400602 -35 A 3 3 0 0 1 210.47799427400602 -35 L 210.47799427400602 -50.00000000000001 L 180.47799427400602 -50 L 180.47799427400597 -35 A 3 3 0 0 1 174.47799427400608 -35 L -1.7145055188062946e-14 -35 Z","insides":["M 55.1 19.9 A 5.1 5.1 0 0 0 44.9 19.9 A 5.1 5.1 0 0 0 55.1 19.9 Z","M 55.1 -19.9 A 5.1 5.1 0 0 0 44.9 -19.9 A 5.1 5.1 0 0 0 55.1 -19.9 Z","M 346.05598854801207 19.9 A 5.1 5.1 0 0 0 335.855988548012 19.9 A 5.1 5.1 0 0 0 346.05598854801207 19.9 Z","M 346.05598854801207 -19.9 A 5.1 5.1 0 0 0 335.855988548012 -19.9 A 5.1 5.1 0 0 0 346.05598854801207 -19.9 Z","M 637.0119770960241 19.9 A 5.1 5.1 0 0 0 626.8119770960241 19.9 A 5.1 5.1 0 0 0 637.0119770960241 19.9 Z","M 637.0119770960241 -19.9 A 5.1 5.1 0 0 0 626.8119770960241 -19.9 A 5.1 5.1 0 0 0 637.0119770960241 -19.9 Z","M 927.9679656440361 19.9 A 5.1 5.1 0 0 0 917.767965644036 19.9 A 5.1 5.1 0 0 0 927.9679656440361 19.9 Z","M 927.9679656440361 -19.9 A 5.1 5.1 0 0 0 917.767965644036 -19.9 A 5.1 5.1 0 0 0 927.9679656440361 -19.9 Z"]}
//     ;
//     var part = try std.json.parseFromSlice(RawFlatPart, std.testing.allocator, json, .{});
//     defer part.deinit();
//
//     var output_buffer: [1024 * 16]u8 = undefined;
//     const size = try flatPartToOBJ(std.testing.allocator, &part.value, &output_buffer);
//     try expect(size == 10);
// }
