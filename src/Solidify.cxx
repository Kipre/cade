#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <iomanip>
#include <cmath>
#include <limits> // For numeric_limits

// OpenCASCADE Headers
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>
#include <gp_Dir.hxx>
#include <gp_Lin.hxx>
#include <gp_Circ.hxx>
#include <Geom_TrimmedCurve.hxx>
#include <Geom_Line.hxx>
#include <Geom_BezierCurve.hxx>
#include <BRepBuilderAPI_MakeEdge.hxx>
#include <BRepBuilderAPI_MakeWire.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>

#include <TopoDS_Wire.hxx>
#include <TopoDS_Edge.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS_Shape.hxx>
#include <TopoDS_Compound.hxx>

#include <Standard_Real.hxx> 

#include <GC_MakeCircle.hxx>
#include <GC_MakeArcOfCircle.hxx>



#include <BRepPrimAPI_MakePrism.hxx>
#include <Interface_Static.hxx>
#include <STEPControl_Writer.hxx>
// #include <STEPCAFControl_Writer.hxx>
// #include <TDocStd_Document.hxx>
// #include <XCAFApp_Application.hxx>
// #include <XCAFDoc_ShapeTool.hxx>

struct PathSegment {
    char command;
    float x;
    float y;
    float radius;
    char sweep;
};

bool WriteCompoundToSTEPString2(const TopoDS_Compound& compound, std::string& stepString) {
    // Create STEP writer
    STEPControl_Writer writer;
    
    // Set precision and units (optional)
    Interface_Static::SetCVal("write.precision.val", "0.001");
    Interface_Static::SetCVal("write.step.unit", "MM");
    
    // Transfer the compound to the writer
    IFSelect_ReturnStatus status = writer.Transfer(compound, STEPControl_AsIs);
    if (status != IFSelect_RetDone) {
        std::cerr << "Error: Failed to transfer compound to STEP writer" << std::endl;
        return false;
    }
    
    // Write to a temporary file first (OpenCascade doesn't directly support string output)
    const char* tempFileName = "/tmp/temp_step_output.stp";
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
    std::remove(tempFileName);
    
    return true;
}

gp_Pnt2d getCircleCenter(
    const gp_Pnt2d& startPoint,
    const gp_Pnt2d& endPoint,
    double radius,
    int sweepFlag) {

    double d = startPoint.Distance(endPoint);

    // Handle invalid input conditions
    if (d > 2 * radius || radius <= 0) {
        std::cerr << "Error: Invalid radius. Radius must be positive and at least half the distance between points." << std::endl;
        return gp_Pnt2d();
    }

    gp_Pnt2d midpoint((startPoint.X() + endPoint.X()) / 2.0, (startPoint.Y() + endPoint.Y()) / 2.0);

    double distanceToCenter = sqrt(radius * radius - (d / 2.0) * (d / 2.0));

    gp_Vec2d startEndVec(startPoint, endPoint);
    gp_Vec2d perpendicularVec(-startEndVec.Y(), startEndVec.X());
    perpendicularVec.Normalize();

    gp_Pnt2d center = midpoint.Translated(perpendicularVec.Multiplied(((sweepFlag == 1) ? 1 : -1) * distanceToCenter));

    return center;
}

gp_Pnt promote(gp_Pnt2d p) {
  return gp_Pnt(p.X(), p.Y(), 0.0); 
}

/**
 * @brief Creates an OpenCASCADE TopoDS_Wire from parsed SVG path segments.
 * This function assumes a 2D path in the XY plane.
 * @param segments A vector of parsed SvgPathSegment objects.
 * @return An OpenCASCADE TopoDS_Wire object. Returns a null wire if an error occurs.
 */
TopoDS_Wire createWireFromPathSegments(const PathSegment* segments, size_t size) {
    BRepBuilderAPI_MakeWire makeWire;
    gp_Pnt2d lastPoint; // Track the last point for segment continuity
    gp_Pnt2d startPoint; // Track the start point of the current subpath for 'Z'
    gp_Dir z3(0, 0, 1);

    bool firstMove = true;

    for (size_t i = 0; i < size; i++) {
      const auto segment = segments[i];

        TopoDS_Edge edge;
        gp_Pnt2d currentPoint(segment.x, segment.y);

        switch (segment.command) {
            case 'M': // Moveto
            {
                if (firstMove) {
                    startPoint = currentPoint; // Set start point for the first subpath
                    firstMove = false;
                }
                break;
            }
            case 'L': // Lineto
            {
                // Handle(Geom_Line) geomLine = new Geom_Line(lastPoint, currentPoint);
                // edge = BRepBuilderAPI_MakeEdge(geomLine);
                edge = BRepBuilderAPI_MakeEdge(promote(lastPoint), promote(currentPoint));
                break;
            }
            case 'A': // Arc
            {
              const gp_Pnt2d center = getCircleCenter(lastPoint, currentPoint, segment.radius, segment.sweep);
                
                Handle(Geom_TrimmedCurve) arc = GC_MakeArcOfCircle(
                    (new GC_MakeCircle(promote(center), z3, segment.radius))->Value()->Circ(), 
                    promote(lastPoint), 
                    promote(currentPoint),
                    segment.sweep == 1
                );

                edge = BRepBuilderAPI_MakeEdge(arc);
                break;
            }
            case 'Z': // Closepath
            case 'z':
            {
                // If the last point is not the start point, create a line segment to close the path
                if (!lastPoint.IsEqual(startPoint, Precision::Confusion())) {
                    // Handle(Geom_Line) geomLine = new Geom_Line(lastPoint, startPoint);
                    // edge = BRepBuilderAPI_MakeEdge(geomLine);
                edge = BRepBuilderAPI_MakeEdge(promote(startPoint), promote(lastPoint));
                }
                break;
            }
            default:
                std::cerr << "Warning: Unhandled command '" << segment.command << "' for wire creation." << std::endl;
                continue; // Skip this segment
        }
        lastPoint = currentPoint;

        if (!edge.IsNull()) {
            makeWire.Add(edge);
        }
    }

    if (makeWire.IsDone()) {
        return makeWire.Wire();
    } else {
        std::cerr << "Error: Failed to create TopoDS_Wire. Reason: " << makeWire.Error() << std::endl;
        return TopoDS_Wire(); // Return a null wire
    }
}

extern "C" int pathToSolid(void) {
    std::cout << "Parsing SVG Path" << std::endl;

    PathSegment segments[] = {
        {'M', 10, 10, 0, 0},
        {'L', 100, 10, 0, 0},
        {'L', 100, 100, 0, 0},
        {'A', 10, 100, 50, 0},
        {'Z', 0, 0, 0, 0},
    };

    TopoDS_Wire wire = createWireFromPathSegments(segments, 5);

    if (wire.IsNull()) {
        std::cerr << "\nFailed to create OpenCASCADE TopoDS_Wire." << std::endl;
        return 1;
    }

    std::cout << "\nSuccessfully created OpenCASCADE TopoDS_Wire." << std::endl;

    // You can now use this 'wire' object for further OpenCASCADE operations,
    // such as creating a face, performing boolean operations, or exporting to a file.

    // Example: Create a face from the wire (if it's closed)
    BRepBuilderAPI_MakeFace makeFace(wire);
    if (makeFace.IsDone()) {
        TopoDS_Face face = makeFace.Face();
        std::cout << "Successfully created OpenCASCADE TopoDS_Face from the wire." << std::endl;
        // Further operations with 'face'
    } else {
        std::cerr << "Warning: Could not create a face from the wire. It might not be closed or planar." << std::endl;
    }
    gp_Vec aVector(0, 0, 15);

BRepPrimAPI_MakePrism aPrismMaker(makeFace, aVector);
TopoDS_Shape aSolid = aPrismMaker.Shape();
  TopoDS_Compound aRes;
  BRep_Builder aBuilder;
  aBuilder.MakeCompound (aRes);
  aBuilder.Add (aRes, aSolid);

  std::string stepContent;
  if (WriteCompoundToSTEPString2(aRes, stepContent)) {
      // Output to stdout (stdin in your terminology, but I assume you mean stdout)
      std::cout << stepContent << std::endl;
  } else {
      std::cerr << "Failed to convert compound to STEP format" << std::endl;
      // return 1;
  }


    return 0;
}
