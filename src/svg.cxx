
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

#include <GCPnts_QuasiUniformDeflection.hxx>

#include "occ.hxx"
#include "opaque.hxx"

extern "C" {

size_t shapeToSVGSegments(const Compound *compound, PathSegment *segments,
                          size_t maxLength) {
  // 1. HLR algorithm
  Handle(HLRBRep_Algo) hlr = new HLRBRep_Algo();
  hlr->Add(compound->compound);

  // Projection direction (Z axis → XY plane)
  auto projector = new HLRAlgo_Projector(gp_Ax2(gp_Pnt(), gp_Dir(0.2, 0.2, 1)));
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
    GeomAbs_CurveType type = curve.GetType();

    if (type == GeomAbs_Line) {
      gp_Pnt p1 = curve.Value(curve.FirstParameter());
      gp_Pnt p2 = curve.Value(curve.LastParameter());

      PathSegment move;
      move.x = p1.X();
      move.y = -p1.Y();
      move.command = 'M';
      segments[writeLoc++] = move;

      PathSegment line;
      line.x = p2.X();
      line.y = -p2.Y();
      line.command = 'L';
      segments[writeLoc++] = line;
    }
    else if (type == GeomAbs_Circle) {
      gp_Pnt p1 = curve.Value(curve.FirstParameter());
      gp_Pnt p2 = curve.Value(curve.LastParameter());

      double r = curve.Circle().Radius();

      PathSegment move;
      move.x = p1.X();
      move.y = -p1.Y();
      move.command = 'M';
      segments[writeLoc++] = move;

      PathSegment arc;
      arc.x = p2.X();
      arc.y = -p2.Y();
      arc.command = 'A';
      arc.radius = r;
      segments[writeLoc++] = arc;
    }

    GCPnts_QuasiUniformDeflection discretizer(curve.Curve(), 0.1);

    for (int i = 1; i <= discretizer.NbPoints(); ++i) {
      gp_Pnt p = discretizer.Value(i);
      if (writeLoc > maxLength) {
        std::cout << "Failed to project svg view because of insufficient memory"
                  << std::endl;
        return maxLength;
      }

      PathSegment segment;
      segment.x = p.X();
      segment.y = -p.Y();
      segment.command = i == 1 ? 'M' : 'L';
      segments[writeLoc++] = segment;
    }
  }
  return writeLoc;
}
}
