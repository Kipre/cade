const occ = @cImport({
    @cInclude("occ.h");
});

pub const Shape = occ.Shape;
pub const Compound = occ.Compound;
pub const Transform = occ.Transform;
pub const PathSegment = occ.PathSegment;

pub const extrudePathWithHoles = occ.extrudePathWithHoles;
pub const freeShape = occ.freeShape;
pub const writeToOBJ = occ.writeToOBJ;
pub const saveToSTEP = occ.saveToSTEP;
pub const makeCompound = occ.makeCompound;
pub const freeCompound = occ.freeCompound;
pub const addShapeToCompound = occ.addShapeToCompound;
pub const makeTransform = occ.makeTransform;
pub const freeTransform = occ.freeTransform;
pub const applyShapeLocationTransform = occ.applyShapeLocationTransform;
pub const fuseShapes = occ.fuseShapes;
pub const cutShape = occ.cutShape;
