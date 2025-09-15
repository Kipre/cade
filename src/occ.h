#include "occ.hxx"
#include "stddef.h"

typedef struct Shape Shape;
typedef struct Compound Compound;
typedef struct Transform Transform;

Shape *extrudePathWithHoles(const struct PathSegment *segments, size_t size,
                            double thickness);
void freeShape(Shape *shape);

int writeToOBJ(Shape *shape, char *buffer);
void saveToSTEP(Compound *cmp, const char *filepath);

Compound *makeCompound();
void freeCompound(Compound *cmp);

void addShapeToCompound(Compound *cmp, Shape *shape, Transform *trsf);

Transform *makeTransform(const double m[16]);
void freeTransform(Transform *trsf);

Shape *applyShapeLocationTransform(Shape *shape, Transform *trsf);

Shape *fuseShapes(Shape *shape1, Shape *shape2);

Shape *cutShape(Shape *toCut, Shape *cutout);
