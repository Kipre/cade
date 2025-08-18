/**
 * Helper function to create a GPUBuffer from an array.
 */
export function createBuffer(
  device,
  array ,
  usage
) {
  // Align to 4 bytes.
  const desc = {
    size: (array.byteLength + 3) & ~3,
    usage,
    mappedAtCreation: true,
  };
  const buffer = device.createBuffer(desc);
  const writeArray =
    array instanceof Uint16Array
      ? new Uint16Array(buffer.getMappedRange())
      : new Float32Array(buffer.getMappedRange());
  writeArray.set(array);
  buffer.unmap();

  return buffer;
}

/**
 * Converts degrees to radians.
 */
export function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Makes sure that the given value is within the given range using combination
 * of min() and max().
 */
export function clamp(value, min, max) {
  return Math.max(Math.min(value, max), min);
}

export function invariant(value, message ) {
  if (!value) {
    throw new Error(message);
  }
}

