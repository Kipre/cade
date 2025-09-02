export const vertexShader =  `
struct VSOut {
  @builtin(position) Position: vec4f,
  @location(0) fragmentPosition: vec3f,
  @location(1) normal: vec3f,
};

struct Uniforms {
  mvp: mat4x4f,
  model: mat4x4f,
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
    vsOut.fragmentPosition = (uni.model * transformed).xyz;
    vsOut.normal = inNormal;
    return vsOut;
}
`

export const fragmentShader =  `
struct Uniforms {
  mvp: mat4x4f,
  model: mat4x4f,
  cameraPosition: vec3f,
  lightPosition: vec3f,
  lightColor: vec3f,
}

@group(0) @binding(0) var<uniform> uni: Uniforms;
@group(1) @binding(0) var<storage, read> instances : array<mat4x4<f32>>;

@fragment
fn main(
  @location(0) fragmentPosition: vec3f,
  @location(1) normal: vec3f,
) -> @location(0) vec4f {
  let ambientStrength = 0.1;
  let ambient = uni.lightColor * ambientStrength;

  let norm = normalize(normal);
  let lightDir = normalize(uni.lightPosition - fragmentPosition);
  let diff = max(dot(norm, lightDir), 0.0);
  let diffuse = uni.lightColor * diff;

  let specularStrength = 0.5;
  let viewDir = normalize(uni.cameraPosition - fragmentPosition);
  let reflectDir = reflect(-lightDir, norm);
  let spec = pow(max(dot(viewDir, reflectDir), 0.0), 32);
  let specular = specularStrength * spec * uni.lightColor;

  let objectColor = vec3f(1, 0.5, 0.31);
  let result = (ambient + diffuse + specular) * objectColor;

  return vec4f(result, 1);
}
`

