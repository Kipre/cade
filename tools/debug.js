/**
 * @import { Point } from "./types"
 */

import { Path } from "./path.js";
import { BBox } from "./svg.js";

export const w3svg = "http://www.w3.org/2000/svg";

/**
 * Unlimited palette: stepping the hue by the golden angle keeps consecutive
 * colors far apart, and oklch gives them all the same perceived lightness so
 * they stay readable on light and dark backgrounds. Starts on a red.
 * @param {number} i
 */
const debugColor = (i) => `oklch(0.68 0.19 ${(25 + i * 137.508) % 360})`;
let debugShapeCount = 0;
let debugCallCount = 0;

const debugStyle = `
#debug-drawing { font-family: monospace; font-size: 12px; }
#debug-drawing .open {
  position: fixed;
  top: 0.5em;
  right: 0.5em;
  z-index: 2147483647;
  font: inherit;
  cursor: pointer;
}
#debug-drawing dialog {
  width: 100vw;
  height: 100vh;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0;
  border: none;
  box-sizing: border-box;
  font: inherit;
  color: inherit;
}
#debug-drawing dialog[open] {
  display: grid;
  grid-template-columns: 4fr 1fr;
  grid-template-rows: minmax(0, 1fr);
}
#debug-drawing svg {
  width: 100%;
  height: 100%;
  min-width: 0;
  transform: scale(1, -1);
  border: 1px solid #999999;
  box-sizing: border-box;
  stroke-width: 0.2em;
  touch-action: none;
}
#debug-drawing .sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid #999999;
  border-left: none;
}
#debug-drawing .controls { padding: 0.3em; border-bottom: 1px solid #999999; }
#debug-drawing .controls .row { display: flex; gap: 1em; align-items: center; }
#debug-drawing .controls label { display: inline-flex; align-items: center; gap: 0.3em; white-space: nowrap; }
#debug-drawing .close { margin-left: auto; font: inherit; cursor: pointer; }
#debug-drawing .readout { min-height: 1.2em; padding-top: 0.3em; white-space: pre; }
#debug-drawing .legend { flex: 1; min-height: 0; overflow-y: auto; }
#debug-drawing .legend details { margin: 0.3em; }
#debug-drawing .legend summary { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#debug-drawing .legend label { display: block; cursor: pointer; padding: 0 0.3em; }
#debug-drawing .legend label.highlight { background: rgb(128 128 128 / 0.3); }
#debug-drawing .swatch { display: inline-block; width: 1em; height: 0.6em; margin: 0 0.4em; }
#debug-drawing .shape { opacity: 0.8; }
#debug-drawing .hit { stroke: transparent; stroke-width: 1.5em; fill: none; pointer-events: stroke; }
#debug-drawing.has-highlight .shape:not(.highlight) { opacity: 0.4; }
#debug-drawing .shape.highlight { opacity: 1; }
#debug-drawing .shape.highlight .visible { stroke-width: 0.3em; }
/* markers are all set here, overriding the global rules of pages like brotest */
#debug-drawing path { marker: none; opacity: 1; }
#debug-drawing .visible { marker-start: url(#start-line); }
#debug-drawing .dir { marker-mid: url(#arrow); marker-end: url(#arrow); }
#debug-drawing .pts { marker-mid: url(#circle); }
#debug-drawing.hide-arrows .visible { marker-start: none; }
#debug-drawing.hide-arrows .dir { marker-mid: none; marker-end: none; }
#debug-drawing.hide-vertices .pts { marker-mid: none; }
#debug-drawing .origin line {
  stroke: #999999;
  stroke-width: 1px;
  stroke-dasharray: 6 4;
  vector-effect: non-scaling-stroke;
}
`;

/**
 * To call whenever the view box changes:
 * - keeps 1em at roughly 12 screen pixels whatever the zoom level
 * - spans the origin axes over the visible area (with a margin) instead of
 *   making them "infinite" because chrome stops dashing very long lines
 * @param {SVGSVGElement} svg
 */
function updateDebugView(svg) {
  const ctm = svg.getScreenCTM();
  const rect = svg.getBoundingClientRect();
  // nothing is laid out while closed, it will be called again on open
  if (!ctm?.a || !rect.width) return;

  svg.style.fontSize = `${12 / ctm.a}px`;

  // the visible area is wider than the view box when the aspect ratios differ
  const inverse = ctm.inverse();
  const corner1 = new DOMPoint(rect.left, rect.top).matrixTransform(inverse);
  const corner2 = new DOMPoint(rect.right, rect.bottom).matrixTransform(
    inverse,
  );
  const x = Math.min(corner1.x, corner2.x);
  const y = Math.min(corner1.y, corner2.y);
  const width = Math.abs(corner2.x - corner1.x);
  const height = Math.abs(corner2.y - corner1.y);
  const [horizontal, vertical] = svg.querySelectorAll(".origin line");
  horizontal.setAttribute("x1", `${x - width}`);
  horizontal.setAttribute("x2", `${x + 2 * width}`);
  vertical.setAttribute("y1", `${y - height}`);
  vertical.setAttribute("y2", `${y + 2 * height}`);
}

const debugTogglesKey = "debug-drawing-toggles";

/**
 * Creates (once) the floating button opening the fullscreen debug drawing
 * @returns {HTMLDivElement}
 */
function getDebugContainer() {
  const id = "debug-drawing";
  let container = /** @type {HTMLDivElement?} */ (document.getElementById(id));
  if (container) return container;

  container = document.createElement("div");
  container.id = id;
  container.innerHTML = `
<style>${debugStyle}</style>
<button class="open" title="open the debug drawing">debug</button>
<dialog>
<svg xmlns="${w3svg}">
<defs>
  <marker
    id="circle"
    markerWidth="10"
    markerHeight="10"
    refX="5"
    refY="5"
    markerUnits="strokeWidth">
    <circle cx="5" cy="5" r="3" stroke-width="1" stroke="context-stroke" fill="context-fill" />
  </marker>
  <marker
    id="arrow"
    viewBox="0 0 10 10"
    refX="1"
    refY="5"
    markerUnits="strokeWidth"
    markerWidth="5"
    markerHeight="10"
    orient="auto">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
  </marker>
  <marker
    id="start-line"
    viewBox="0 0 10 10"
    refX="1"
    refY="5"
    markerUnits="strokeWidth"
    markerWidth="5"
    markerHeight="10"
    orient="auto">
    <path d="M 4 0 L 4 10 L 6 10 L 6 0 Z" fill="context-stroke" />
  </marker>
</defs>
<g class="origin">
  <line y1="0" y2="0" />
  <line x1="0" x2="0" />
</g>
</svg>
<div class="sidebar">
  <div class="controls">
    <div class="row">
      <label><input type="checkbox" data-toggle="hide-arrows" checked> arrows</label>
      <label><input type="checkbox" data-toggle="hide-vertices" checked> vertices</label>
      <button class="close" title="close (Esc)">✕</button>
    </div>
    <div class="readout"></div>
  </div>
  <div class="legend"></div>
</div>
</dialog>`;
  document.body.appendChild(container);

  const svg = /** @type {SVGSVGElement} */ (container.querySelector("svg"));
  const readout = /** @type {HTMLElement} */ (
    container.querySelector(".readout")
  );

  // the dialog lives in the top layer: no interference with the page styles
  const dialog = /** @type {HTMLDialogElement} */ (
    container.querySelector("dialog")
  );
  container.querySelector(".open").addEventListener("click", () => {
    // backgrounds are not inherited, take the page's one (no flash on dark pages)
    const pageBackground = [document.body, document.documentElement]
      .map((el) => getComputedStyle(el).backgroundColor)
      .find((color) => color !== "rgba(0, 0, 0, 0)");
    dialog.style.background = pageBackground ?? "";

    dialog.showModal();
    // the screen scale is unknown while closed
    updateDebugView(svg);
  });
  container
    .querySelector(".close")
    .addEventListener("click", () => dialog.close());

  // global toggles are persisted across reloads
  /** @type {Record<string, boolean>} */
  let hidden = {};
  try {
    hidden = JSON.parse(localStorage.getItem(debugTogglesKey) ?? "{}");
  } catch { }

  for (const input of container.querySelectorAll("[data-toggle]")) {
    const checkbox = /** @type {HTMLInputElement} */ (input);
    const name = checkbox.dataset.toggle;
    checkbox.checked = !hidden[name];
    container.classList.toggle(name, !!hidden[name]);

    checkbox.addEventListener("change", () => {
      hidden[name] = !checkbox.checked;
      container.classList.toggle(name, hidden[name]);
      try {
        localStorage.setItem(debugTogglesKey, JSON.stringify(hidden));
      } catch { }
    });
  }

  // highlight a shape and its legend row together, whichever is hovered
  /**
   * @param {Event} e
   * @param {boolean} on
   */
  const highlight = (e, on) => {
    const target = /** @type {Element} */ (e.target).closest?.("[data-index]");
    if (!(target instanceof HTMLElement || target instanceof SVGElement))
      return;
    container.classList.toggle("has-highlight", on);
    const selector = `[data-index="${target.dataset.index}"]`;
    for (const el of container.querySelectorAll(selector))
      el.classList.toggle("highlight", on);
  };
  container.addEventListener("pointerover", (e) => highlight(e, true));
  container.addEventListener("pointerout", (e) => highlight(e, false));

  svg.addEventListener("wheel", (/** @type {WheelEvent} */ e) => {
    e.preventDefault();
    const vb = svg.viewBox.baseVal;
    const k = Math.exp(e.deltaY * 0.001); // > 1 zooms out, < 1 zooms in
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.getScreenCTM().inverse(),
    );
    vb.x = p.x - (p.x - vb.x) * k;
    vb.y = p.y - (p.y - vb.y) * k;
    vb.width *= k;
    vb.height *= k;
    updateDebugView(svg);
  });

  /** @type {PointerEvent?} */
  let last = null;
  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    last = e;
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", (e) => {
    const { x, y } = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.getScreenCTM().inverse(),
    );
    readout.textContent = `x ${x.toFixed(3)}  y ${y.toFixed(3)}`;

    if (!last) return;
    const vb = svg.viewBox.baseVal;
    const d = new DOMPoint(
      e.clientX - last.clientX,
      e.clientY - last.clientY,
      0,
      0,
    ).matrixTransform(svg.getScreenCTM().inverse());
    vb.x -= d.x;
    vb.y -= d.y;
    last = e;
    updateDebugView(svg);
  });
  svg.addEventListener("pointerup", () => (last = null));

  return container;
}

/**
 * @typedef {Point[] | string | Path | Point} DebugShape
 * @typedef {{ shape: DebugShape, label?: string, color?: string }} LabeledDebugShape
 */

/**
 * Draws shapes in a fullscreen dialog opened from a floating button, each
 * call adds a group to the legend
 *
 * @param {(DebugShape | LabeledDebugShape)[]} shapes
 */
export function debugGeometry(...shapes) {
  const err = new Error();
  if (typeof document === "undefined") return;

  const container = getDebugContainer();
  const svg = /** @type {SVGSVGElement} */ (container.querySelector("svg"));
  const legend = /** @type {HTMLElement} */ (
    container.querySelector(".legend")
  );

  const group = document.createElementNS(w3svg, "g");
  svg.appendChild(group);

  // legend group for this call, labelled by its caller location
  const caller = err.stack?.split("\n")[2]?.trim() ?? "";
  const location = caller.match(/([^/\\\s()]+:\d+:\d+)\)?$/)?.[1] ?? "";
  const details = document.createElement("details");
  details.open = true;
  const summary = document.createElement("summary");
  summary.title = caller;
  summary.innerHTML = `<input type="checkbox" checked> `;
  summary.append(`call ${debugCallCount++} ${location}`);
  summary
    .querySelector("input")
    .addEventListener("change", (e) =>
      group.setAttribute(
        "display",
        /** @type {HTMLInputElement} */(e.target).checked ? "inline" : "none",
      ),
    );
  details.appendChild(summary);

  // fold the previous calls away
  /** @type {HTMLDetailsElement} */ for (const previous of legend.querySelectorAll(
    "details",
  ))
    previous.open = false;
  legend.appendChild(details);

  const bbox = BBox.fromDataset(svg);

  for (let i = 0; i < shapes.length; i++) {
    const item = shapes[i];
    const labeled =
      item !== null &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      !(item instanceof Path) &&
      "shape" in item;
    let shape = labeled ? item.shape : item;
    const color = (labeled && item.color) || debugColor(i);
    const index = debugShapeCount++;

    const g = document.createElementNS(w3svg, "g");
    g.classList.add("shape");
    g.dataset.index = `${index}`;
    group.appendChild(g);

    let kind;
    let info = "";

    // this is a point
    if (Number.isFinite(shape[0])) {
      kind = "point";
      const [x, y] = /** @type {Point} */ (shape);
      info = ` (${x}, ${y})`;
      const point = document.createElementNS(w3svg, "circle");
      point.classList.add("visible");
      point.setAttribute("stroke", "black");
      point.setAttribute("fill", color);
      point.setAttribute("r", "1em");
      point.setAttribute("cx", `${x}`);
      point.setAttribute("cy", `${y}`);
      bbox.include([x, y]);
      g.appendChild(point);
    } else {
      kind = typeof shape === "string" ? "string" : "path";
      // markers are set in the stylesheet based on this class
      let markerClass = "dir";
      if (Array.isArray(shape)) {
        kind = "array";
        const [first, ...points] = /** @type {Point[]} */ (shape);
        shape = new Path();
        shape.moveTo(first);
        for (const point of points) shape.lineTo(point);
        shape.close();
        markerClass = "pts";
      }
      const d = shape.toString();

      // invisible wide stroke to make thin paths easy to hover
      const hit = document.createElementNS(w3svg, "path");
      hit.classList.add("hit");
      hit.setAttribute("d", d);

      const path = document.createElementNS(w3svg, "path");
      path.classList.add("visible", markerClass);
      path.setAttribute("d", d);
      path.setAttribute("stroke", color);
      path.setAttribute("fill", "none");
      g.append(hit, path);

      const totalLength = path.getTotalLength();
      for (let x = 0; x < 1; x += 0.01) {
        const p = path.getPointAtLength(totalLength * x);
        bbox.include([p.x, p.y]);
      }
    }

    const label = (labeled && item.label) || `${kind} ${i}`;
    const title = document.createElementNS(w3svg, "title");
    title.textContent = label + info;
    g.appendChild(title);

    const row = document.createElement("label");
    row.dataset.index = `${index}`;
    row.title = label + info;
    row.innerHTML = `<input type="checkbox" checked><span class="swatch"></span>`;
    /** @type {HTMLElement} */ (row.querySelector(".swatch")).style.background =
      color;
    row.append(label);
    row
      .querySelector("input")
      .addEventListener("change", (e) =>
        g.setAttribute(
          "display",
          /** @type {HTMLInputElement} */(e.target).checked
            ? "inline"
            : "none",
        ),
      );
    details.appendChild(row);
  }

  bbox.toDataset(svg);
  svg.setAttribute("viewBox", bbox.toViewBox());
  updateDebugView(svg);

  container.querySelector(".open").textContent = `debug (${debugShapeCount})`;
}
