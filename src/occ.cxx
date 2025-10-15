#include <cmath>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <string>

// OpenCASCADE Headers
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_Transform.hxx>
#include <BRepOffsetAPI_MakePipe.hxx>
#include <BRepPrimAPI_MakeRevol.hxx>
#include <Geom_BezierCurve.hxx>
#include <Geom_Line.hxx>
#include <Geom_TrimmedCurve.hxx>
#include <gp_Circ.hxx>
#include <gp_Dir.hxx>
#include <gp_Lin.hxx>
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>

#include <TopoDS_Compound.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <TopoDS_Wire.hxx>

#include <Standard_Real.hxx>

#include <GC_MakeArcOfCircle.hxx>
#include <GC_MakeCircle.hxx>

#include <BRepMesh_IncrementalMesh.hxx>
#include <Poly_Triangulation.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>

#include <BRepPrimAPI_MakePrism.hxx>
#include <Interface_Static.hxx>
#include <STEPControl_Writer.hxx>

#include <IMeshTools_Context.hxx>
#include <IMeshTools_MeshBuilder.hxx>
#include <IMeshTools_Parameters.hxx>

#include <BRep_Tool.hxx>
#include <IMeshTools_Context.hxx>
#include <IMeshTools_MeshBuilder.hxx>
#include <IMeshTools_Parameters.hxx>
#include <Message_Algorithm.hxx>
#include <Message_Messenger.hxx>
#include <Message_MsgFile.hxx>

#include <BRepAlgoAPI_Check.hxx>
#include <BRepTools.hxx>

#include <BRep_Builder.hxx>
#include <TopLoc_Location.hxx>
#include <gp_Trsf.hxx>

#include <BRepAlgoAPI_Cut.hxx>
#include <BRepAlgoAPI_Fuse.hxx>

#include <BRepAdaptor_Curve.hxx>
#include <GCPnts_QuasiUniformDeflection.hxx>

#include <TopExp.hxx>

#include "occ.hxx"


gp_Dir getWireStartTangent(const TopoDS_Wire& wire) {
    // Get the first edge of the wire
    TopExp_Explorer expEdge(wire, TopAbs_EDGE);
    if (!expEdge.More()) {
        throw Standard_Failure("Wire has no edges");
    }

    TopoDS_Edge edge = TopoDS::Edge(expEdge.Current());

    // TopoDS_Edge edge;
    // for (; expEdge.More(); expEdge.Next()) {
    //     edge = TopoDS::Edge(expEdge.Current());
    // }


    // Get start and end vertices
    TopoDS_Vertex vStart, vEnd;
    TopExp::Vertices(edge, vStart, vEnd);


    // Get the start point
    gp_Pnt pnt = BRep_Tool::Pnt(vStart);

    // Get tangent direction at the start
    BRepAdaptor_Curve curve(edge);
    gp_Dir tangent;
    gp_Vec d1;
    curve.D1(curve.FirstParameter(), pnt, d1);
    tangent = gp_Dir(d1);
    return tangent;

    // Construct and return gp_Ax1
    // return gp_Ax1(pnt, tangent);
}

void printPoint(gp_Pnt pnt) {
  std::cout << std::setprecision(15) << "Vertex: " << pnt.X() << ", " << pnt.Y()
            << ", " << pnt.Z() << std::endl;
}

std::string segmentsToPathString(const PathSegment *segments, size_t length) {
  std::ostringstream oss;

  for (size_t i = 0; i < length; i++) {
    const auto segment = segments[i];

    switch (segment.command) {
    case 'M':
    case 'L': {
      oss << segment.command << " " << segment.x << " " << segment.y;
      break;
    }
    case 'A': {
      oss << "A " << segment.radius << " " << segment.radius << " 0 0 "
          << ((segment.sweep == 0) ? '0' : '1') << " " << segment.x << " "
          << segment.y;
      break;
    }
    case 'Z':
    case 'z': {
      oss << "Z";
      continue;
    }
    default:
      std::cerr << "Warning: Unhandled command '" << segment.command
                << "' for wire creation." << std::endl;
      continue;
    }
    oss << " ";
  }

  return oss.str();
}

std::tuple<int, int, int> getPointKey(const gp_Pnt &p) {
  // Use rounded integer key to avoid floating-point mismatch
  int keyX = static_cast<int>(std::round(p.X() * 1000000)); // 1e-6 tolerance
  int keyY = static_cast<int>(std::round(p.Y() * 1000000));
  int keyZ = static_cast<int>(std::round(p.Z() * 1000000));
  return std::make_tuple(keyX, keyY, keyZ);
}

/**
 * @brief Meshes a given solid shape and writes the mesh data to an OBJ file.
 * @param aShape The solid shape to be meshed.
 * @param buffer The buffer to write to.
 */
int writeSolidToObj(const TopoDS_Shape &shape, char *buffer,
                    bool dumpOutlines = true) {
  std::ostringstream oss;

  if (shape.IsNull()) {
    std::cerr << "Error: Cannot write a null shape to OBJ." << std::endl;
    return -1;
  }

  buffer[1024 * 16 + 10] = '4';
  // Use a sensible deflection value (e.g., 0.1) for a good balance of detail
  // and file size.
  BRepMesh_IncrementalMesh aMesh(shape, 1, false, 0.5);

  oss << "# Open CASCADE Technology generated OBJ file" << std::endl;
  oss << "g occt_solid" << std::endl;

  // A map to store vertices and their assigned OBJ indices
  std::map<std::tuple<int, int, int>, int> vertexMap;

  // Keep track of the vertex index count as OBJ face indices are 1-based.
  int vertexCount = 1;
  TopExp_Explorer anExpFace(shape, TopAbs_FACE);
  for (; anExpFace.More(); anExpFace.Next()) {
    const TopoDS_Face &aFace = TopoDS::Face(anExpFace.Current());
    TopLoc_Location aLocation;
    Handle(Poly_Triangulation) aTriangulation =
        BRep_Tool::Triangulation(aFace, aLocation);

    if (!aTriangulation.IsNull()) {
      const auto nb_nodes = aTriangulation->NbNodes();
      for (int i = 1; i <= nb_nodes; ++i) {
        gp_Pnt node = aTriangulation->Node(i);

        if (!aLocation.IsIdentity()) {
          node.Transform(aLocation.Transformation());
        }

        const auto key = getPointKey(node);
        vertexMap[key] = vertexCount++;

        oss << "v " << node.X() << " " << node.Y() << " " << node.Z()
            << std::endl;
      }
    }
  }

  std::ostringstream linesStream;

  for (TopExp_Explorer exp(shape, TopAbs_EDGE); exp.More(); exp.Next()) {
    TopoDS_Edge edge = TopoDS::Edge(exp.Current());

    // Get 3D curve of the edge
    Standard_Real first, last;
    Handle(Geom_Curve) curve = BRep_Tool::Curve(edge, first, last);
    if (curve.IsNull())
      continue;

    BRepAdaptor_Curve adapt(edge);

    // Discretize edge with a deflection-based algorithm
    GCPnts_QuasiUniformDeflection discretizer(adapt, 0.01); // tolerance = 0.01
    if (!discretizer.IsDone())
      continue;

    linesStream << "l";

    for (int i = 1; i <= discretizer.NbPoints(); ++i) {
      gp_Pnt p = discretizer.Value(i);

      const auto key = getPointKey(p);
      auto it = vertexMap.find(key);

      int idx;

      if (it == vertexMap.end()) {
        idx = vertexCount;
        vertexMap[key] = vertexCount++;
        oss << "v " << p.X() << " " << p.Y() << " " << p.Z() << std::endl;
      } else {
        idx = it->second;
      }

      linesStream << " " << idx;
    }

    linesStream << "\n";
  }

  // This loop is separate to ensure all vertices are defined before the faces.
  int currentVertexOffset = 1;
  anExpFace.Init(shape, TopAbs_FACE);

  for (; anExpFace.More(); anExpFace.Next()) {
    const TopoDS_Face &aFace = TopoDS::Face(anExpFace.Current());
    TopLoc_Location aLocation;
    Handle(Poly_Triangulation) aTriangulation =
        BRep_Tool::Triangulation(aFace, aLocation);

    if (!aTriangulation.IsNull()) {
      const auto nb_triangles = aTriangulation->NbTriangles();
      for (int i = 1; i <= nb_triangles; ++i) {
        Poly_Triangle tri = aTriangulation->Triangle(i);
        Standard_Integer n1, n2, n3;
        tri.Get(n1, n2, n3);
        // OBJ face indices are 1-based and relative to the start of the file.
        // We add the offset from previous faces to get the correct global
        // index.
        oss << "f " << (n1 + currentVertexOffset - 1) << " "
            << (n2 + currentVertexOffset - 1) << " "
            << (n3 + currentVertexOffset - 1) << std::endl;
      }
      currentVertexOffset += aTriangulation->NbNodes();
    }
  }

  if (dumpOutlines) {
    oss << linesStream.str();
  }

  std::string str = oss.str();
  const auto length = str.size();

  std::cout << "Attempting to write " << length << " bytes to buffer"
            << std::endl;
  str.copy(buffer, length);
  std::cout << "Successfully wrote mesh to buffer " << std::endl;
  return length;
}

bool WriteCompoundToSTEPString2(const TopoDS_Compound &compound,
                                std::string &stepString) {
  // Create STEP writer
  STEPControl_Writer writer;

  // Set precision and units (optional)
  Interface_Static::SetCVal("write.precision.val", "0.001");
  Interface_Static::SetCVal("write.step.unit", "MM");

  // Transfer the compound to the writer
  IFSelect_ReturnStatus status = writer.Transfer(compound, STEPControl_AsIs);
  if (status != IFSelect_RetDone) {
    std::cerr << "Error: Failed to transfer compound to STEP writer"
              << std::endl;
    return false;
  }

  // Write to a temporary file first (OpenCascade doesn't directly support
  // string output)
  const char *tempFileName = "C:/Users/kipr/Downloads/test.stp";
  status = writer.Write(tempFileName);
  if (status != IFSelect_RetDone) {
    std::cerr << "Error: Failed to write STEP file" << std::endl;
    return false;
  }

  // Read the file content into a string
  std::ifstream file(tempFileName);
  if (!file.is_open()) {
    std::cerr << "Error: Could not open temporary STEP file" << std::endl;
    return false;
  }

  std::stringstream buffer;
  buffer << file.rdbuf();
  stepString = buffer.str();
  file.close();

  // Clean up temporary file
  // std::remove(tempFileName);

  return true;
}

gp_Pnt2d getCircleCenter(const gp_Pnt2d &startPoint, const gp_Pnt2d &endPoint,
                         double radius, int sweepFlag) {

  double d = startPoint.Distance(endPoint);

  // Handle invalid input conditions
  if (d > (2 * radius + 1e-3) || radius <= 0) {
    std::cerr << "d = " << d << " and 2 * radius = " << 2 * radius << std::endl;
    std::cerr << "Error: Invalid radius. Radius must be positive and at least "
                 "half the distance between points."
              << std::endl;
    return gp_Pnt2d();
  }

  gp_Pnt2d midpoint((startPoint.X() + endPoint.X()) / 2.0,
                    (startPoint.Y() + endPoint.Y()) / 2.0);

  double distanceToCenter = sqrt(radius * radius - (d / 2.0) * (d / 2.0));

  // if arc is precisely a half-circle
  if (std::isnan(distanceToCenter))
    distanceToCenter = 0;

  gp_Vec2d startEndVec(startPoint, endPoint);
  gp_Vec2d perpendicularVec(-startEndVec.Y(), startEndVec.X());
  perpendicularVec.Normalize();

  gp_Pnt2d center = midpoint.Translated(perpendicularVec.Multiplied(
      ((sweepFlag == 1) ? 1 : -1) * distanceToCenter));

  return center;
}

gp_Pnt2d getCircleCenter(const gp_Pnt &startPoint, const gp_Pnt &endPoint,
                         double radius, int sweepFlag) {
  const gp_Pnt2d start(startPoint.X(), startPoint.Y());
  const gp_Pnt2d end(endPoint.X(), endPoint.Y());
  return getCircleCenter(start, end, radius, sweepFlag);
}

gp_Pnt promote(gp_Pnt2d p) { return gp_Pnt(p.X(), p.Y(), 0.0); }

/**
 * @brief Creates an OpenCASCADE TopoDS_Wire from parsed SVG path segments.
 * This function assumes a 2D path in the XY plane.
 * @param segments A vector of parsed SvgPathSegment objects.
 * @return An OpenCASCADE TopoDS_Wire object. Returns a null wire if an error
 * occurs.
 */
TopoDS_Wire createWireFromPathSegments(const PathSegment *segments,
                                       size_t size) {
  BRepBuilderAPI_MakeWire makeWire;
  gp_Pnt lastPoint;
  gp_Pnt startPoint;

  gp_Dir z3(0, 0, 1);
  gp_Dir nz3(0, 0, -1);

  bool firstMove = true;

  for (size_t i = 0; i < size; i++) {
    const auto segment = segments[i];

    TopoDS_Edge edge;
    gp_Pnt currentPoint(segment.x, segment.y, 0);

    switch (segment.command) {
    case 'M': {
      if (firstMove) {
        startPoint = currentPoint; // Set start point for the first subpath
        firstMove = false;
      }
      break;
    }
    case 'L': {
      edge = BRepBuilderAPI_MakeEdge(lastPoint, currentPoint);
      break;
    }
    case 'A': {
      const gp_Pnt center = promote(getCircleCenter(
          lastPoint, currentPoint, segment.radius, segment.sweep));

      const auto v1 = gp_Vec(center, lastPoint);
      const auto v2 = gp_Vec(center, currentPoint);
      const auto angle = v1.Angle(v2);

      const auto v05 =
          v1.Rotated(gp_Ax1(), (segment.sweep ? 1 : -1) * angle / 2);

      const auto midPoint = gp_Pnt(v05.XYZ().Added(center.XYZ()));

      Handle(Geom_TrimmedCurve) arc =
          GC_MakeArcOfCircle(lastPoint, midPoint, currentPoint);

      edge = BRepBuilderAPI_MakeEdge(arc);
      break;
    }
    case 'Z':
    case 'z': {
      // If the last point is not the start point, create a line segment to
      // close the path
      if (!lastPoint.IsEqual(startPoint, Precision::Confusion())) {
        edge = BRepBuilderAPI_MakeEdge(lastPoint, startPoint);
      }
      break;
    }
    default:
      std::cerr << "Warning: Unhandled command '" << segment.command
                << "' for wire creation." << std::endl;
      continue;
    }

    lastPoint = currentPoint;

    if (!edge.IsNull()) {
      makeWire.Add(edge);

      if (makeWire.Error()) {
        std::cout << "make wire error at segment nb " << i << makeWire.Error()
                  << std::endl;
      }
    }
  }

  if (!makeWire.IsDone()) {
    std::cerr << "Error: Failed to create TopoDS_Wire. Reason: "
              << makeWire.Error() << std::endl;
    return TopoDS_Wire(); // Return a null wire
  }

  auto result = makeWire.Wire();

  if (!BRep_Tool::IsClosed(result)) {
    std::cerr << "Error: Created wire is not closed." << std::endl;
  }

  return result;
}

TopoDS_Face makeFaceFromSegments(const PathSegment *segments, size_t size) {
  std::vector<TopoDS_Wire> wires = {};

  size_t lastEnd = 0;

  while (lastEnd < size) {
    size_t currentSize = 0;
    while (segments[lastEnd + currentSize].command != 'Z')
      currentSize++;

    TopoDS_Wire wire =
        createWireFromPathSegments(segments + lastEnd, ++currentSize);

    if (wire.IsNull()) {
      std::cerr << "\nFailed to create TopoDS_Wire nb " << wires.size() + 1
                << std::endl;
      const auto path = segmentsToPathString(segments + lastEnd, currentSize);
      std::cerr << path << std::endl;
      return {};
    }

    wires.push_back(wire);
    lastEnd += currentSize;
  }

  std::cout << "\nSuccessfully created OpenCASCADE TopoDS_Wire." << std::endl;

  TopoDS_Wire outer = wires[0];

  if (outer.Orientation() != TopAbs_FORWARD) {
    outer.Reverse();
  }

  BRepBuilderAPI_MakeFace makeFace(outer);
  if (!makeFace.IsDone()) {
    std::cerr << "Warning: Could not create a face from the wire. It might not "
                 "be closed or planar."
              << std::endl;
  }

  bool first = true;
  for (TopoDS_Wire &wire : wires) {

    // skip first
    if (first) {
      first = false;
      continue;
    }

    // TODO maybe actually reverse the wire
    if (wire.Orientation() != TopAbs_REVERSED) {
      wire.Reverse();
    }

    makeFace.Add(wire);
  }

  TopoDS_Face face = makeFace.Face();

  return face;
}

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

extern "C" {

Shape *extrudePathWithHoles(const PathSegment *segments, size_t size,
                            double thickness) {
  TopoDS_Face face = makeFaceFromSegments(segments, size);
  if (!face.IsNull()) {
    std::cout << "Successfully created TopoDS_Face from the wire." << std::endl;
  }

  gp_Vec aVector(0, 0, thickness);

  BRepPrimAPI_MakePrism aPrismMaker(face, aVector);
  TopoDS_Shape aShape = aPrismMaker.Shape();
  std::cout << "Successfully created a TopoDS_Shape from the face."
            << std::endl;

  BRepAlgoAPI_Check check(aShape);
  if (!check.IsValid()) {
    std::cerr << "Error: Solid doesn't seem to be valid." << std::endl;
  }

  Shape *result = new Shape;
  result->shape = aShape;

  return result;
}

Shape *revolvePath(const PathSegment *segments, size_t size, Transform *trsf,
                   double rotation) {
  TopoDS_Wire wire = createWireFromPathSegments(segments, size);

  gp_Pnt origin = trsf->trsf.TranslationPart();
  gp_Dir dir = gp_Dir(0, 0, 1).Transformed(trsf->trsf);
  gp_Ax1 axis(origin, dir);

  TopoDS_Shape aShape = BRepPrimAPI_MakeRevol(wire, axis, 2.0 * M_PI);

  std::cout << "Successfully created a TopoDS_Shape from revolving the face."
            << std::endl;

  BRepAlgoAPI_Check check(aShape);

  if (!check.IsValid()) {
    std::cerr << "Error: Solid doesn't seem to be valid." << std::endl;
  }

  Shape *result = new Shape;
  result->shape = aShape;

  return result;
}

Shape *sweepPathAlong3DPath(const PathSegment *segments, size_t directrixSize,
                            size_t size) {
  TopoDS_Wire wire = createWireFromPathSegments(segments, directrixSize);

  TopoDS_Face flatFace =
      makeFaceFromSegments(segments + directrixSize, size - directrixSize);

  gp_Dir tangent = getWireStartTangent(wire);

  gp_Ax3 to(gp_Pnt(0,0,0), gp_Dir(0,0,1));
  gp_Ax3 from(gp_Pnt(0,0,0), tangent, gp_Dir(0, 0, 1));

  gp_Trsf trsf;
  trsf.SetTransformation(from, to);
  BRepBuilderAPI_Transform trsfBuilder(flatFace, trsf);
  TopoDS_Face face = TopoDS::Face(trsfBuilder.Shape());

  if (!face.IsNull()) {
    std::cout << "Successfully created TopoDS_Face from the wire." << std::endl;
  }

  BRepOffsetAPI_MakePipe pipeMaker(wire, face);
  TopoDS_Shape aShape = pipeMaker.Shape();

  std::cout << "Successfully created a TopoDS_Shape from sweeping."
            << std::endl;

  BRepAlgoAPI_Check check(aShape);
  if (!check.IsValid()) {
    std::cerr << "Error: Solid doesn't seem to be valid." << std::endl;
  }

  Shape *result = new Shape;
  result->shape = aShape;

  return result;
}

void freeShape(Shape *shape) { delete shape; }

Shape *applyShapeLocationTransform(Shape *shape, Transform *trsf) {
  if (!shape || !trsf)
    return shape;

  TopoDS_Shape s = shape->shape;
  TopLoc_Location loc(trsf->trsf);

  Shape *result = new Shape;
  result->shape = s.Located(loc);

  return result;
}

Shape *fuseShapes(Shape *shape1, Shape *shape2) {
  if (!shape1 || !shape2) {
    std::cout << "couldn't fuse shapes as one of the arguments is null"
              << std::endl;
    return shape1;
  }

  TopoDS_Shape s1 = shape1->shape;
  TopoDS_Shape s2 = shape2->shape;

  Shape *result = new Shape;
  result->shape = BRepAlgoAPI_Fuse(s1, s2);

  return result;
}

Shape *cutShape(Shape *toCut, Shape *cutout) {
  if (!toCut || !cutout) {
    std::cout << "couldn't cut shapes as one of the arguments is null"
              << std::endl;
    return toCut;
  }

  TopoDS_Shape s1 = toCut->shape;
  TopoDS_Shape s2 = cutout->shape;

  Shape *result = new Shape;
  result->shape = BRepAlgoAPI_Cut(s1, s2);

  return result;
}

int writeToOBJ(Shape *shape, char *buffer) {
  const auto out_length = writeSolidToObj(shape->shape, buffer);
  return out_length;
}

void saveToSTEP(Compound *cmp, const char *filepath) {
  TopoDS_Compound compound = cmp->compound;

  STEPControl_Writer writer;

  Interface_Static::SetCVal("write.precision.val", "0.001");
  Interface_Static::SetCVal("write.step.unit", "MM");

  IFSelect_ReturnStatus status = writer.Transfer(compound, STEPControl_AsIs);
  if (status != IFSelect_RetDone) {
    std::cerr << "Error: Failed to transfer compound to STEP writer"
              << std::endl;
    return;
  }

  status = writer.Write(filepath);
  if (status != IFSelect_RetDone) {
    std::cerr << "Error: Failed to write STEP file" << std::endl;
    return;
  }
}

Compound *makeCompound() { return new Compound; }
void freeCompound(Compound *cmp) { delete cmp; }

Transform *makeTransform(const double m[16]) {
  Transform *t = new Transform;
  gp_Trsf &trsf = t->trsf;

  trsf.SetValues(m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6],
                 m[10], m[14]);
  return t;
}

void freeTransform(Transform *trsf) { delete trsf; }

void addShapeToCompound(Compound *cmp, Shape *shape, Transform *trsf) {
  if (!cmp || !shape)
    return;
  TopoDS_Shape s = shape->shape;
  if (trsf) {
    TopLoc_Location loc(trsf->trsf);
    s = s.Located(loc);
  }
  cmp->builder.Add(cmp->compound, s);
}
}
