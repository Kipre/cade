const std = @import("std");
const parse = @import("parse_path.zig");
const occ = @import("occ.zig");
const Allocator = std.mem.Allocator;

const expect = std.testing.expect;
const PathSegment = occ.PathSegment;

pub const Transform = [16]f64;

pub const GeometryInstances = struct {
    part: std.json.Value,
    instances: []Transform,
};

pub const CompactPartDefinition = struct {
    geometries: []GeometryInstances,
};

pub fn getNumber(val: std.json.Value) !f64 {
    return switch (val) {
        .integer => |i| @floatFromInt(i),
        .float => |f| f,
        else => return error.NotANumber,
    };
}

pub fn parsePath(allocator: Allocator, segmentsArray: *std.ArrayList(PathSegment), path: []const u8) !void {
    var iterator = parse.SVGPathIterator.init(path);
    while (try iterator.next()) |val| {
        try segmentsArray.append(allocator, val);
    }
}

pub fn solidify(allocator: std.mem.Allocator, definition: *std.json.Value, output_buffer: [*c]u8) !usize {
    const shape = try executeShapeRecipe(allocator, definition);
    defer occ.freeShape(shape);

    const cint_obj_size = occ.writeToOBJ(shape, output_buffer);

    const obj_size: usize = @intCast(cint_obj_size);
    return obj_size;
}

pub fn executeShapeRecipe(allocator: std.mem.Allocator, definition: *const std.json.Value) !*occ.Shape {
    const shapeRecipe = definition.object.get("shape").?.array.items;
    const nbSteps = shapeRecipe.len;
    var shapes = try allocator.alloc(*occ.Shape, nbSteps);
    defer allocator.free(shapes);

    for (shapeRecipe, 0..) |recipeStep, i| {
        const step = recipeStep.object;
        const operation = step.get("type").?.string;

        if (std.mem.eql(u8, operation, "extrusion")) {
            var segments: std.ArrayList(PathSegment) = .empty;
            // defer allocator.free(segments);

            for (step.get("outsides").?.array.items) |path| {
                try parsePath(allocator, &segments, path.string);
            }

            for (step.get("insides").?.array.items) |path| {
                try parsePath(allocator, &segments, path.string);
            }

            const size = segments.items.len;
            const array = try segments.toOwnedSlice(allocator);

            var result = occ.extrudePathWithHoles(array.ptr, size, try getNumber(step.get("length").?));

            if (step.get("placement")) |placement| {
                const transform = placement.array.items;
                var mat: Transform = undefined;
                for (0..15) |j| mat[j] = try getNumber(transform[j]);
                const trsf = occ.makeTransform(&mat[0]);
                result = occ.applyShapeLocationTransform(result, trsf);
            }

            shapes[i] = result.?;
            continue;
        }

        if (std.mem.eql(u8, operation, "sweep")) {
            var segments: std.ArrayList(PathSegment) = .empty;

            try parsePath(allocator, &segments, step.get("directrix").?.string);
            const directrixSize = segments.items.len;

            for (step.get("outsides").?.array.items) |path| {
                try parsePath(allocator, &segments, path.string);
            }
            for (step.get("insides").?.array.items) |path| {
                try parsePath(allocator, &segments, path.string);
            }

            const size = segments.items.len;
            const array = try segments.toOwnedSlice(allocator);

            var result = occ.sweepPathAlong3DPath(array.ptr, directrixSize, size);

            if (step.get("placement")) |placement| {
                const transform = placement.array.items;
                var mat2: Transform = undefined;
                for (0..15) |j| mat2[j] = try getNumber(transform[j]);
                const trsf = occ.makeTransform(&mat2[0]);
                result = occ.applyShapeLocationTransform(result, trsf);
            }

            shapes[i] = result.?;
            continue;
        }

        if (std.mem.eql(u8, operation, "revolve")) {
            var segments: std.ArrayList(PathSegment) = .empty;

            try parsePath(allocator, &segments, step.get("path").?.string);

            const axis_numbers = step.get("axis").?.array.items;
            var mat: Transform = undefined;
            for (0..15) |j| mat[j] = try getNumber(axis_numbers[j]);
            const axis = occ.makeTransform(&mat[0]);

            const size = segments.items.len;
            const array = try segments.toOwnedSlice(allocator);

            const rotation = try getNumber(step.get("rotation").?);
            var result = occ.revolvePath(array.ptr, size, axis, rotation);

            if (step.get("placement")) |placement| {
                const transform = placement.array.items;
                var mat2: Transform = undefined;
                for (0..15) |j| mat2[j] = try getNumber(transform[j]);
                const trsf = occ.makeTransform(&mat2[0]);
                result = occ.applyShapeLocationTransform(result, trsf);
            }

            shapes[i] = result.?;
            continue;
        }

        if (std.mem.eql(u8, operation, "fuse")) {
            const shapeIndexes = step.get("shapes").?.array.items;
            // i dont know how to not initialize this
            var currentShape = shapes[0];
            for (shapeIndexes, 0..) |item, j| {
                var shape = shapes[@intCast(item.object.get("shape").?.integer)];
                if (item.object.get("placement")) |placement| {
                    const transform = placement.array.items;
                    var mat: Transform = undefined;
                    for (0..15) |k| mat[k] = try getNumber(transform[j]);
                    const trsf = occ.makeTransform(&mat[0]);
                    shape = occ.applyShapeLocationTransform(shape, trsf).?;
                }

                if (j == 0) {
                    currentShape = shape;
                } else {
                    currentShape = occ.fuseShapes(currentShape, shape).?;
                }
            }

            shapes[i] = currentShape;
            continue;
        }

        if (std.mem.eql(u8, operation, "cut")) {
            var currentShape = shapes[@intCast(step.get("shape").?.integer)];
            const cutoutIndexes = step.get("cutouts").?.array.items;
            for (cutoutIndexes) |item| {
                var shape = shapes[@intCast(item.object.get("shape").?.integer)];
                if (item.object.get("placement")) |placement| {
                    const transform = placement.array.items;
                    var mat: Transform = undefined;
                    for (0..15) |j| mat[j] = try getNumber(transform[j]);
                    const trsf = occ.makeTransform(&mat[0]);
                    shape = occ.applyShapeLocationTransform(shape, trsf).?;
                }
                currentShape = occ.cutShape(currentShape, shape).?;
            }

            shapes[i] = currentShape;
            continue;
        }

        std.debug.print("could not understand operation {s}\n", .{operation});
        return error.TypeError;
    }

    return shapes[nbSteps - 1];
}

pub fn assembleCompound(allocator: std.mem.Allocator, compound: *occ.Compound, definition: * const CompactPartDefinition) !void {
    for (definition.geometries) |geom| {
        const shape = try executeShapeRecipe(allocator, &geom.part);

        for (geom.instances) |instance| {
            var mat: Transform = instance;
            const transform = occ.makeTransform(&mat[0]);
            occ.addShapeToCompound(compound, shape, transform);
        }
    }
}

pub fn exportAsSTEP(allocator: std.mem.Allocator, definition: *CompactPartDefinition) !void {
    const compound = occ.makeCompound().?;
    defer occ.freeCompound(compound);

    try assembleCompound(allocator, compound, definition);

    var filepath = "C:/Users/kipr/Downloads/test.step";
    occ.saveToSTEP(compound, &filepath[0]);
}

pub fn projectSVG(allocator: std.mem.Allocator, definition: * const CompactPartDefinition) !void {
    const compound = occ.makeCompound().?;
    defer occ.freeCompound(compound);

    try assembleCompound(allocator, compound, definition);

    const filepath = "./schema.svg";
    const max_capacity = 1e5;

    var items: [max_capacity]PathSegment = @splat(.{});
    const array = items[0..];

    const length = occ.shapeToSVGSegments(compound, array.ptr, max_capacity);

    const file = try std.fs.cwd().createFile(filepath, .{});
    defer file.close();

    var file_writer = file.writer(&.{});
    const writer = &file_writer.interface;

    try parse.writeSegmentsToSVG(writer, array[0..length]);
    try writer.flush();
    std.debug.print("successfully wrote svg file with {d} segments\n", .{length});
}

test "simple" {
    try std.testing.expect(1 + 1 == 2);
    // std.debug.print("hello word", .{});
}

test "projects a definition" {
    const allocator = std.testing.allocator;

    const json = 
    \\ {"geometries":[
    \\   {"part":{"shape":[{"type":"extrusion","placement":[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],"length":15,"outsides":["M -75 0 L -75 300 L 75 300 L 75 0 Z"],"insides":["M 16.2 20 A 3.1 3.1 0 0 0 10 20 L 10.000000000000005 35 A 3.1 3.1 0 0 0 16.200000000000003 35 L 33.79999999999999 35.00000000000001 A 3.1 3.1 0 0 0 39.999999999999986 34.99999999999999 L 40 19.999999999999993 A 3.1 3.1 0 0 0 33.8 19.999999999999996 Z","M -33.8 20 A 3.1 3.1 0 0 0 -40 20 L -39.99999999999999 35 A 3.1 3.1 0 0 0 -33.8 35 L -16.200000000000003 35.00000000000001 A 3.1 3.1 0 0 0 -10.000000000000009 34.99999999999999 L -9.999999999999996 19.999999999999993 A 3.1 3.1 0 0 0 -16.199999999999996 19.999999999999996 Z"]}],"name":"page"},"instances":[[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]]},
    \\   {"part":{"shape":[{"type":"extrusion","placement":[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],"length":15,"outsides":["M 0 -50 L -1.9013438260070653e-15 -46.199999999999996 A 3.1 3.1 0 0 1 -1.5217033182713861e-15 -40 L -12 -40 A 3 3 0 0 0 -15 -36.99999999999999 L -15.000000000000009 -12.999999999999995 A 3 3 0 0 0 -11.999999999999998 -9.999999999999996 L 3.1526688044964397e-16 -9.999999999999996 A 3.1 3.1 0 0 1 6.949073881853234e-16 -3.799999999999997 L -1.2981256070961944e-15 3.8000000000000007 A 3.1 3.1 0 0 1 -9.18485099360515e-16 10 L -12 10 A 3 3 0 0 0 -15 13.000000000000002 L -15.000000000000009 37 A 3 3 0 0 0 -11.999999999999998 40 L 9.18485099360515e-16 40 A 3.1 3.1 0 0 1 1.2981256070961944e-15 46.2 L 0 50 L 50 50 L 50 -50 Z"],"insides":[]}],"name":0},"instances":[[0,0,1,0,1,0,0,0,0,1,0,0,0,20,15,1]]}
    \\ ]}
    ;

    const parsed = try std.json.parseFromSlice(
        CompactPartDefinition,
        allocator,
        json,
        .{.ignore_unknown_fields = true},
    );
    defer parsed.deinit();

    try projectSVG(allocator, &parsed.value);
}
