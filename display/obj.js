import { vec3, vec2 } from "wgpu-matrix";

export function parseObjFile(objFileContents) {
  const vertices = [];
  const uvs = [];
  const normals = [];
  const faces = [];

  const lines = objFileContents.split("\n");
  for (const line of lines) {
    const t = line.trim().split(/\s+/);
    if (t[0] === "v") {
      vertices.push(
        vec3.create(
          Number.parseFloat(t[1]),
          Number.parseFloat(t[2]),
          Number.parseFloat(t[3]),
        ),
      );
    } else if (t[0] === "vt") {
      uvs.push(vec2.create(Number.parseFloat(t[1]), Number.parseFloat(t[2])));
    } else if (t[0] === "vn") {
      normals.push(
        vec3.create(
          Number.parseFloat(t[1]),
          Number.parseFloat(t[2]),
          Number.parseFloat(t[3]),
        ),
      );
    } else if (t[0] === "f") {
      const face = [];
      for (let i = 1; i < t.length; i++) {
        const v = t[i].split("/");
        const vertexIndex = Number.parseInt(v[0]) - 1;
        const uvIndex = Number.parseInt(v[1]) - 1;
        const normalIndex = Number.parseInt(v[2]) - 1;
        face.push({ vertexIndex, uvIndex, normalIndex });
      }
      faces.push({ vertices: face });
    }
  }

  return { vertices, uvs, normals, faces };
}
