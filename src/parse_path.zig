const std = @import("std");
const testing = std.testing;
const tokenize = std.ascii;
const occ = @import("occ.zig");
const Allocator = std.mem.Allocator;

const PathSegment = occ.PathSegment;

// const PathSegment = extern struct {
//     command: u8,
//     x: f32,
//     y: f32,
//     radius: f32,
//     sweep: u8,
// };

// Error type for parsing issues.
pub const ParseError = error{
    InvalidCommand,
    InvalidNumber,
    EndOfPath,
    NonClosedPath,
};

// This function advances the string view past whitespace and commas.
fn skipSeparators(path: []const u8) []const u8 {
    var i: usize = 0;
    while (i < path.len) {
        switch (path[i]) {
            ' ', '\t', '\n', '\r', ',' => i += 1,
            else => break,
        }
    }
    return path[i..];
}

const NumberParseResult = struct { val: f32, remaining: []const u8 };

// This function parses a single floating-point number from the string.
// It returns the number and the remaining string view.
fn parseNumber(
    path: []const u8,
) !NumberParseResult {
    var length: usize = 0;
    while (length < path.len and !tokenize.isWhitespace(path[length]) and length < 100) length += 1;

    if (length == 0 or length == 100) return ParseError.EndOfPath;

    // Use std.fmt.parseFloat to parse the number.
    const parsed = std.fmt.parseFloat(f32, path[0..length]);
    if (parsed) |val| {
        return .{ .val = val, .remaining = path[length..] };
    } else |err| {
        return err;
    }
}

pub const SVGPathIterator = struct {
    remaining_path: []const u8,

    pub fn init(path: []const u8) SVGPathIterator {
        return .{ .remaining_path = path };
    }

    pub fn next(self: *SVGPathIterator) !?PathSegment {
        self.remaining_path = skipSeparators(self.remaining_path);

        if (self.remaining_path.len == 0) return null;

        const command = self.remaining_path[0];
        self.remaining_path = self.remaining_path[1..];

        switch (command) {
            'M', 'L' => {
                const x_res = try parseNumber(skipSeparators(self.remaining_path));
                self.remaining_path = x_res.remaining;
                const y_res = try parseNumber(skipSeparators(self.remaining_path));
                self.remaining_path = y_res.remaining;

                // try segments.append(.{ command, x_res.val, y_res.val, 0, 0 });
                return .{ .command = command, .x = x_res.val, .y = y_res.val, .radius = 0, .sweep = 0 };
            },
            'Z', 'z' => {
                return .{ .command = 'Z', .x = 0, .y = 0, .radius = 0, .sweep = 0 };
            },
            'A' => {
                const rx_res = try parseNumber(skipSeparators(self.remaining_path));
                self.remaining_path = rx_res.remaining;

                const ry_res = try parseNumber(skipSeparators(self.remaining_path));
                self.remaining_path = ry_res.remaining;

                if (rx_res.val != ry_res.val) return ParseError.InvalidCommand;

                const x_axis_rot_res = try parseNumber(skipSeparators(self.remaining_path));
                self.remaining_path = x_axis_rot_res.remaining;
                const y_axis_rot_res = try parseNumber(skipSeparators(self.remaining_path));
                self.remaining_path = y_axis_rot_res.remaining;

                // Flags are single digits '0' or '1'
                _ = self.remaining_path[0];
                self.remaining_path = self.remaining_path[1..];
                const sweep_flag_val = self.remaining_path[0];
                self.remaining_path = self.remaining_path[1..];

                const x_res = try parseNumber(skipSeparators(self.remaining_path));
                self.remaining_path = x_res.remaining;

                const y_res = try parseNumber(skipSeparators(self.remaining_path));
                self.remaining_path = y_res.remaining;

                return .{
                    .command = command,
                    .x = x_res.val,
                    .y = y_res.val,
                    .radius = rx_res.val,
                    .sweep = if (sweep_flag_val == '1') 1 else 0,
                };
            },
            else => {
                std.debug.print("{c}", .{command});
                return ParseError.InvalidCommand;
            }
        }
    }
};

// test "SVG path parsing" {
//     const path_string = "M 10 20 L 30 40 A 50 50 0 1 0 60 70 Z";
//     var segments = try parsePath(std.testing.allocator, path_string);
//     defer segments.deinit();
//
//     try testing.expect(segments.items.len == 4);
//
//     try testing.expect(segments.items[0].command == 'M');
//     try testing.expect(segments.items[0].x == 10.0);
//     try testing.expect(segments.items[0].y == 20.0);
//
//     try testing.expect(segments.items[1].command == 'L');
//     try testing.expect(segments.items[1].x == 30.0);
//     try testing.expect(segments.items[1].y == 40.0);
//
//     try testing.expect(segments.items[2].command == 'A');
//     try testing.expect(segments.items[2].radius == 50.0);
//     try testing.expect(segments.items[2].sweep == 0);
//     try testing.expect(segments.items[2].y == 70.0);
//     try testing.expect(segments.items[2].x == 60.0);
//
//     try testing.expect(segments.items[3].command == 'Z');
// }
