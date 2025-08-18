// @ts-chack

import { parseObjFile } from "./obj.js";
import { Camera } from "./camera.js";
import { invariant, createBuffer, toRadians } from "./utils.js";
import { vec3, mat4 } from "wgpu-matrix";
import { FlatPart } from "../bridge.js";
import { Path } from "../tools/path.js";
import { vertexShader, fragmentShader } from "./shaders.js";

const canvas = document.querySelector("canvas");

export const context = canvas.getContext("webgpu");
invariant(context, "WebGPU is not supported in this browser.");

const entry = navigator.gpu;
invariant(entry, "WebGPU is not supported in this browser.");

(async () => {
  const adapter = await entry.requestAdapter();
  invariant(adapter, "No GPU found on this system.");

  const device = await adapter.requestDevice();
  const queue = device.queue;

  const testPart = new FlatPart(Path.makeCircle(50));
  const r = await fetch("/occ/thicken", {
    method: "POST",
    body: testPart.toJson(),
  });
  const file = await r.text();
  const obj = parseObjFile(file);

  context.configure({
    device,
    format: "bgra8unorm",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    alphaMode: "opaque",
  });

  const buffer = [];
  for (const face of obj.faces) {
    for (const faceVertex of face.vertices) {
      const position = obj.vertices[faceVertex.vertexIndex];
      const normal = obj.normals[faceVertex.normalIndex] ?? [0, 0, 0];
      const uv = obj.uvs[faceVertex.uvIndex] ?? [0, 0];
      buffer.push(...position, ...normal, ...uv);
    }
  }

  const positionBuffer = createBuffer(
    device,
    new Float32Array(buffer),
    GPUBufferUsage.VERTEX,
  );

  const uniformBuffer = device.createBuffer({
    size: 4 * 16 + 4 * 16 + 3 * 4 * 4, // mat4x4f + mat4x4f + 3 * vec3f
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

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
          {
            shaderLocation: 0,
            offset: 0,
            format: "float32x3",
          },
          // Normal
          {
            shaderLocation: 1,
            offset: 12,
            format: "float32x3",
          },
          // UV
          {
            shaderLocation: 2,
            offset: 24,
            format: "float32x2",
          },
        ],
        arrayStride: (3 + 3 + 2) * 4,
        stepMode: "vertex",
      },
    ],
  };

  const fragment = {
    module: fragModule,
    entryPoint: "main",
    targets: [{ format: "bgra8unorm" }],
  };

  const pipeline = device.createRenderPipeline({
    vertex,
    fragment,
    layout: "auto",
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

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const depthTexture = device.createTexture({
    size: [context.canvas.width, context.canvas.height],
    format: "depth24plus-stencil8",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const depthTextureView = depthTexture.createView();

  const camera = new Camera(toRadians(50), toRadians(10));

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
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setViewport(0, 0, canvas.width, canvas.height, 0, 1);
    passEncoder.setScissorRect(0, 0, canvas.width, canvas.height);
    passEncoder.setVertexBuffer(0, positionBuffer);
    passEncoder.draw(obj.faces.length * 3);
    passEncoder.end();

    let model = mat4.translation(vec3.create(0, 0, 0));
    model = mat4.rotateZ(model, toRadians(-10));
    model = mat4.scale(model, vec3.create(1.1, 1.1, 1.1));

    const view = mat4.invert(camera.getView());

    const projection = mat4.perspective(
      toRadians(45),
      canvas.width / canvas.height,
      1,
      1000,
    );

    const mvp = mat4.multiply(projection, mat4.multiply(view, model));

    const cameraPosition = camera.getPosition();
    const lightPosition = vec3.create(5, 5, 5);
    const lightColor = vec3.create(1, 1, 1);

    const bufferData = [
      ...mvp,
      ...model,
      ...cameraPosition,
      0,
      ...lightPosition,
      0,
      ...lightColor,
      0,
    ];

    queue.writeBuffer(uniformBuffer, 0, new Float32Array(bufferData));
    queue.submit([commandEncoder.finish()]);

    requestAnimationFrame(render);
  }

  render();
})();
