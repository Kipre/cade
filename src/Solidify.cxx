#include <iostream>
#include <sstream>
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

#include <BRepMesh_IncrementalMesh.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <Poly_Triangulation.hxx>

#include <BRepPrimAPI_MakePrism.hxx>
#include <Interface_Static.hxx>
#include <STEPControl_Writer.hxx>
// #include <STEPCAFControl_Writer.hxx>
// #include <TDocStd_Document.hxx>
// #include <XCAFApp_Application.hxx>
// #include <XCAFDoc_ShapeTool.hxx>

#include <IMeshTools_MeshBuilder.hxx>
#include <IMeshTools_Context.hxx>
#include <IMeshTools_Parameters.hxx>

#include "Solidify.hxx"


#include <IMeshTools_MeshBuilder.hxx>
#include <IMeshTools_Context.hxx>
#include <IMeshTools_Parameters.hxx>
#include <Message_Algorithm.hxx>
#include <Message_Messenger.hxx>
#include <Message_MsgFile.hxx>
#include <TopoDS_Shape.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS.hxx>
#include <BRep_Tool.hxx>
#include <Poly_Triangulation.hxx>
#include <iostream>

class MeshDiagnostics {
public:
    static bool checkAndMeshShape(const TopoDS_Shape& shape, double deflection = 0.1) {
        // Pre-mesh diagnostics
        std::cout << "=== PRE-MESH DIAGNOSTICS ===" << std::endl;
        if (!performPreMeshChecks(shape)) {
            return false;
        }

        // Create meshing parameters
        // IMeshTools_Parameters meshParams;
        // meshParams.Deflection = deflection;
        // meshParams.Angle = 0.5;  // Angular deflection in radians
        // meshParams.Relative = Standard_False;
        // meshParams.InParallel = Standard_True;
        // meshParams.MinSize = deflection * 0.1;
        // meshParams.InternalVerticesMode = Standard_True;
        // meshParams.ControlSurfaceDeflection = Standard_True;

        // Create context with custom messenger for detailed logging
        Handle(IMeshTools_Context) context = new IMeshTools_Context();
        context->SetShape(shape);

        IMeshTools_Parameters& meshParams = context->ChangeParameters();
        meshParams.Deflection = deflection;
        meshParams.Angle = 0.5;  // Angular deflection in radians
        meshParams.Relative = Standard_False;
        meshParams.InParallel = Standard_True;
        meshParams.MinSize = deflection * 0.1;
        meshParams.InternalVerticesMode = Standard_True;
        meshParams.ControlSurfaceDeflection = Standard_True;

        if (!isContextValid(context)) {
            std::cerr << "ERROR: Context validation failed!" << std::endl;
            return false;
        }


        // Create builder
        Handle(IMeshTools_MeshBuilder) builder = new IMeshTools_MeshBuilder(context);
        
        // Set up detailed logging
        Handle(Message_Messenger) messenger = new Message_Messenger();
        builder->SetMessenger(messenger);

        std::cout << "\n=== STARTING MESHING ===" << std::endl;
        std::cout << "Deflection: " << deflection << std::endl;
        std::cout << "Angular deflection: " << meshParams.Angle << std::endl;

        // Perform meshing with progress tracking
        Message_ProgressRange range;
        builder->Perform(range);

        // Check results
        std::cout << "\n=== MESH RESULTS ===" << std::endl;
        return analyzeMeshResults(builder, shape);
    }

private:
    static bool isContextValid(const Handle(IMeshTools_Context)& context) {
        std::cout << "Validating context..." << std::endl;
        
        if (context.IsNull()) {
            std::cerr << "  Context handle is null!" << std::endl;
            return false;
        }
        
        // Check if shape is set
        const TopoDS_Shape& contextShape = context->GetShape();
        if (contextShape.IsNull()) {
            std::cerr << "  Shape not set in context!" << std::endl;
            return false;
        }
        
        // Check parameters through const reference
        const IMeshTools_Parameters& params = context->GetParameters();
        if (params.Deflection <= 0.0) {
            std::cerr << "  Invalid deflection: " << params.Deflection << std::endl;
            return false;
        }
        
        if (params.Angle <= 0.0) {
            std::cerr << "  Invalid angle: " << params.Angle << std::endl;
            return false;
        }
        
        std::cout << "  Context is valid!" << std::endl;
        return true;
    }

    static bool performPreMeshChecks(const TopoDS_Shape& shape) {
        if (shape.IsNull()) {
            std::cerr << "ERROR: Shape is null!" << std::endl;
            return false;
        }

        // Check shape type
        std::cout << "Shape type: ";
        switch (shape.ShapeType()) {
            case TopAbs_COMPOUND: std::cout << "COMPOUND"; break;
            case TopAbs_COMPSOLID: std::cout << "COMPSOLID"; break;
            case TopAbs_SOLID: std::cout << "SOLID"; break;
            case TopAbs_SHAPE: std::cout << "SHAPE"; break;
            case TopAbs_SHELL: std::cout << "SHELL"; break;
            case TopAbs_FACE: std::cout << "FACE"; break;
            case TopAbs_WIRE: std::cout << "WIRE"; break;
            case TopAbs_EDGE: std::cout << "EDGE"; break;
            case TopAbs_VERTEX: std::cout << "VERTEX"; break;
        }
        std::cout << std::endl;

        // Count sub-shapes
        int faceCount = 0, edgeCount = 0, vertexCount = 0;
        
        TopExp_Explorer faceExp(shape, TopAbs_FACE);
        for (; faceExp.More(); faceExp.Next()) faceCount++;
        
        TopExp_Explorer edgeExp(shape, TopAbs_EDGE);
        for (; edgeExp.More(); edgeExp.Next()) edgeCount++;
        
        TopExp_Explorer vertexExp(shape, TopAbs_VERTEX);
        for (; vertexExp.More(); vertexExp.Next()) vertexCount++;

        std::cout << "Faces: " << faceCount << ", Edges: " << edgeCount << ", Vertices: " << vertexCount << std::endl;

        if (faceCount == 0) {
            std::cout << "WARNING: No faces to mesh!" << std::endl;
            return false;
        }

        // Check for degenerate faces
        int degenerateFaces = 0;
        // TopExp_Explorer faceChecker(shape, TopAbs_FACE);
        // for (; faceChecker.More(); faceChecker.Next()) {
        //     TopoDS_Face face = TopoDS::Face(faceChecker.Current());
        //     if (BRep_Tool::Degenerated(face)) {
        //         degenerateFaces++;
        //     }
        // }
        
        if (degenerateFaces > 0) {
            std::cout << "WARNING: Found " << degenerateFaces << " degenerate faces!" << std::endl;
        }

        return true;
    }

    static bool analyzeMeshResults(const Handle(IMeshTools_MeshBuilder)& builder, 
                                 const TopoDS_Shape& shape) {
        // Check execution status
        const Message_ExecStatus& status = builder->GetStatus();
        
        std::cout << "Mesh status: ";
        if (status.IsDone()) {
            std::cout << "SUCCESS" << std::endl;
        } else {
            std::cout << "FAILED" << std::endl;
            printDetailedStatus(status);
            return false;
        }

        // Check triangulation results
        return checkTriangulationQuality(shape);
    }

    static void printDetailedStatus(const Message_ExecStatus& status) {
        std::cout << "\nDetailed error analysis:" << std::endl;
        
        // Check specific error flags
        if (status.IsSet(Message_Fail1)) {
            std::cout << "ERROR: Invalid context" << std::endl;
        }
        if (status.IsSet(Message_Fail2)) {
            std::cout << "ERROR: Unexpected error during meshing" << std::endl;
        }
        if (status.IsSet(Message_Fail3)) {
            std::cout << "ERROR: Failed to discretize edges" << std::endl;
        }
        if (status.IsSet(Message_Fail4)) {
            std::cout << "ERROR: Can't heal discrete model" << std::endl;
        }
        if (status.IsSet(Message_Fail5)) {
            std::cout << "ERROR: Failed to pre-process model" << std::endl;
        }
        if (status.IsSet(Message_Fail6)) {
            std::cout << "ERROR: Failed to discretize faces" << std::endl;
        }
        if (status.IsSet(Message_Fail7)) {
            std::cout << "ERROR: Failed to post-process model" << std::endl;
        }
        if (status.IsSet(Message_Warn1)) {
            std::cout << "WARNING: Shape contains no objects to mesh" << std::endl;
        }
    }

    static bool checkTriangulationQuality(const TopoDS_Shape& shape) {
        int triangulatedFaces = 0;
        int totalFaces = 0;
        int totalTriangles = 0;
        int totalVertices = 0;

        TopExp_Explorer faceExp(shape, TopAbs_FACE);
        for (; faceExp.More(); faceExp.Next()) {
            totalFaces++;
            TopoDS_Face face = TopoDS::Face(faceExp.Current());
            TopLoc_Location location;
            
            Handle(Poly_Triangulation) triangulation = BRep_Tool::Triangulation(face, location);
            if (!triangulation.IsNull()) {
                triangulatedFaces++;
                totalTriangles += triangulation->NbTriangles();
                totalVertices += triangulation->NbNodes();
            }
        }

        std::cout << "\nTriangulation results:" << std::endl;
        std::cout << "Triangulated faces: " << triangulatedFaces << "/" << totalFaces << std::endl;
        std::cout << "Total triangles: " << totalTriangles << std::endl;
        std::cout << "Total vertices: " << totalVertices << std::endl;

        if (triangulatedFaces == 0) {
            std::cout << "ERROR: No faces were triangulated!" << std::endl;
            return false;
        }

        if (triangulatedFaces < totalFaces) {
            std::cout << "WARNING: Not all faces were triangulated!" << std::endl;
            std::cout << "Missing: " << (totalFaces - triangulatedFaces) << " faces" << std::endl;
        }

        return triangulatedFaces > 0;
    }
};

// Alternative method for BRepMesh_IncrementalMesh
class LegacyMeshDiagnostics {
public:
    static bool checkBRepMesh(const TopoDS_Shape& shape, double deflection = 0.1) {
        std::cout << "=== USING BRepMesh_IncrementalMesh ===" << std::endl;
        
        try {
            BRepMesh_IncrementalMesh mesh(shape, deflection);
            
            std::cout << "Mesh creation: ";
            if (mesh.IsDone()) {
                std::cout << "SUCCESS" << std::endl;
                return true;
                // return MeshDiagnostics::checkTriangulationQuality(shape);
            } else {
                std::cout << "FAILED" << std::endl;
                std::cout << "BRepMesh_IncrementalMesh::IsDone() returned false" << std::endl;
                std::cout << "Possible causes:" << std::endl;
                std::cout << "- Shape is invalid or degenerate" << std::endl;
                std::cout << "- Deflection too small/large" << std::endl;
                std::cout << "- Memory issues" << std::endl;
                std::cout << "- Complex geometry that can't be meshed" << std::endl;
                return false;
            }
        } catch (const Standard_Failure& e) {
            std::cout << "EXCEPTION during meshing: " << e.GetMessageString() << std::endl;
            return false;
        }
    }
};

/**
 * @brief Meshes a given solid shape and writes the mesh data to an OBJ file.
 * @param aShape The solid shape to be meshed.
 * @param filename The name of the OBJ file to write to.
 */
int writeSolidToObj(const TopoDS_Shape& aShape, char * buffer) {
    std::ostringstream oss;

    if (aShape.IsNull()) {
        std::cerr << "Error: Cannot write a null shape to OBJ." << std::endl;
        return -1;
    }

    // Use a sensible deflection value (e.g., 0.1) for a good balance of detail and file size.
    BRepMesh_IncrementalMesh aMesh(aShape, 1, false, 0.5);


    // Create context
    // Handle(IMeshTools_Context) context = new IMeshTools_Context();
    //
    // IMeshTools_Parameters * meshParams = &context->ChangeParameters();
    // meshParams->Deflection = 0.1;
    // meshParams->Angle = 0.5;  // Angular deflection
    // meshParams->Relative = Standard_False;
    //
    // // Create and configure builder
    // Handle(IMeshTools_MeshBuilder) builder = new IMeshTools_MeshBuilder(context);
    //
    // // Set the shape to mesh
    // context->SetShape(aShape);
    //
    // // Perform meshing
    // Message_ProgressRange range;
    // builder->Perform(range);
    //
    // // Check status
    // if (!builder->GetStatus().IsDone()) {
    //     std::cerr << "Error: Failed to create mesh." << std::endl;
    //     return -1;
    // }

    // if (!MeshDiagnostics::checkAndMeshShape(aShape, 0.1)) {
    //     std::cout << "Modern meshing failed, trying legacy method..." << std::endl;
    //
    //     // Method 2: Fallback to legacy BRepMesh
    //     LegacyMeshDiagnostics::checkBRepMesh(aShape, 0.1);
    // }

    oss << "# Open CASCADE Technology generated OBJ file" << std::endl;
    oss << "g occt_solid" << std::endl;

    // Keep track of the vertex index count as OBJ face indices are 1-based.
    int vertexCount = 1;
    TopExp_Explorer anExpFace(aShape, TopAbs_FACE);
    for (; anExpFace.More(); anExpFace.Next()) {
        const TopoDS_Face& aFace = TopoDS::Face(anExpFace.Current());
        TopLoc_Location aLocation;
        Handle(Poly_Triangulation) aTriangulation = BRep_Tool::Triangulation(aFace, aLocation);

        if (!aTriangulation.IsNull()) {
            // const TColgp_Array1OfPnt& nodes = aTriangulation->Nodes();
            // for (int i = nodes.Lower(); i <= nodes.Upper(); ++i) {
            const auto nb_nodes = aTriangulation->NbNodes();
            for (int i = 1; i <= nb_nodes; ++i) {
                const gp_Pnt& node = aTriangulation->Node(i);
                oss << "v " << node.X() << " " << node.Y() << " " << node.Z() << std::endl;
            }
        }
    }

    // This loop is separate to ensure all vertices are defined before the faces.
    int currentVertexOffset = 1;
    anExpFace.Init(aShape, TopAbs_FACE);
    for (; anExpFace.More(); anExpFace.Next()) {
        const TopoDS_Face& aFace = TopoDS::Face(anExpFace.Current());
        TopLoc_Location aLocation;
        Handle(Poly_Triangulation) aTriangulation = BRep_Tool::Triangulation(aFace, aLocation);

        if (!aTriangulation.IsNull()) {
            // const Poly_Array1OfTriangle& triangles = aTriangulation->Triangle();
            const auto nb_triangles = aTriangulation->NbTriangles();
            for (int i = 1; i <= nb_triangles; ++i) {
                Poly_Triangle tri = aTriangulation->Triangle(i);
                Standard_Integer n1, n2, n3;
                tri.Get(n1, n2, n3);
                // OBJ face indices are 1-based and relative to the start of the file.
                // We add the offset from previous faces to get the correct global index.
                oss << "f " << (n1 + currentVertexOffset - 1) << " " << (n2 + currentVertexOffset - 1) << " " << (n3 + currentVertexOffset - 1) << std::endl;
            }
            currentVertexOffset += aTriangulation->NbNodes();
        }
    }

    std::string str = oss.str();
    const auto length = str.size();

    // if (length > sizeof(buffer)){
    //     std::cerr << "Error: not enough space in output buffer " << length << " vs " << sizeof(buffer)<< std::endl;
    //     return -1;
    // }

    std::strncpy(buffer, str.c_str(), length);
    // buffer[length - 1] = '\0';  // Ensure null termination

    std::cout << "Successfully wrote mesh buffer " << std::endl;
    return length;
}

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
    const char* tempFileName = "C:/Users/kipr/Downloads/test.stp";
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
    gp_Dir nz3(0, 0, -1);


    bool firstMove = true;

    for (size_t i = 0; i < size; i++) {
      const auto segment = segments[i];
      // std::cout << "segment: " << segment.command << " at index " << i << std::endl;

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
                edge = BRepBuilderAPI_MakeEdge(promote(lastPoint), promote(currentPoint));
                break;
            }
            case 'A': // Arc
            {
              const gp_Pnt2d center = getCircleCenter(lastPoint, currentPoint, segment.radius, segment.sweep);
                
                Handle(Geom_TrimmedCurve) arc = GC_MakeArcOfCircle(
                    (new GC_MakeCircle(promote(center), segment.sweep ? z3 : nz3, segment.radius))->Value()->Circ(), 
                    promote(lastPoint), 
                    promote(currentPoint),
                    true
                );

                edge = BRepBuilderAPI_MakeEdge(arc);
                break;
            }
            case 'Z': // Closepath
            case 'z':
            {
                // If the last point is not the start point, create a line segment to close the path
                if (!lastPoint.IsEqual(startPoint, Precision::Confusion())) {
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

extern "C" int pathToSolid(const PathSegment* segments, size_t size, char* output_buffer) {
    // segments is a long list of one outer and several inner paths
    // std::cout << "Parsing SVG Path" << std::endl;
    // std::cout << "Size " << size <<  std::endl;

    std::vector<TopoDS_Wire> wires = {};

    size_t lastEnd = 0;

    while (lastEnd < size) {
      size_t currentSize = 0;
      while (segments[lastEnd + currentSize].command != 'Z') currentSize++;

      // std::cout << "extracting wire from: " << lastEnd << " plus " << currentSize << std::endl;

      TopoDS_Wire wire = createWireFromPathSegments(segments + lastEnd, ++currentSize);

      if (wire.IsNull()) {
          std::cerr << "\nFailed to create OpenCASCADE TopoDS_Wire." << std::endl;
          return 1;
      }

      wires.push_back(wire);
      lastEnd += currentSize;
    }

    std::cout << "\nSuccessfully created OpenCASCADE TopoDS_Wire." << std::endl;

    // You can now use this 'wire' object for further OpenCASCADE operations,
    // such as creating a face, performing boolean operations, or exporting to a file.

    // Example: Create a face from the wire (if it's closed)
    BRepBuilderAPI_MakeFace makeFace(wires[0]);
    if (!makeFace.IsDone()) {
        std::cerr << "Warning: Could not create a face from the wire. It might not be closed or planar." << std::endl;
    }

    // for (int wire : wires | std::views::drop(1)) {
    wires.erase(wires.begin());
    for (TopoDS_Wire wire : wires) {
      makeFace.Add(wire);
    }

    // Further operations with 'face'
    TopoDS_Face face = makeFace.Face();
    std::cout << "Successfully created OpenCASCADE TopoDS_Face from the wire." << std::endl;

    gp_Vec aVector(0, 0, 15);

    BRepPrimAPI_MakePrism aPrismMaker(makeFace, aVector);
    TopoDS_Shape aSolid = aPrismMaker.Shape();
    // TopoDS_Compound aRes;
    // BRep_Builder aBuilder;
    // aBuilder.MakeCompound (aRes);
    // aBuilder.Add (aRes, aSolid);


    const auto out_length = writeSolidToObj(aSolid, output_buffer);

    // std::string stepContent;
    // if (WriteCompoundToSTEPString2(aRes, stepContent)) {
    //     // Output to stdout (stdin in your terminology, but I assume you mean stdout)
    //     // std::cout << stepContent << std::endl;
    // } else {
    //     std::cerr << "Failed to convert compound to STEP format" << std::endl;
    //     // return 1;
    // }


    return out_length;
}
