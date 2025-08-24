const solidify = @cImport({
    @cInclude("Solidify.h");
});

pub const PathSegment = solidify.PathSegment;
pub const pathToSolid = solidify.pathToSolid;
