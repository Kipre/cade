#include <BRep_Builder.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Shape.hxx>

#ifndef CADE_OPAQUE_H
#define CADE_OPAQUE_H

struct Shape {
  TopoDS_Shape shape;
};

struct Compound {
  TopoDS_Compound compound;
  BRep_Builder builder;
  Compound() { builder.MakeCompound(compound); }
};

struct Transform {
  gp_Trsf trsf;
};

#endif /* CADE_OPAQUE_H */
