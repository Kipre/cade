// @ts-check

import { mat4, utils, vec3 } from "wgpu-matrix";
import { Material } from "../lib/materials.js";
import { BBox } from "../tools/svg.js";
import { OrthoCamera } from "./camera.js";
import { parseObjFile } from "./obj.js";
import {
  fragmentShader,
  lineFragmentShader,
  lineVertexShader,
  pickingFragmentShader,
  vertexShader,
} from "./shaders.js";
import { createBuffer, invariant } from "./utils.js";

const buf = new ArrayBuffer(4);
const f32 = new Float32Array(buf);
const u32 = new Uint32Array(buf);

function u32ToF32(u) {
  u32[0] = u;
  return f32[0];
}

let pickerTimeoutId;

let selectedGeometry = 256;
let selectedInstance = 256;

let context;
let canvas;
let entry;

function setup() {
  canvas = document.querySelector("canvas");
  if (canvas == null) throw new Error();

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
  context = canvas.getContext("webgpu");
  invariant(context, "WebGPU is not supported in this browser.");

  entry = navigator.gpu;
  invariant(entry, "WebGPU is not supported in this browser.");
}

/** @typedef {{item: {obj: string, material: Material}, instances: DOMMatrix[]}} ObjInstances */

/**
 * @param {BBox | null} bbox
 */
function parseObjAndRecomputeNormals(obj, bbox = null) {
  const buffer = [];
  for (const face of obj.faces) {
    let recomputedN;
    if (Number.isNaN(face.vertices[0].normalIndex)) {
      const [p0, p1, p2] = face.vertices.map(
        (x) => obj.vertices[x.vertexIndex],
      );
      const e1 = vec3.sub(p1, p0);
      const e2 = vec3.sub(p2, p0);
      recomputedN = vec3.normalize(vec3.cross(e2, e1));
    }

    for (const faceVertex of face.vertices) {
      const position = obj.vertices[faceVertex.vertexIndex];
      if (bbox) bbox.include(position);
      const normal = obj.normals[faceVertex.normalIndex] ?? recomputedN;
      buffer.push(...position, ...normal);
    }
  }

  return buffer;
}

function makeLineBuffer(obj) {
  const buffer = [];
  for (const line of obj.polylines) {
    for (let i = 1; i < line.length; i++) {
      buffer.push(...obj.vertices[line[i - 1]], ...obj.vertices[line[i]]);
    }
  }
  return buffer;
}

function makeOutlinePipeline(device, layout) {
  const vertModule = device.createShaderModule({ code: lineVertexShader });
  const fragModule = device.createShaderModule({ code: lineFragmentShader });

  // Shader Stages
  const vertex = {
    module: vertModule,
    entryPoint: "main",
    buffers: [
      {
        attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
        arrayStride: 3 * 4,
        stepMode: "vertex",
      },
    ],
  };

  const fragment = {
    module: fragModule,
    entryPoint: "main",
    targets: [{ format: "bgra8unorm" }],
  };

  return device.createRenderPipeline({
    vertex,
    fragment,
    layout,
    primitive: {
      topology: "line-list",
    },
    depthStencil: {
      depthWriteEnabled: false,
      depthCompare: "less-equal",
      format: "depth24plus-stencil8",
    },
  });
}

function makePickerPipeline(device, layout) {
  const vertModule = device.createShaderModule({ code: vertexShader });
  const fragModule = device.createShaderModule({ code: pickingFragmentShader });

  const vertex = {
    module: vertModule,
    entryPoint: "main",
    buffers: [
      {
        attributes: [
          // Position
          { shaderLocation: 0, offset: 0, format: "float32x3" },
          // Normal
          { shaderLocation: 1, offset: 12, format: "float32x3" },
        ],
        arrayStride: (3 + 3) * 4,
        stepMode: "vertex",
      },
    ],
  };

  const fragment = {
    label: "picker fragment module",
    module: fragModule,
    entryPoint: "main",
    targets: [{ format: "bgra8unorm" }],
  };

  return device.createRenderPipeline({
    label: "picker pipeline",
    vertex,
    fragment,
    layout,
    primitive: {
      frontFace: "cw",
      cullMode: "none",
      topology: "triangle-list",
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth24plus-stencil8",
    },
  });
}

function makeMainPipeline(device, layout) {
  const vertModule = device.createShaderModule({ code: vertexShader });
  const fragModule = device.createShaderModule({ code: fragmentShader });

  // Shader Stages
  const vertex = {
    module: vertModule,
    entryPoint: "main",
    buffers: [
      {
        attributes: [
          // Position
          { shaderLocation: 0, offset: 0, format: "float32x3" },
          // Normal
          { shaderLocation: 1, offset: 12, format: "float32x3" },
        ],
        arrayStride: (3 + 3) * 4,
        stepMode: "vertex",
      },
    ],
  };

  const fragment = {
    module: fragModule,
    entryPoint: "main",
    targets: [{ format: "bgra8unorm" }],
  };

  return device.createRenderPipeline({
    vertex,
    fragment,
    layout,
    primitive: {
      frontFace: "cw",
      cullMode: "none",
      topology: "triangle-list",
    },
    depthStencil: {
      depthWriteEnabled: true,
      depthBias: -1,
      depthCompare: "less",
      format: "depth24plus-stencil8",
    },
  });
}

// float32 -> 4 bytes * mat4 -> 16 floats
const instanceStride = 4 * 16;
const geometryMetaStride = 256; // 4 * 4 * NB_COLORS_PER_MATERIAL;

/**
 * @param {ObjInstances[]} items
 */
export async function displayScene(items) {
  setup();
  const adapter = await entry.requestAdapter();
  invariant(adapter, "No GPU found on this system.");

  const device = await adapter.requestDevice();
  const queue = device.queue;

  const bbox = new BBox();

  const geometryBuffers = [];
  const lineBuffers = [];
  const allInstances = [];
  let totalNbInstances = 0;
  const lengths = [0];
  const nbInstancesPerItem = [];

  const geometryMetaBufferArray = new Float32Array(
    (geometryMetaStride / 4) * items.length,
  );
  const uintMetaView = new Uint32Array(geometryMetaBufferArray.buffer);

  // we sort by the number of instances to make the instances buffer work
  const sortedItems = items.toSorted(
    (a, b) => a.instances.length - b.instances.length,
  );

  for (let i = 0; i < items.length; i++) {
    const { item, instances } = sortedItems[i];

    const obj = item.mesh;
    const objResult = parseObjFile(obj);
    const buffer = parseObjAndRecomputeNormals(objResult, bbox);
    const lineBuffer = makeLineBuffer(objResult);

    geometryBuffers.push(
      createBuffer(device, new Float32Array(buffer), GPUBufferUsage.VERTEX),
    );
    lineBuffers.push(
      createBuffer(device, new Float32Array(lineBuffer), GPUBufferUsage.VERTEX),
    );

    for (const mat of instances) allInstances.push(...mat.toFloat32Array());

    totalNbInstances += instances.length;
    nbInstancesPerItem.push(instances.length);
    const alignement = (totalNbInstances * instanceStride) % 256;
    if (alignement !== 0) {
      const requiredEmptyMatrixes = (256 - alignement) / instanceStride; // four for float
      allInstances.push(
        ...Array.from({ length: requiredEmptyMatrixes * 16 }, () => 0),
      );
      totalNbInstances += requiredEmptyMatrixes;
    }
    lengths.push(totalNbInstances);

    uintMetaView[(i * geometryMetaStride) / 4] = i;

    let j = 4;
    for (const number of item.material.colors) {
      geometryMetaBufferArray[(i * geometryMetaStride) / 4 + j] = number;
      j += 1;
    }
  }

  const maxNbInstances = Math.max(...nbInstancesPerItem);

  context.configure({
    device,
    format: "bgra8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    alphaMode: "opaque",
  });

  const uniformBuffer = device.createBuffer({
    size: 3 * 4 * 16 + 3 * 4 * 4 + 2 * 4 * 4, // 3 * mat4x4f + 3 * vec4f + 2*vec4f
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const instanceBuffer = device.createBuffer({
    label: "instance buffer",
    size: totalNbInstances * instanceStride,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const geometryMetaBuffer = device.createBuffer({
    label: "geom metadata buffer",
    size: geometryMetaStride * items.length,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
      },
    ],
  });

  const instanceBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "read-only-storage", hasDynamicOffset: true },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage", hasDynamicOffset: true },
      },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout, instanceBindGroupLayout],
  });

  const pipeline = makeMainPipeline(device, pipelineLayout);
  const linePipeline = makeOutlinePipeline(device, pipelineLayout);
  const pickerPipeline = makePickerPipeline(device, pipelineLayout);

  const bindGroup = device.createBindGroup({
    label: "uniform bind group",
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const instanceBindGroup = device.createBindGroup({
    label: "instanceBindGroup",
    layout: instanceBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: instanceBuffer,
          size: maxNbInstances * instanceStride,
        },
      },
      {
        binding: 1,
        resource: {
          buffer: geometryMetaBuffer,
          size: geometryMetaStride,
        },
      },
    ],
  });

  const pickingTexture = device.createTexture({
    size: [context.canvas.width, context.canvas.height],
    format: "bgra8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  const depthTexture = device.createTexture({
    size: [context.canvas.width, context.canvas.height],
    format: "depth24plus-stencil8",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const depthTextureView = depthTexture.createView();

  const objectSize = bbox.size();
  const center = vec3.create(...bbox.center());
  const camera = new OrthoCamera(
    utils.degToRad(-40),
    utils.degToRad(10),
    objectSize,
    center,
  );

  const lightPosition = vec3.mulScalar(vec3.create(1, 1, 1), objectSize);
  const lightColor = vec3.create(1, 1, 1);
  const instanceBufferArray = new Float32Array(allInstances);

  const readBuffer = device.createBuffer({
    size: 4, // RGBA8 = 4 bytes
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  async function pickObjectAt(x, y) {
    if (readBuffer.mapState !== "unmapped") {
      clearTimeout(pickerTimeoutId);
      pickerTimeoutId = setTimeout(() => pickObjectAt(x, y), 10);
      return;
    }

    // const pickingTexture = context.getCurrentTexture();
    const colorAttachment = {
      view: pickingTexture.createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: "clear",
      storeOp: "store",
    };

    const depthAttachment = {
      view: depthTextureView,
      depthClearValue: 1,
      depthLoadOp: "clear",
      depthStoreOp: "store",
      stencilClearValue: 0,
      stencilLoadOp: "clear",
      stencilStoreOp: "store",
    };
    const commandEncoder = device.createCommandEncoder({
      label: "picking command encoder",
    });

    // Encode drawing commands
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [colorAttachment],
      depthStencilAttachment: depthAttachment,
    });

    passEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
    passEncoder.setScissorRect(0, 0, canvas.width, canvas.height);
    passEncoder.setBindGroup(0, bindGroup);

    passEncoder.setPipeline(pickerPipeline);

    for (let i = 0; i < items.length; i++) {
      const nbInstances = nbInstancesPerItem[i];
      passEncoder.setBindGroup(1, instanceBindGroup, [
        lengths[i] * instanceStride,
        i * geometryMetaStride,
      ]);
      const buffer = geometryBuffers[i];
      passEncoder.setVertexBuffer(0, buffer);
      passEncoder.draw(buffer.size / (2 * 3 * 4), nbInstances);
    }

    passEncoder.end();

    queue.writeBuffer(instanceBuffer, 0, instanceBufferArray);
    queue.writeBuffer(geometryMetaBuffer, 0, geometryMetaBufferArray);

    const model = mat4.translation(vec3.create(0, 0, 0));
    const mvp = mat4.multiply(camera.getMVP(), model);
    const view = camera.getMVP();
    const cameraPosition = camera.getPosition();

    const bufferData = [
      ...mvp,
      ...model,
      ...view,
      ...cameraPosition,
      0,
      ...lightPosition,
      0,
      ...lightColor,
      0,
    ];
    const uniformArray = new Float32Array(bufferData);
    queue.writeBuffer(uniformBuffer, 0, uniformArray);

    // Copy 1 pixel
    commandEncoder.copyTextureToBuffer(
      { texture: pickingTexture, origin: { x, y } },
      { buffer: readBuffer, bytesPerRow: 256 }, // must be 256-byte aligned
      { width: 1, height: 1 },
    );

    await readBuffer.mapAsync(GPUMapMode.READ);
    const array = new Uint8Array(readBuffer.getMappedRange());
    const [r, g, b] = array;
    readBuffer.unmap();
    queue.submit([commandEncoder.finish()]);

    if (r !== 255) {
      selectedGeometry = 256;
      selectedInstance = 256;
    } else {
      selectedGeometry = b;
      selectedInstance = g;
    }
  }

  canvas.addEventListener("mousemove", (event) => {
    if (camera.isPanning || camera.isDragging || event.shiftKey) return;
    const x = event.clientX;
    const y = event.clientY;
    pickObjectAt(x, y);
  });

  function render() {
    const colorTexture = context.getCurrentTexture();
    const colorTextureView = colorTexture.createView();

    const colorAttachment = {
      view: colorTextureView,
      clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
      loadOp: "clear",
      storeOp: "store",
    };

    const depthAttachment = {
      view: depthTextureView,
      depthClearValue: 1,
      depthLoadOp: "clear",
      depthStoreOp: "store",
      stencilClearValue: 0,
      stencilLoadOp: "clear",
      stencilStoreOp: "store",
    };
    const commandEncoder = device.createCommandEncoder();

    // Encode drawing commands
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [colorAttachment],
      depthStencilAttachment: depthAttachment,
    });

    passEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
    passEncoder.setScissorRect(0, 0, canvas.width, canvas.height);
    passEncoder.setBindGroup(0, bindGroup);

    for (const [ppline, buffers] of [
      [pipeline, geometryBuffers],
      [linePipeline, lineBuffers],
    ]) {
      passEncoder.setPipeline(ppline);

      for (let i = 0; i < items.length; i++) {
        const nbInstances = nbInstancesPerItem[i];
        passEncoder.setBindGroup(1, instanceBindGroup, [
          lengths[i] * instanceStride,
          i * geometryMetaStride,
        ]);
        const buffer = buffers[i];
        passEncoder.setVertexBuffer(0, buffer);
        passEncoder.draw(buffer.size / (2 * 3 * 4), nbInstances);
      }
    }
    passEncoder.end();

    queue.writeBuffer(instanceBuffer, 0, instanceBufferArray);
    queue.writeBuffer(geometryMetaBuffer, 0, geometryMetaBufferArray);

    const model = mat4.translation(vec3.create(0, 0, 0));
    const mvp = mat4.multiply(camera.getMVP(), model);
    const view = camera.getMVP();
    const cameraPosition = camera.getPosition();

    const bufferData = [
      ...mvp,
      ...model,
      ...view,
      ...cameraPosition,
      0,
      ...lightPosition,
      0,
      ...lightColor,
      u32ToF32(selectedGeometry),
      u32ToF32(selectedInstance),
      0,
      0,
      0,
    ];
    const uniformArray = new Float32Array(bufferData);
    queue.writeBuffer(uniformBuffer, 0, uniformArray);

    queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(render);
  }

  render();
}
