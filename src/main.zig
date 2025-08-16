const std = @import("std");
const bottle = @cImport({
    @cInclude("MakeBottle.h");
});

const solidify = @cImport({
    @cInclude("Solidify.h");
});

pub fn main() !void {
    _ = solidify.pathToSolid();
}
