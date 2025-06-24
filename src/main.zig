const std = @import("std");
const cpp = @cImport({
    @cInclude("MakeBottle.h");
});

pub fn main() !void {
    cpp.helloWorld();
}
