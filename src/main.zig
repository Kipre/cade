const std = @import("std");
const server = @import("server.zig");

pub fn main(init: std.process.Init) !void {
    try server.serve(init.gpa, init.io);
}

test {
    std.testing.refAllDecls(@This());
}
