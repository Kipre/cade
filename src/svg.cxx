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
  Handle(HLRBRep_Algo) hlr = new HLRBRep_Algo();
  hlr->Add(compound->compound);

  auto projector = new HLRAlgo_Projector(gp_Ax2(gp_Pnt(), gp_Dir(0.7, 1, 0.3)));
  hlr->Projector(*projector);
  hlr->Update();
  hlr->Hide();

  HLRBRep_HLRToShape hlrToShape(hlr);

  TopoDS_Shape visibleEdges = hlrToShape.VCompound();

  size_t writeLoc = 0;
  gp_Pnt lastPoint;
  gp_Pnt p2;

  for (TopExp_Explorer ex(visibleEdges, TopAbs_EDGE); ex.More(); ex.Next()) {
    const TopoDS_Edge &edge = TopoDS::Edge(ex.Current());

    BRepAdaptor_Curve curve(edge);
    GeomAbs_CurveType type = curve.GetType();

    lastPoint = p2;

    gp_Pnt p1 = curve.Value(curve.FirstParameter());
    p2 = curve.Value(curve.LastParameter());

    if (!p1.IsEqual(lastPoint, 1e-6)) {
      PathSegment move;
      move.x = p1.X();
      move.y = -p1.Y();
      move.command = 'M';
      segments[writeLoc++] = move;
    }

    if (type == GeomAbs_Line) {
      PathSegment line;
      line.x = p2.X();
      line.y = -p2.Y();
      line.command = 'L';
      segments[writeLoc++] = line;
      continue;
    }

    if (type == GeomAbs_Circle) {
      double r = curve.Circle().Radius();

      PathSegment arc;
      arc.x = p2.X();
      arc.y = -p2.Y();
      arc.command = 'A';
      arc.radius = r;
      segments[writeLoc++] = arc;
      continue;
    }

    if (type == GeomAbs_Ellipse) {
      auto ellipse = curve.Ellipse();

      double r = ellipse.MajorRadius();
      double r2 = ellipse.MinorRadius();
      auto dir = ellipse.XAxis().Direction();

      auto rot = ellipse.Axis().Direction();
      auto angle = dir.AngleWithRef(gp_Dir(1, 0, 0), rot);

      PathSegment arc;
      arc.x = p2.X();
      arc.y = -p2.Y();
      arc.command = 'A';
      arc.radius = r2;
      arc.radius2 = r;
      arc.large_arc = '0';
      arc.axis_rotation = rot.Z() * (90 + 180 * angle / 3.14159265358979323846);

      arc.sweep = rot.Z() > 0 ? '0' : '1';
      segments[writeLoc++] = arc;

      continue;
    }
  }
  return writeLoc;
}
}
