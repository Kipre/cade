#include "occ.hxx"
#include "stddef.h"

typedef struct Shape Shape;
typedef struct Compound Compound;
typedef struct Transform Transform;

Shape *pathsToShape(const struct PathSegment *segments, size_t size, float thickness);
void freeShape(Shape *shape);

int writeToOBJ(Shape *shape, char *buffer);
void saveToSTEP(Compound *cmp, const char *filepath);

Compound *makeCompound();
void freeCompound(Compound *cmp);

void addShapeToCompound(Compound *cmp, Shape *shape, Transform *trsf);

Transform *makeTransform(const double m[16]);
void freeTransform(Transform *trsf);
