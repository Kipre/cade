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

pub fn exportAsSTEP(allocator: std.mem.Allocator, definition: *CompactPartDefinition) !void {
    const compound = occ.makeCompound();
    defer occ.freeCompound(compound);

    for (definition.geometries) |geom| {
        const shape = try executeShapeRecipe(allocator, &geom.part);

        for (geom.instances) |instance| {
            var mat: Transform = instance;
            const transform = occ.makeTransform(&mat[0]);
            occ.addShapeToCompound(compound, shape, transform);
        }
    }

    var filepath = "C:/Users/kipr/Downloads/test.step";
    occ.saveToSTEP(compound, &filepath[0]);
}
