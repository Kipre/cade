const std = @import("std");
const server = @import("server.zig");

pub fn main() !void {
    var gpa: std.heap.GeneralPurposeAllocator(.{}) = .init;
    const allocator = gpa.allocator();

    try server.serve(allocator);
}

test {
    std.testing.refAllDecls(@This());
}
