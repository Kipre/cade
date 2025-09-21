export const vertexShader = `

struct VSOut {
  @builtin(position) Position: vec4f,
  @location(0) fragmentPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) @interpolate(flat) instance_idx: u32,
};

struct Uniforms {
  mvp: mat4x4f,
  model: mat4x4f,
  view: mat4x4f,
  cameraPosition: vec3f,
  lightPosition: vec3f,
  lightColor: vec3f,
}

@group(0) @binding(0) var<uniform> uni: Uniforms;
@group(1) @binding(0) var<storage, read> instances : array<mat4x4<f32>>;

@vertex
fn main(
  @location(0) inPosition: vec3f,
  @location(1) inNormal: vec3f,
  @builtin(instance_index) idx : u32
) -> VSOut {
    var vsOut: VSOut;
    let transformed = instances[idx] * vec4f(inPosition, 1);
    vsOut.Position = uni.mvp * transformed;
    vsOut.fragmentPosition = inPosition;
    vsOut.normal = normalize(uni.view * instances[idx] * vec4f(inNormal, 0)).xyz;
    vsOut.instance_idx = idx;
    return vsOut;
}
`;

export const lineVertexShader = `
struct VSOut {
  @builtin(position) Position: vec4f,
};

struct Uniforms {
  mvp: mat4x4f,
  model: mat4x4f,
  view: mat4x4f,
  cameraPosition: vec3f,
  lightPosition: vec3f,
  lightColor: vec3f,
}

@group(0) @binding(0) var<uniform> uni: Uniforms;
@group(1) @binding(0) var<storage, read> instances : array<mat4x4<f32>>;

@vertex
fn main(
  @location(0) inPosition: vec3f,
  @builtin(instance_index) idx : u32
) -> VSOut {
    var vsOut: VSOut;
    let transformed = instances[idx] * vec4f(inPosition, 1);
    vsOut.Position = uni.mvp * transformed;
    return vsOut;
}
`;

export const fragmentShader = `
struct Uniforms {
  mvp: mat4x4f,
  model: mat4x4f,
  view: mat4x4f,
  cameraPosition: vec3f,
  lightPosition: vec3f,
  lightColor: vec3f,
  selected_gidx: u32,
  selected_iidx: u32,
}

struct GeometryMetadata {
  geometry_idx: u32,
  _pad: array<u32, 3>,
  colors: array<f32, 12>,
}

@group(0) @binding(0) var<uniform> uni: Uniforms;
@group(1) @binding(0) var<storage, read> instances : array<mat4x4<f32>>;
@group(1) @binding(1) var<storage, read> metadata : GeometryMetadata;

@fragment
fn main(
  @location(0) fragmentPosition: vec3f,
  @location(1) normal: vec3f,
  @location(2) @interpolate(flat) instance_idx: u32,
) -> @location(0) vec4f {
    let geom_idx = metadata.geometry_idx;


    let col = metadata.colors;
    var uBaseColor = vec3f(col[9], col[10], col[11]);

    if (fragmentPosition.z < col[0]) {
        uBaseColor = vec3f(col[1], col[2], col[3]);
    } else if (fragmentPosition.z < col[4]) {
        uBaseColor = vec3f(col[5], col[6], col[7]);
    }

    if (uni.selected_gidx == geom_idx && uni.selected_iidx == instance_idx) {
        uBaseColor = vec3f(0, 0, 1);
    }

    // Normalize inputs
    let N = normalize(normal);
    let L = normalize(vec3<f32>(0.0, 0.0, 1.0));

    let diffuse = sqrt(abs(dot(N, L)));
    let ambient = 0.2;
    let intensity = diffuse * 0.8 + ambient;
    let shadedColor = uBaseColor * intensity;

    // Optional: emphasize edges by reducing intensity at grazing angles
    // (for silhouette enhancement, useful in CAD-like views)
    // let edgeFactor = pow(1.0 - abs(dot(N, vec3<f32>(0.0, 0.0, 1.0))), 2.0);
    // let finalColor = mix(shadedColor, shadedColor * 0.5, edgeFactor * 0.5);

    return vec4<f32>(shadedColor, 1.0);
}
`;

export const lineFragmentShader = `
@fragment
fn main() -> @location(0) vec4<f32> {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0); // black lines
}
`;

export const pickingFragmentShader = `
struct GeometryMetadata {
  geometry_idx: u32,
  _pad: array<u32, 3>,
  colors: array<f32, 12>,
}

@group(1) @binding(1) var<storage, read> metadata : GeometryMetadata;

@fragment
fn main(
  @builtin(position) pos: vec4<f32>,
  @location(2) @interpolate(flat) instance_idx: u32,
) -> @location(0) vec4<f32> {
    let geom_idx = metadata.geometry_idx;

    // Encode into RGBA [0,1]
    // let r = f32((id >> 16) & 255u) / 255.0;
    // let g = f32((id >> 8) & 255u) / 255.0;
    // let b = f32(id & 255u) / 255.0;
    let r = f32(geom_idx) / 255.0;
    let g = f32(instance_idx) / 255.0;
    return vec4<f32>(r, g, 1, 0);
}
`;
