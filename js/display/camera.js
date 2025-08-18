import { clamp } from "./utils.js";
import { vec3, mat4 } from "wgpu-matrix";

export class Camera {
  target = vec3.create(0, 0, 0);
  distance = 100;

  scrollDirection = 0;

  wheelTimeout = null;

   lastX = 0;
   lastY = 0;
   isDragging = false;

  constructor( pitch, yaw) {
    document.addEventListener("mousedown", this.handleMouseDown);
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("mouseup", this.handleMouseUp);
    document.querySelector("canvas").addEventListener("wheel", this.handleMouseWheel);
    this.pitch = pitch;
    this.yaw = yaw;
  }

  handleMouseDown = (event) => {
    this.isDragging = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
  };

  handleMouseMove = (event) => {
    if (!this.isDragging) {
      return;
    }

    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;

    this.lastX = event.clientX;
    this.lastY = event.clientY;

    this.pitch -= dy * 0.01;
    this.yaw += dx * 0.01;
  };

  handleMouseUp = (event) => {
    this.isDragging = false;
  };

  handleMouseWheel = (event) => {
    event.preventDefault();
    const scaleFactor = 0.04;
    this.distance += event.deltaY * scaleFactor;
    this.distance = clamp(this.distance, 10, 200);
  };

  getPosition() {
    let result = vec3.create(
      Math.cos(this.pitch) * Math.cos(this.yaw),
      Math.sin(this.pitch),
      Math.cos(this.pitch) * Math.sin(this.yaw)
    )
    result = vec3.scale(result, this.distance)
    result = vec3.add(result, this.target);
    return result;
  }

  getView() {
    const position = this.getPosition();
    // return mat4.transpose(mat4.lookAt(position, this.target, vec3.create(0, 1, 0)));
    return mat4.cameraAim(position, this.target, vec3.create(0, 1, 0));
  }
}
