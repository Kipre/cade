
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Shape.hxx>

#include <HLRBRep_Algo.hxx>
#include <HLRBRep_HLRToShape.hxx>

#include <gp_Dir.hxx>
#include <gp_Pnt2d.hxx>

#include <BRepAdaptor_Curve.hxx>
#include <Geom2d_Curve.hxx>

#include "occ.hxx"
#include "opaque.hxx"

extern "C" {

size_t shapeToSVGSegments(const Shape *shape, PathSegment *segments,
                        size_t maxLength) {
  // 1. HLR algorithm
  Handle(HLRBRep_Algo) hlr = new HLRBRep_Algo();
  hlr->Add(shape->shape);

  // Projection direction (Z axis → XY plane)
  auto projector = new HLRAlgo_Projector(gp_Ax2(gp_Pnt(), gp_Dir(0, 0, 1)));
  hlr->Projector(*projector);
  hlr->Update();
  hlr->Hide();

  // 2. Convert HLR result to shapes
  HLRBRep_HLRToShape hlrToShape(hlr);

  TopoDS_Shape visibleEdges = hlrToShape.VCompound();

  size_t writeLoc = 0;

  for (TopExp_Explorer ex(visibleEdges, TopAbs_EDGE); ex.More(); ex.Next()) {
    const TopoDS_Edge &edge = TopoDS::Edge(ex.Current());

    BRepAdaptor_Curve curve(edge);
    double f = curve.FirstParameter();
    double l = curve.LastParameter();

    // Simple polyline approximation
    const int steps = 20;

    for (int i = 0; i <= steps; ++i) {
      if (writeLoc > maxLength) {
        std::cout << "Failed to project svg view because of insufficient memory"
                  << std::endl;
        return maxLength;
      }

      double t = f + (l - f) * i / steps;
      gp_Pnt p = curve.Value(t);
      PathSegment segment = segments[writeLoc];
      segment.x = p.X();
      segment.y = p.Y();

      if (i == 0)
        segment.command = 'M';
      else
        segment.command = 'L';
    }
  }
  return writeLoc;
}
}
