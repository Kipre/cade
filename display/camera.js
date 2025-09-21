// @ts-check

import { mat4, vec3 } from "wgpu-matrix";
import { clamp } from "./utils.js";

const maxZoom = 5;
const minZoom = 0.01;

let timerId;

class BaseCamera {
  scrollDirection = 0;
  wheelTimeout = null;
  lastX = 0;
  lastY = 0;
  isDragging = false;
  isPanning = false;

  /**
   * @param {any} pitch
   * @param {any} yaw
   * @param {number} size
   * @param {[number, number, number] | null} target
   */
  constructor(pitch, yaw, size, target = null) {
    document.addEventListener("mousedown", this.handleMouseDown);
    document.addEventListener("mousemove", this.handleMouseMove);
    this.canvas = document.querySelector("canvas");
    if (this.canvas == null) throw new Error();

    this.canvas.addEventListener("mouseup", this.handleMouseUp);
    this.canvas.addEventListener("wheel", this.handleMouseWheel);
    this.pitch = pitch;
    this.yaw = yaw;
    this.size = size;
    this.distance = this.size;
    this.target = vec3.create(...(target ?? [0, 0, 0]));

    const cache = sessionStorage.getItem("camera");
    if (cache) {
      const { pitch, yaw, distance, target } = JSON.parse(cache);
      this.pitch = pitch;
      this.yaw = yaw;
      this.distance = distance;
      this.target = vec3.create(...target);
    }
  }

  saveToCache() {
    // debounce
    clearTimeout(timerId);
    timerId = setTimeout(() => {
      const state = {
        pitch: this.pitch,
        yaw: this.yaw,
        distance: this.distance,
        target: [...this.target],
      };
      sessionStorage.setItem("camera", JSON.stringify(state));
    }, 200);
  }

  handleMouseDown = (event) => {
    event.preventDefault();
    this.lastX = event.clientX;
    this.lastY = event.clientY;

    if (event.button === 1 || event.shiftKey) {
      this.isPanning = true;
    } else {
      this.isDragging = true;
    }
  };

  handleMouseMove = (event) => {
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;

    this.lastX = event.clientX;
    this.lastY = event.clientY;

    if (this.isDragging) {
      this.pitch -= dy * 0.01;
      this.yaw += dx * 0.01;
    } else if (this.isPanning) {
      this.pan(dx, dy);
    }
    this.saveToCache();
  };

  handleMouseUp = (event) => {
    if (this.isPanning) event.preventDefault();
    this.isDragging = false;
    this.isPanning = false;
  };

  handleMouseWheel = (event) => {
    event.preventDefault();
    const scaleFactor = 1e-3 * this.distance;
    this.distance += event.deltaY * scaleFactor;
    this.distance = clamp(
      this.distance,
      minZoom * this.size,
      maxZoom * this.size,
    );
    this.saveToCache();
  };

  /**
   * @param {number} mouseDeltaX
   * @param {number} mouseDeltaY
   */
  pan(mouseDeltaX, mouseDeltaY, sensitivity = 0.01) {
    let view = this.getView();
    view = mat4.transpose(view);
    const right = vec3.create(view[0], view[1], view[2]);
    const up = vec3.create(view[4], view[5], view[6]);

    const distance = vec3.distance(this.target, this.getPosition());
    const panScale = distance * sensitivity;

    const panOffset = vec3.add(
      vec3.mulScalar(right, -mouseDeltaX * panScale),
      vec3.mulScalar(up, mouseDeltaY * panScale),
    );

    this.target = vec3.add(this.target, panOffset);
    this.saveToCache();
  }

  getPosition() {
    let result = vec3.create(
      Math.cos(this.pitch) * Math.sin(this.yaw),
      Math.cos(this.pitch) * Math.cos(this.yaw),
      -Math.sin(this.pitch),
    );
    result = vec3.scale(result, this.distance);
    result = vec3.add(result, this.target);
    return result;
  }

  getView() {
    const position = this.getPosition();
    return mat4.lookAt(position, this.target, vec3.create(0, 0, 1));
  }
}

export class PerspectiveCamera extends BaseCamera {
  getMVP() {
    const view = this.getView();
    const projection = mat4.perspective(
      (45 * Math.PI) / 180,
      this.canvas.width / this.canvas.height,
      1,
      this.distance + maxZoom * this.size,
    );
    return mat4.multiply(projection, view);
  }
}

export class OrthoCamera extends BaseCamera {
  getMVP() {
    const view = this.getView();
    const aspect = this.canvas.width / this.canvas.height;
    const x = this.distance * aspect;
    const y = this.distance;
    const projection = mat4.ortho(
      -x,
      x,
      -y,
      y,
      -1 * this.size,
      (maxZoom + 1) * this.size,
    );
    return mat4.multiply(projection, view);
  }
}
