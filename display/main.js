// @ts-check

import { mat4, utils, vec3, vec4 } from "wgpu-matrix";
import { zero3 } from "../lib/defaults.js";
import { Material } from "../lib/materials.js";
import { eps } from "../tools/2d.js";
import { norm3 } from "../tools/3d.js";
import { BBox } from "../tools/svg.js";
import { CADOrthoCamera, OrthoCamera } from "./camera.js";
import { parseObjFile } from "./obj.js";
import {
  fragmentShader,
  lineFragmentShader,
  lineVertexShader,
  pickingFragmentShader,
  vertexShader,
} from "./shaders.js";
import { createBuffer, invariant } from "./utils.js";

const MAX_U16 = 65_535;

const buf = new ArrayBuffer(4);
const f32 = new Float32Array(buf);
const u32 = new Uint32Array(buf);

/**
 * @param {number} u
 */
function u32ToF32(u) {
  u32[0] = u;
  return f32[0];
}

const hiddenObjects = new Set();

const objIdToPair = {};
const pairToObjId = [];

let pickerTimeoutId;

let hoveredGeometry = MAX_U16;
let hoveredInstance = MAX_U16;


window.addEventListener("keydown", (event) => {
  if (hoveredGeometry === MAX_U16) return;
  if (event.code !== "KeyH") return;

  const objId = pairToObjId[hoveredGeometry][hoveredInstance];
  hiddenObjects.add(objId);

  const item = document.createElement("div");
  item.textContent = `hidden ${objId.split("¨")[0]}`;
  const close = document.createElement("button");
  close.textContent = "x";
  close.onclick = (e) => {
    e.preventDefault();
    item.remove();
    hiddenObjects.delete(objId);
  };
  item.appendChild(close);
  document.querySelector("#hidden-items")?.appendChild(item);

  hoveredGeometry = MAX_U16;
  hoveredInstance = MAX_U16;
});

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
  const vertex = {
    module: vertModule,
    entryPoint: "main",
    buffers: [{
      attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
      arrayStride: 3 * 4,
      stepMode: "vertex",
    }],
  };

  const fragModule = device.createShaderModule({ code: lineFragmentShader });
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

  const fragModule = device.createShaderModule({ code: pickingFragmentShader });
  const fragment = {
    label: "picker fragment module",
    module: fragModule,
    entryPoint: "main",
    targets: [{ format: "rgba32float" }],
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
    const name = item.name;
    const objResult = parseObjFile(obj);
    const buffer = parseObjAndRecomputeNormals(objResult, bbox);
    const lineBuffer = makeLineBuffer(objResult);
    const instanceToObjId = [];
    pairToObjId.push(instanceToObjId);

    geometryBuffers.push(
      createBuffer(device, new Float32Array(buffer), GPUBufferUsage.VERTEX),
    );
    lineBuffers.push(
      createBuffer(device, new Float32Array(lineBuffer), GPUBufferUsage.VERTEX),
    );

    for (let j = 0; j < instances.length; j++) {
      const mat = instances[j];
      const objId = `${name}¨${mat.toFloat32Array().join("")}`;
      instanceToObjId.push(objId);
      objIdToPair[objId] = [i, j];
      allInstances.push(...mat.toFloat32Array());
    }

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

  const raycastTexture = device.createTexture({
    size: [context.canvas.width, context.canvas.height],
    format: "rgba32float",
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
  const camera = new CADOrthoCamera(
    utils.degToRad(-40),
    utils.degToRad(10),
    objectSize,
    center,
  );

  const lightPosition = vec3.mulScalar(vec3.create(1, 1, 1), objectSize);
  const lightColor = vec3.create(1, 1, 1);
  const instanceBufferArray = new Float32Array(allInstances);

  const raycastReadBuffer = device.createBuffer({
    label: "depth read buffer",
    size: 16,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  function writeBuffers(queue) {

    for (let i = 0; i < items.length; i++) {
      const instances = sortedItems[i].instances;
      for (let j = 0; j < instances.length; j++) {
        const flag = hiddenObjects.has(pairToObjId[i][j]);
        instanceBufferArray[16 * (lengths[i] + j) + 15] = flag ? 0 : 1;
      }
    }

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
      u32ToF32(hoveredGeometry),
      u32ToF32(hoveredInstance),
      0,
      0,
      0,
    ];
    const uniformArray = new Float32Array(bufferData);
    queue.writeBuffer(uniformBuffer, 0, uniformArray);
  }

  async function updateHoveredObject(commandEncoder, x, y) {
    commandEncoder.copyTextureToBuffer(
      { texture: raycastTexture, origin: { x, y } },
      { buffer: raycastReadBuffer, bytesPerRow: 256 }, // must be 256-byte aligned
      { width: 1, height: 1 },
    );

    await raycastReadBuffer.mapAsync(GPUMapMode.READ);
    const range = raycastReadBuffer.getMappedRange();

    const hitPoint = [...new Float32Array(range).slice(0, 3)];
    const [geomId, instId] = new Uint16Array(range).slice(6);
    raycastReadBuffer.unmap();

    const miss = norm3(hitPoint, zero3) < eps;

    if (miss) {
      camera.setNextTarget(null, null);
      hoveredGeometry = MAX_U16;
      hoveredInstance = MAX_U16;
      return;
    }

    hoveredGeometry = geomId;
    hoveredInstance = instId;

    const ndcClick = [(2 * x) / canvas.width - 1, (2 * y) / canvas.height - 1];
    camera.setNextTarget(hitPoint, ndcClick);
  }

  function makePassEncoder(commandEncoder, ...attachments) {
    if (!attachments.length)
      attachments.push({
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      });

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: attachments,
      depthStencilAttachment: {
        view: depthTextureView,
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
        stencilClearValue: 0,
        stencilLoadOp: "clear",
        stencilStoreOp: "store",
      },
    });

    passEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
    passEncoder.setScissorRect(0, 0, canvas.width, canvas.height);
    passEncoder.setBindGroup(0, bindGroup);

    return passEncoder;
  }

  function renderPipeline(passEncoder, ppline, buffers) {
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

  /**
   * @param {number} x
   * @param {number} y
   */
  async function pickObjectAt(x, y) {
    // read buffer is still busy
    if (raycastReadBuffer.mapState !== "unmapped") {
      clearTimeout(pickerTimeoutId);
      pickerTimeoutId = setTimeout(() => pickObjectAt(x, y), 10);
      return;
    }

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = makePassEncoder(commandEncoder, {
      view: raycastTexture.createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 0 },
      loadOp: "clear",
      storeOp: "store",
    });

    renderPipeline(passEncoder, pickerPipeline, geometryBuffers);
    passEncoder.end();

    writeBuffers(queue);
    await updateHoveredObject(commandEncoder, x, y);
    queue.submit([commandEncoder.finish()]);
  }

  function render() {
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = makePassEncoder(commandEncoder);

    renderPipeline(passEncoder, pipeline, geometryBuffers);
    renderPipeline(passEncoder, linePipeline, lineBuffers);

    passEncoder.end();
    writeBuffers(queue);
    queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(render);
  }

  canvas.addEventListener("mousemove", (event) => {
    if (camera.isPanning || camera.isDragging || event.shiftKey) return;
    const x = event.clientX;
    const y = event.clientY;
    pickObjectAt(x, y);
  });

  render();
}
