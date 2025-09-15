const std = @import("std");
const parse = @import("parse_path.zig");
const occ = @import("occ.zig");
const Allocator = std.mem.Allocator;

const expect = std.testing.expect;
const PathSegment = occ.PathSegment;

pub const RawFlatPart = struct {
    outside: []const u8,
    insides: [][]const u8,
};

pub const Transform = [16]f64;

pub const InstancedGeometry = struct {
    part: RawFlatPart,
    instances: []Transform,
};

pub const CompactPartDefinition = struct {
    geometries: []InstancedGeometry,
};

pub fn parsePath(allocator: Allocator, segmentsArray: *std.ArrayList(PathSegment), path: []const u8) !void {
    var iterator = parse.SVGPathIterator.init(path);
    while (try iterator.next()) |val| {
        try segmentsArray.append(allocator, val);
    }
}

fn parseRawFlatPart(allocator: std.mem.Allocator, part: *const RawFlatPart) !std.ArrayList(PathSegment) {
    var segments: std.ArrayList(PathSegment) = .empty;
    // defer allocator.free(segments);

    try parsePath(allocator, &segments, part.outside);

    for (part.insides) |path| {
        try parsePath(allocator, &segments, path);
    }

    return segments;
}

pub fn flatPartToOBJ(allocator: std.mem.Allocator, part: *RawFlatPart, output_buffer: [*c]u8) !usize {
    var segments = try parseRawFlatPart(allocator, part);
    // defer allocator.free(segments);
    const size = segments.items.len;
    const array = try segments.toOwnedSlice(allocator);

    const shape = occ.extrudePathWithHoles(array.ptr, size, 15);
    defer occ.freeShape(shape);

    const cint_obj_size = occ.writeToOBJ(shape, output_buffer);

    const obj_size: usize = @intCast(cint_obj_size);
    return obj_size;
}

pub fn solidify(allocator: std.mem.Allocator, definition: *std.json.Value, output_buffer: [*c]u8) !usize {
    const shape = try executeShapeRecipe(allocator, definition);
    defer occ.freeShape(shape);

    const cint_obj_size = occ.writeToOBJ(shape, output_buffer);

    const obj_size: usize = @intCast(cint_obj_size);
    return obj_size;
}

pub fn executeShapeRecipe(allocator: std.mem.Allocator, definition: *std.json.Value) !*occ.Shape {
    const shapeRecipe = definition.object.get("shape").?.array;
    const nbSteps = shapeRecipe.items.len;
    var shapes = try allocator.alloc(*occ.Shape, nbSteps);
    defer allocator.free(shapes);

    for (0..nbSteps) |i| {
        const step = shapeRecipe.items[i].object;
        const operation = step.get("type").?.string;

        if (std.mem.eql(u8, operation, "extrusion")) {
            var segments: std.ArrayList(PathSegment) = .empty;
            // defer allocator.free(segments);

            try parsePath(allocator, &segments, step.get("outside").?.string);

            for (step.get("insides").?.array.items) |path| {
                try parsePath(allocator, &segments, path.string);
            }

            const size = segments.items.len;
            const array = try segments.toOwnedSlice(allocator);

            var result = occ.extrudePathWithHoles(array.ptr, size, step.get("thickness").?.float);

            const placement = step.get("placement");
            const transform = placement.?.array.items;
            if (placement == null) {
                var mat: [16]f64 = undefined;
                for (0..15) |j| mat[j] = transform[i].float;
                const trsf = occ.makeTransform(&mat[0]);
                result = occ.applyShapeLocationTransform(result, trsf);
            }

            shapes[i] = result.?;
            continue;
        }

        if (std.mem.eql(u8, operation, "fuse")) {
            const shapeIndexes = step.get("shapes").?.array.items;
            var currentShape = shapes[@intCast(shapeIndexes[0].integer)];
            for (1..shapeIndexes.len) |idx| {
                currentShape = occ.fuseShapes(currentShape, shapes[@intCast(shapeIndexes[idx].integer)]).?;
            }

            shapes[i] = currentShape;
            continue;
        }

        if (std.mem.eql(u8, operation, "cut")) {
            const shapeIndexes = step.get("shapes").?.array.items;
            var currentShape = shapes[@intCast(shapeIndexes[0].integer)];
            for (1..shapeIndexes.len) |idx| {
                currentShape = occ.cutShape(currentShape, shapes[@intCast(shapeIndexes[idx].integer)]).?;
            }

            shapes[i] = currentShape;
            continue;
        }
    }

    return shapes[nbSteps - 1];
}

pub fn exportAsSTEP(allocator: std.mem.Allocator, definition: *CompactPartDefinition) !void {
    const compound = occ.makeCompound();
    defer occ.freeCompound(compound);

    for (definition.geometries) |geom| {
        var segments = try parseRawFlatPart(allocator, &geom.part);
        const size = segments.items.len;
        const array = try segments.toOwnedSlice(allocator);

        for (geom.instances) |instance| {
            const shape = occ.extrudePathWithHoles(array.ptr, size, 15);
            var mat: [16]f64 = instance;
            const transform = occ.makeTransform(&mat[0]);
            occ.addShapeToCompound(compound, shape, transform);
        }
    }

    var filepath = "C:/Users/kipr/Downloads/test.step";
    occ.saveToSTEP(compound, &filepath[0]);
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
