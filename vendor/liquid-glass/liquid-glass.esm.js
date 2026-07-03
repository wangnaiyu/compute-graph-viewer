//#region ../../../pto/vendor/liquid-glass/react-shim.js
var React = window.React;
if (!React) throw new Error("React must be loaded on window before liquid-glass.esm.js");
React.Fragment;
React.createElement;
React.forwardRef;
var useCallback = React.useCallback;
var useEffect = React.useEffect;
var useId = React.useId;
var useLayoutEffect = React.useLayoutEffect;
var useMemo = React.useMemo;
var useRef = React.useRef;
var useState = React.useState;
//#endregion
//#region ../src/displacement.ts
/**
* The out-of-the-box look — a balanced liquid-glass lens, so `<Glass>` looks
* good with zero config; override any field via the `lens` prop. (No presets;
* one good default kept unopinionated.)
*/
var DEFAULT_LENS_PARAMS = {
	lensW: 95,
	lensH: 95,
	borderRadius: 95,
	mapSize: 512,
	clipToShape: true,
	softEdge: true,
	strength: .06,
	depth: .65,
	curvature: .6,
	splay: 0,
	dispersion: .5,
	bend: 0,
	bendWidth: .16,
	frost: .5,
	brightness: .1,
	specular: 1,
	sheenAngle: 45,
	sheenDark: false,
	sheen: .3,
	sheenWidth: 3,
	sheenFalloff: 1.5,
	glow: .12,
	glowSpread: 1,
	glowFalloff: .5
};
/** Dispersion spread: the red pass is displaced `DISPERSION_SPREAD` more than
*  blue, green half that — a single tunable instead of two inline ratios. (The
*  WebGL shader hard-codes the matching 0.22 / 0.11 split.) */
var DISPERSION_SPREAD = .22;
var ERF_K = Math.sqrt(Math.PI);
var erf = (x) => Math.tanh(ERF_K * x);
/**
* Mean of the dome gradient x/√(R²−x²) over [0, halfExtent]. The integral has a
* closed form — ∫₀ᴴ x/√(R²−x²) dx = R − √(R²−H²) — so the mean is just that over
* H, no numerical quadrature. Used to normalize the spherical-cap profile so the
* average displacement lands at 0.5.
*/
var domeGradientMean = (radius, halfExtent) => halfExtent > 0 ? (radius - Math.sqrt(radius * radius - halfExtent * halfExtent)) / halfExtent : 0;
var computeDomeConstants = (capDepth, halfW, halfH) => {
	const cap = Math.max(.01, Math.min(capDepth, Math.min(halfW, halfH) - 1));
	const Rx = (halfW * halfW + cap * cap) / (2 * cap);
	const Ry = (halfH * halfH + cap * cap) / (2 * cap);
	const meanX = domeGradientMean(Rx, halfW);
	const meanY = domeGradientMean(Ry, halfH);
	return {
		Rx,
		Ry,
		scaleX: meanX > 0 ? .5 / meanX : 1,
		scaleY: meanY > 0 ? .5 / meanY : 1
	};
};
var domeGradient = (distance, radius, scale) => {
	const inside = Math.min(distance, radius * .999);
	return inside / Math.sqrt(radius * radius - inside * inside) * scale;
};
/** `feColorMatrix` values that scale the map's X/Y axes around 0.5. */
var matrixForAxisScale = (x, y) => `${x} 0 0 0 ${.5 * (1 - x)}  0 ${y} 0 0 ${.5 * (1 - y)}  0 0 1 0 0  0 0 0 1 0`;
var maskCache = /* @__PURE__ */ new Map();
/** Rounded-rect SVG data URI used as a CSS mask for the lens-shaped layers.
*  The rect is inset half a device pixel so its stroke-free edge lands on the
*  pixel grid; the corner radius drops the same half pixel to stay concentric. */
var roundedRectMaskUri = (w, h, radius) => {
	const boxW = Math.max(1, Math.round(w));
	const boxH = Math.max(1, Math.round(h));
	const rad = Math.max(0, Math.min(Math.round(radius), Math.min(boxW, boxH) / 2));
	const key = `rr·${boxW}·${boxH}·${rad}`;
	const cached = maskCache.get(key);
	if (cached) return {
		uri: cached,
		key
	};
	const inset = .5;
	const fillW = Math.max(0, boxW - 2 * inset);
	const fillH = Math.max(0, boxH - 2 * inset);
	const corner = Math.max(0, rad - inset);
	const svg = `<svg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 ${boxW} ${boxH}'><rect fill='black' rx='${corner}' ry='${corner}' x='${inset}' y='${inset}' width='${fillW}' height='${fillH}'/></svg>`;
	const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	maskCache.set(key, uri);
	return {
		uri,
		key
	};
};
/**
* Lens-shaped SVG mask data URI (opaque fill on transparent) used to clip a
* blurred layer to the lens shape — a rounded rect. The alpha is the shape; the
* fill colour is irrelevant (consumers composite by alpha).
*/
var lensShapeMaskUri = (w, h, radius) => {
	const iw = Math.max(1, Math.round(w));
	const ih = Math.max(1, Math.round(h));
	return roundedRectMaskUri(iw, ih, Math.max(0, Math.min(Math.round(radius), Math.floor(Math.min(iw, ih) / 2))));
};
var encodeAxis = (signed) => (.5 + signed) * 255 + .5 | 0;
var encodeSpec = (spec) => 127 * spec + 128 + .5 | 0;
/**
* Synchronous, quadrant-mirrored map generator (the fast path for animated
* lenses). Reuses one canvas/ImageData and a per-column dome LUT so it can run
* every animation frame; returns a PNG data URL. Only the top-left quadrant is
* computed; the other three are written by reflecting the displacement signs.
*/
var createLensMapGenerator = (size) => {
	let canvas = null;
	let ctx = null;
	let image = null;
	let domeLut = null;
	let lutDome = -Infinity;
	let lutHalfW = -Infinity;
	let lutHalfH = -Infinity;
	let lutLen = 0;
	let lutDirty = true;
	let dome = null;
	return {
		generate(shape) {
			if (!canvas) {
				canvas = document.createElement("canvas");
				canvas.width = size;
				canvas.height = size;
				ctx = canvas.getContext("2d");
				image = ctx.createImageData(size, size);
			}
			const { lensHalfWidth: halfW, lensHalfHeight: halfH, borderRadius, depth, clipToShape, softEdge, sheenAngle = 45, glow = 0, glowSpread = 1, glowFalloff = 1.5, sheen = 0, sheenWidth = 3, sheenFalloff = 1.5, curvature = 0, splay = 0, bend = 0, bendWidth = .16 } = shape;
			const data = image.data;
			const half = size >> 1;
			const radius = Math.min(borderRadius, Math.min(halfW, halfH));
			const minHalf = Math.min(halfW, halfH);
			const depthPx = Math.min(depth * minHalf, minHalf - 1);
			const innerHalfW = Math.max(0, halfW - depthPx);
			const innerHalfH = Math.max(0, halfH - depthPx);
			const innerRadius = Math.max(0, Math.min(borderRadius, Math.min(innerHalfW, innerHalfH)));
			const falloff = depthPx > 0 ? Math.SQRT1_2 / depthPx : 1e6;
			const hasSpecular = glow > 0 || sheen > 0;
			const angle = sheenAngle * Math.PI / 180;
			const cosA = Math.cos(angle);
			const sinA = Math.sin(angle);
			const edgeInv = sheenWidth > 0 ? 1 / sheenWidth : 0;
			const glowReachInv = 1 / Math.max(2, glowSpread * Math.min(halfW, halfH));
			const stepX = 2 * halfW / size;
			const stepY = 2 * halfH / size;
			const invW = 1 / halfW;
			const invH = 1 / halfH;
			const hasDome = curvature > 0;
			const domeCap = curvature * Math.min(halfW, halfH);
			const hasSplay = splay > 0;
			const hasEdgeRefract = bend > 0;
			const erInv = 1 / Math.max(2, bendWidth * Math.min(halfW, halfH));
			const cornerDistance = (ox, oy) => ox > 0 || oy > 0 ? Math.sqrt(ox * ox + oy * oy) : 0;
			if (hasDome) {
				if (!dome || Math.abs(domeCap - lutDome) > .5 || Math.abs(halfW - lutHalfW) > 1 || Math.abs(halfH - lutHalfH) > 1) {
					dome = computeDomeConstants(domeCap, halfW, halfH);
					lutDome = domeCap;
					lutHalfW = halfW;
					lutHalfH = halfH;
					lutDirty = true;
				}
				if (lutLen !== half) {
					domeLut = new Float32Array(half);
					lutLen = half;
					lutDirty = true;
				}
				if (lutDirty) {
					const lut = domeLut;
					const d = dome;
					const r2 = d.Rx * d.Rx;
					const rMax = d.Rx * .999;
					for (let col = 0; col < half; col += 1) {
						const px = -((col + .5) * stepX - halfW);
						const clamped = px < rMax ? px : rMax;
						lut[col] = clamped / Math.sqrt(r2 - clamped * clamped) * d.scaleX;
					}
					lutDirty = false;
				}
			}
			const lut = hasDome ? domeLut : null;
			const splayHalf = .5 * Math.min(halfW, halfH);
			const splayInv = splayHalf > 0 ? 1 / splayHalf : 0;
			const sheenNorm = Math.SQRT1_2;
			for (let row = 0; row < half; row += 1) {
				const mirrorRow = size - 1 - row;
				const py = -((row + .5) * stepY - halfH);
				const edgeY = py - halfH + radius;
				const innerEdgeY = softEdge ? py - innerHalfH + innerRadius : 0;
				const dirYBase = hasDome && lut ? domeGradient(py, dome.Ry, dome.scaleY) : py * invH > 1 ? 1 : py * invH;
				const normY = py * invH > 1 ? 1 : py * invH;
				const splayY = hasSplay ? Math.max(0, 1 - (halfH - py) * splayInv) : 0;
				const rowBase = row * size;
				const mirrorRowBase = mirrorRow * size;
				for (let col = 0; col < half; col += 1) {
					const mirrorCol = size - 1 - col;
					const px = -((col + .5) * stepX - halfW);
					const edgeX = px - halfW + radius;
					const sdf = cornerDistance(edgeX > 0 ? edgeX : 0, edgeY > 0 ? edgeY : 0) + (edgeX > edgeY ? edgeX > 0 ? 0 : edgeX : edgeY > 0 ? 0 : edgeY) - radius;
					const i00 = (rowBase + col) * 4;
					const i01 = (rowBase + mirrorCol) * 4;
					const i10 = (mirrorRowBase + col) * 4;
					const i11 = (mirrorRowBase + mirrorCol) * 4;
					if (clipToShape && sdf >= 0) {
						for (const idx of [
							i00,
							i01,
							i10,
							i11
						]) {
							data[idx] = 128;
							data[idx + 1] = 128;
							data[idx + 2] = 128;
							data[idx + 3] = 255;
						}
						continue;
					}
					let dirX = lut ? lut[col] : px * invW > 1 ? 1 : px * invW;
					let dirY = dirYBase;
					if (hasSplay) {
						const yAtt = splayY * splay;
						const xAtt = Math.max(0, 1 - (halfW - px) * splayInv) * splay;
						if (yAtt > .001 || xAtt > .001) {
							const prevX = dirX;
							const prevY = dirY;
							dirX = prevX * (1 - yAtt);
							dirY = prevY * (1 - xAtt);
							const prevLen = Math.sqrt(prevX * prevX + prevY * prevY);
							const nextLen = Math.sqrt(dirX * dirX + dirY * dirY);
							if (nextLen > .001) {
								const restore = prevLen / nextLen;
								dirX *= restore;
								dirY *= restore;
							}
						}
					}
					let edgeOpacity = 1;
					if (softEdge) {
						const ix = px - innerHalfW + innerRadius;
						edgeOpacity = .5 * (1 + erf((cornerDistance(ix > 0 ? ix : 0, innerEdgeY > 0 ? innerEdgeY : 0) + (ix > innerEdgeY ? ix > 0 ? 0 : ix : innerEdgeY > 0 ? 0 : innerEdgeY) - innerRadius) * falloff));
					}
					let dx = .5 * dirX * edgeOpacity;
					let dy = .5 * dirY * edgeOpacity;
					if (hasEdgeRefract) {
						const s = sdf < 0 ? Math.max(0, 1 + sdf * erInv) : 0;
						if (s > 0) {
							const len = Math.sqrt(dirX * dirX + dirY * dirY);
							if (len > 1e-4) {
								const m = 6.75 * s * s * (1 - s);
								const a = .5 * bend * m * edgeOpacity / len;
								dx += dirX * a;
								dy += dirY * a;
							}
						}
					}
					let specMain = 0;
					let specCross = 0;
					if (hasSpecular) {
						const normX = px * invW > 1 ? 1 : px * invW;
						const axisMain = Math.min(1, Math.abs(normX * cosA + normY * sinA) * sheenNorm);
						const axisCross = Math.min(1, Math.abs(normX * cosA - normY * sinA) * sheenNorm);
						if (sheen > 0) {
							const band = sdf < 0 ? Math.max(0, 1 + sdf * edgeInv) : 0;
							const b = sheen * Math.pow(band, sheenFalloff);
							specMain += b * (.16 + .84 * Math.pow(axisMain, 1.6));
							specCross += b * (.16 + .84 * Math.pow(axisCross, 1.6));
						}
						if (glow > 0) {
							const t = 1 - (sdf < 0 ? Math.min(1, -sdf * glowReachInv) : 1);
							const g = glow * Math.pow(t * t * (3 - 2 * t), glowFalloff) * edgeOpacity;
							specMain += g * (.6 + .4 * axisMain);
							specCross += g * (.6 + .4 * axisCross);
						}
						if (specMain > 1) specMain = 1;
						else if (specMain < -1) specMain = -1;
						if (specCross > 1) specCross = 1;
						else if (specCross < -1) specCross = -1;
					}
					const rPos = encodeAxis(dx);
					const rNeg = encodeAxis(-dx);
					const gPos = encodeAxis(dy);
					const gNeg = encodeAxis(-dy);
					const bMain = encodeSpec(specMain);
					const bCross = encodeSpec(specCross);
					data[i00] = rPos;
					data[i00 + 1] = gPos;
					data[i00 + 2] = bMain;
					data[i00 + 3] = 255;
					data[i01] = rNeg;
					data[i01 + 1] = gPos;
					data[i01 + 2] = bCross;
					data[i01 + 3] = 255;
					data[i10] = rPos;
					data[i10 + 1] = gNeg;
					data[i10 + 2] = bCross;
					data[i10 + 3] = 255;
					data[i11] = rNeg;
					data[i11 + 1] = gNeg;
					data[i11 + 2] = bMain;
					data[i11 + 3] = 255;
				}
			}
			ctx.putImageData(image, 0, 0);
			return canvas.toDataURL();
		},
		dispose() {
			if (canvas) {
				canvas.width = 0;
				canvas.height = 0;
				canvas = null;
			}
			ctx = null;
			image = null;
			domeLut = null;
			dome = null;
			lutDome = -Infinity;
			lutHalfW = -Infinity;
			lutHalfH = -Infinity;
			lutLen = 0;
			lutDirty = true;
		}
	};
};
//#endregion
//#region ../src/signal.ts
/** Duck-type test: a `get`/`on` pair marks a reactive value vs a plain number. */
var isGlassMotionValue = (value) => typeof value === "object" && value !== null && "get" in value && "on" in value;
/** Read the current scalar whether `value` is a signal or a literal number. */
var readGlassValue = (value) => isGlassMotionValue(value) ? value.get() : value;
/**
* Observable scalar. Subscribers are notified only when the value actually
* changes; `on` returns its own detach function. A class (rather than a closure
* over a Set) keeps each instance's state on the prototype and the subscriber
* list compact for the per-frame writes during a drag.
*/
var LensSignal = class {
	constructor(initial) {
		this.subscribers = [];
		this.current = initial;
	}
	get() {
		return this.current;
	}
	set(next) {
		if (next === this.current) return;
		this.current = next;
		for (const notify of this.subscribers.slice()) notify(next);
	}
	on(_event, callback) {
		this.subscribers.push(callback);
		return () => {
			const at = this.subscribers.indexOf(callback);
			if (at !== -1) this.subscribers.splice(at, 1);
		};
	}
};
/** Create a reactive scalar seeded with `initial`. */
var glassValue = (initial) => new LensSignal(initial);
/**
* A signal computed from other signals (framer-motion's `useTransform`
* equivalent): seeded with `compute()` and recomputed whenever any input fires.
*/
var deriveGlass = (deps, compute) => {
	const derived = glassValue(compute());
	const recompute = () => derived.set(compute());
	for (const dep of deps) dep.on("change", recompute);
	return derived;
};
/**
* Cubic-bezier easing with the same contract as CSS `cubic-bezier()`.
*
* Uses the classic UnitBezier formulation (precomputed polynomial coefficients
* `a/b/c` per axis, then Newton–Raphson with a bisection fallback) — the
* reference technique browsers themselves use to invert x→t before reading y.
* Control points outside [0,1] on the y-axis produce intended overshoot.
*/
var cubicBezier = (x1, y1, x2, y2) => {
	const cx = 3 * x1;
	const bx = 3 * (x2 - x1) - cx;
	const ax = 1 - cx - bx;
	const cy = 3 * y1;
	const by = 3 * (y2 - y1) - cy;
	const ay = 1 - cy - by;
	const curveX = (t) => ((ax * t + bx) * t + cx) * t;
	const curveY = (t) => ((ay * t + by) * t + cy) * t;
	const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
	const solveForT = (x) => {
		let t = x;
		for (let i = 0; i < 8; i += 1) {
			const offset = curveX(t) - x;
			if (Math.abs(offset) < 1e-6) return t;
			const slope = slopeX(t);
			if (Math.abs(slope) < 1e-6) break;
			t -= offset / slope;
		}
		let lo = 0;
		let hi = 1;
		t = x;
		while (lo < hi) {
			const sampled = curveX(t);
			if (Math.abs(sampled - x) < 1e-6) break;
			if (sampled < x) lo = t;
			else hi = t;
			if (hi - lo < 1e-7) break;
			t = (lo + hi) / 2;
		}
		return t;
	};
	return (x) => {
		if (x <= 0) return 0;
		if (x >= 1) return 1;
		return curveY(solveForT(x));
	};
};
/** Our default control easing — a gentle overshoot on settle. */
var glassEase = cubicBezier(.34, 1.36, .42, 1);
var inFlight = /* @__PURE__ */ new WeakMap();
var animateGlassValue = (value, to, { duration = .3, ease = glassEase, onComplete } = {}) => {
	inFlight.get(value)?.stop();
	const from = value.get();
	if (from === to || duration <= 0) {
		value.set(to);
		onComplete?.();
		return { stop() {} };
	}
	const durationMs = duration * 1e3;
	let frame = 0;
	let startedAt = 0;
	const advance = (now) => {
		if (startedAt === 0) startedAt = now;
		const progress = (now - startedAt) / durationMs;
		if (progress >= 1) {
			value.set(to);
			inFlight.delete(value);
			onComplete?.();
			return;
		}
		value.set(from + (to - from) * ease(progress));
		frame = requestAnimationFrame(advance);
	};
	frame = requestAnimationFrame(advance);
	const handle = { stop() {
		cancelAnimationFrame(frame);
		inFlight.delete(value);
	} };
	inFlight.set(value, handle);
	return handle;
};
//#endregion
//#region ../src/glassWebGL.ts
var VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  // a_pos is a -1..1 fullscreen quad; v_uv is bottom-left-origin 0..1, which
  // (with UNPACK_FLIP_Y on the textures) samples the source upright. The lens
  // descriptor is supplied in this same bottom-left space by the component.
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;
var BLIT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
void main() { o = texture(u_src, v_uv); }`;
var BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_step;
void main() {
  vec4 c = texture(u_src, v_uv) * 0.1857;
  c += (texture(u_src, v_uv + u_step)       + texture(u_src, v_uv - u_step))       * 0.1671;
  c += (texture(u_src, v_uv + 2.0 * u_step) + texture(u_src, v_uv - 2.0 * u_step)) * 0.1227;
  c += (texture(u_src, v_uv + 3.0 * u_step) + texture(u_src, v_uv - 3.0 * u_step)) * 0.0768;
  c += (texture(u_src, v_uv + 4.0 * u_step) + texture(u_src, v_uv - 4.0 * u_step)) * 0.0414;
  o = c;
}`;
var LENS_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_src;
uniform sampler2D u_blur;
uniform sampler2D u_disp;
uniform vec2 u_origin;
uniform vec2 u_size;
uniform vec2 u_scale;
uniform vec2 u_lenspx;   // lens box size in device px (for an aspect-correct SDF)
uniform float u_radiuspx; // corner radius in device px
uniform float u_dispersion;
uniform float u_sheen;
uniform float u_frost;    // 0 = sharp; >0 = blend toward the pre-blurred copy
uniform float u_opacity;  // enter/exit fade (multiplies coverage)
uniform float u_brightness; // white(>0)/black(<0) veil over the lens
// Signed distance to a rounded rectangle (negative inside). Computed in pixel
// space so the corner radius stays circular on non-square lenses. NB: the half-
// extent arg must NOT be named \`half\` — that's a reserved word in GLSL ES and
// Safari's (stricter) WebGL2 compiler rejects it, throwing at renderer init.
float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
// Source sample, blended toward the frosted (pre-blurred) copy by mixAmt. The
// frost is what makes the glass read as liquid rather than a clear lens.
vec3 frosted(vec2 p, float mixAmt) {
  vec3 raw = texture(u_src, p).rgb;
  return mixAmt > 0.0 ? mix(raw, texture(u_blur, p).rgb, mixAmt) : raw;
}
void main() {
  vec2 lensUV = (v_uv - u_origin) / u_size;
  // Rounded-rect coverage. The SDF is in device px and a true distance field
  // (gradient ~1), so a fixed ~1px feather anti-aliases the edge without fwidth
  // (derivatives are handled inconsistently across WebGL2 backends).
  vec2 p = (lensUV - 0.5) * u_lenspx;
  float sdf = sdRoundRect(p, u_lenspx * 0.5, min(u_radiuspx, min(u_lenspx.x, u_lenspx.y) * 0.5));
  float coverage = (1.0 - smoothstep(-1.0, 1.0, sdf)) * u_opacity;
  if (coverage <= 0.0) discard;
  vec4 d = texture(u_disp, clamp(lensUV, 0.0, 1.0));
  vec2 disp = (d.rg - 0.5) * u_scale;            // feDisplacementMap equivalent
  // RGB split — red bent DISPERSION_SPREAD more than blue, green half that (keep
  // in sync with DISPERSION_SPREAD in displacement.ts so DOM + WebGL match).
  vec2 uvR = v_uv + disp * (1.0 + u_dispersion * 0.22);
  vec2 uvG = v_uv + disp * (1.0 + u_dispersion * 0.11);
  vec2 uvB = v_uv + disp;
  vec3 lensCol = vec3(frosted(uvR, u_frost).r, frosted(uvG, u_frost).g, frosted(uvB, u_frost).b);
  // Specular lift from B. The map encodes spec as B = 127·s + 128, so (B/255 − 0.5)
  // = 0.498·s; this matches the DOM path's gain exactly (feColorMatrix 1× alpha
  // then feComposite k2=specular → 0.498·specular·s). (NOT ×2 — that double-lifted it.)
  lensCol += u_sheen * max(0.0, d.b - 0.5);
  // Brightness veil (alpha-blend toward white/black, like the DOM path).
  if (u_brightness > 0.0) lensCol = mix(lensCol, vec3(1.0), clamp(u_brightness, 0.0, 1.0));
  else if (u_brightness < 0.0) lensCol = mix(lensCol, vec3(0.0), clamp(-u_brightness, 0.0, 1.0));
  // Mix over the untouched backdrop by the coverage → an AA'd, frosted-clipping
  // silhouette. Canvas stays fully opaque, so straight/premultiplied alpha is moot.
  vec3 backdrop = texture(u_src, v_uv).rgb;
  o = vec4(mix(backdrop, lensCol, coverage), 1.0);
}`;
var compile = (gl, type, src) => {
	const sh = gl.createShader(type);
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(sh);
		gl.deleteShader(sh);
		throw new Error(`glass-webgl shader: ${log}`);
	}
	return sh;
};
var link = (gl, vsSrc, fsSrc) => {
	const p = gl.createProgram();
	const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
	const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
	gl.attachShader(p, vs);
	gl.attachShader(p, fs);
	gl.bindAttribLocation(p, 0, "a_pos");
	gl.linkProgram(p);
	gl.deleteShader(vs);
	gl.deleteShader(fs);
	if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
		const log = gl.getProgramInfoLog(p);
		gl.deleteProgram(p);
		throw new Error(`glass-webgl link: ${log}`);
	}
	return p;
};
var GlassWebGLRenderer = class {
	constructor(canvas) {
		this.dispCache = /* @__PURE__ */ new Map();
		this.blurW = 0;
		this.blurH = 0;
		this.srcW = 0;
		this.srcH = 0;
		this.disposed = false;
		const gl = canvas.getContext("webgl2", {
			premultipliedAlpha: false,
			alpha: true,
			antialias: false,
			preserveDrawingBuffer: false
		});
		if (!gl) throw new Error("webgl2 unavailable");
		this.gl = gl;
		this.blit = link(gl, VERT, BLIT_FRAG);
		this.lens = link(gl, VERT, LENS_FRAG);
		this.blur = link(gl, VERT, BLUR_FRAG);
		this.quad = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
			-1,
			-1,
			1,
			-1,
			-1,
			1,
			1,
			1
		]), gl.STATIC_DRAW);
		const makeTex = () => {
			const t = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, t);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			return t;
		};
		this.srcTex = makeTex();
		this.dispTex = makeTex();
		this.blurTex = [makeTex(), makeTex()];
		this.fbo = [gl.createFramebuffer(), gl.createFramebuffer()];
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		this.uBlitSrc = gl.getUniformLocation(this.blit, "u_src");
		this.uBlur = {
			src: gl.getUniformLocation(this.blur, "u_src"),
			step: gl.getUniformLocation(this.blur, "u_step")
		};
		this.uLens = {
			src: gl.getUniformLocation(this.lens, "u_src"),
			blur: gl.getUniformLocation(this.lens, "u_blur"),
			disp: gl.getUniformLocation(this.lens, "u_disp"),
			origin: gl.getUniformLocation(this.lens, "u_origin"),
			size: gl.getUniformLocation(this.lens, "u_size"),
			scale: gl.getUniformLocation(this.lens, "u_scale"),
			lenspx: gl.getUniformLocation(this.lens, "u_lenspx"),
			radiuspx: gl.getUniformLocation(this.lens, "u_radiuspx"),
			dispersion: gl.getUniformLocation(this.lens, "u_dispersion"),
			specular: gl.getUniformLocation(this.lens, "u_sheen"),
			frost: gl.getUniformLocation(this.lens, "u_frost"),
			opacity: gl.getUniformLocation(this.lens, "u_opacity"),
			brightness: gl.getUniformLocation(this.lens, "u_brightness")
		};
	}
	/** (Re)allocate the ping-pong frost targets to the source size. */
	ensureBlurTargets(w, h) {
		if (w === this.blurW && h === this.blurH) return;
		const gl = this.gl;
		for (let i = 0; i < 2; i += 1) {
			gl.bindTexture(gl.TEXTURE_2D, this.blurTex[i]);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[i]);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurTex[i], 0);
		}
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this.blurW = w;
		this.blurH = h;
	}
	/** Two-pass separable blur of the current source texture into blurTex[1]. */
	renderFrost(blurPx) {
		const gl = this.gl;
		this.ensureBlurTargets(this.srcW, this.srcH);
		gl.useProgram(this.blur);
		gl.viewport(0, 0, this.srcW, this.srcH);
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform1i(this.uBlur.src, 0);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[0]);
		gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
		gl.uniform2f(this.uBlur.step, blurPx / this.srcW, 0);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[1]);
		gl.bindTexture(gl.TEXTURE_2D, this.blurTex[0]);
		gl.uniform2f(this.uBlur.step, 0, blurPx / this.srcH);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}
	/** Upload the displacement-map image (call only when the lens SHAPE changes). */
	setDisplacementMap(img) {
		if (this.disposed) return;
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, this.dispTex);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
	}
	/** Texture for a per-lens displacement map, uploaded once and cached by the
	*  image identity (a lens of a different shape supplies its own map). */
	dispTexFor(img) {
		const gl = this.gl;
		let tex = this.dispCache.get(img);
		if (!tex) {
			tex = gl.createTexture();
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
			this.dispCache.set(img, tex);
		}
		return tex;
	}
	/** Free a per-lens map texture (its shape is no longer used) so the cache
	*  can't grow unbounded as a responsive lens re-keys. */
	releaseDispMap(img) {
		const tex = this.dispCache.get(img);
		if (tex) {
			this.gl.deleteTexture(tex);
			this.dispCache.delete(img);
		}
	}
	/** Size the drawing buffer (CSS px × dpr). */
	resize(w, h) {
		const c = this.gl.canvas;
		if (c.width !== w || c.height !== h) {
			c.width = w;
			c.height = h;
		}
	}
	uploadSource(src, w, h) {
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
		if (w !== this.srcW || h !== this.srcH) {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
			this.srcW = w;
			this.srcH = h;
		} else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
	}
	/** Upload `source` once and draw every lens over it. */
	render(source, srcW, srcH, lenses) {
		if (this.disposed || srcW === 0 || srcH === 0) return;
		const gl = this.gl;
		this.uploadSource(source, srcW, srcH);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
		gl.disable(gl.BLEND);
		const maxBlur = lenses.reduce((mx, d) => Math.max(mx, d.blur), 0);
		if (maxBlur > 0) this.renderFrost(maxBlur);
		const cw = gl.canvas.width;
		const ch = gl.canvas.height;
		gl.viewport(0, 0, cw, ch);
		gl.useProgram(this.blit);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
		gl.uniform1i(this.uBlitSrc, 0);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		gl.useProgram(this.lens);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
		gl.uniform1i(this.uLens.src, 0);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.dispTex);
		gl.uniform1i(this.uLens.disp, 1);
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, this.blurTex[1]);
		gl.uniform1i(this.uLens.blur, 2);
		for (const d of lenses) {
			const opacity = d.opacity ?? 1;
			if (opacity <= 0) continue;
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, d.dispMap ? this.dispTexFor(d.dispMap) : this.dispTex);
			gl.uniform2f(this.uLens.origin, d.originX, d.originY);
			gl.uniform2f(this.uLens.size, d.sizeX, d.sizeY);
			gl.uniform2f(this.uLens.scale, d.scaleX, d.scaleY);
			gl.uniform2f(this.uLens.lenspx, d.sizeX * cw, d.sizeY * ch);
			gl.uniform1f(this.uLens.radiuspx, (d.cornerRadius ?? 0) * cw);
			gl.uniform1f(this.uLens.dispersion, d.dispersion);
			gl.uniform1f(this.uLens.specular, d.specular);
			gl.uniform1f(this.uLens.frost, d.blur > 0 ? Math.min(1, d.blur / 8) : 0);
			gl.uniform1f(this.uLens.opacity, opacity);
			gl.uniform1f(this.uLens.brightness, d.brightness ?? 0);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		const gl = this.gl;
		gl.deleteProgram(this.blit);
		gl.deleteProgram(this.lens);
		gl.deleteProgram(this.blur);
		gl.deleteTexture(this.srcTex);
		gl.deleteTexture(this.dispTex);
		this.dispCache.forEach((t) => gl.deleteTexture(t));
		this.dispCache.clear();
		gl.deleteTexture(this.blurTex[0]);
		gl.deleteTexture(this.blurTex[1]);
		gl.deleteFramebuffer(this.fbo[0]);
		gl.deleteFramebuffer(this.fbo[1]);
		gl.deleteBuffer(this.quad);
		gl.getExtension("WEBGL_lose_context")?.loseContext();
	}
};
//#endregion
//#region ../src/GlassSurface.tsx
var DPR = () => typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
var resolveLens = (spec) => ({
	merged: {
		...DEFAULT_LENS_PARAMS,
		...spec.lens
	},
	lensW: spec.lensW,
	lensH: spec.lensH,
	radius: spec.borderRadius,
	x: spec.x,
	y: spec.y,
	scale: spec.scale ?? 1,
	opacity: spec.opacity ?? 1
});
/**
* Drive a {@link GlassWebGLRenderer} from a per-frame source. `getFrame` returns
* the current frame as a texture source + its intrinsic size, or null to skip.
* `specs[0]` owns the shared displacement map; every spec is drawn each frame.
*/
var useLensRenderer = (outRef, containerRef, getFrame, specs, maxDpr, driveOnVideoFrames) => {
	const [failed, setFailed] = useState(false);
	const rendererRef = useRef(null);
	const generatorRef = useRef(null);
	const shape = specs[0];
	const state = useRef(specs);
	state.current = specs;
	const hasLiveGeometry = specs.some((s) => isGlassMotionValue(s.x) || isGlassMotionValue(s.y) || isGlassMotionValue(s.lensW) || isGlassMotionValue(s.lensH) || s.radius != null && isGlassMotionValue(s.radius));
	useLayoutEffect(() => {
		const out = outRef.current;
		const container = containerRef.current;
		if (!out || !container) return;
		let renderer;
		try {
			renderer = new GlassWebGLRenderer(out);
		} catch (err) {
			if (typeof console !== "undefined") console.warn("[liquid-glass] WebGL renderer unavailable, falling back:", err);
			setFailed(true);
			return;
		}
		rendererRef.current = renderer;
		const dpr = Math.min(DPR(), maxDpr);
		const sync = () => {
			const w = container.clientWidth;
			const h = container.clientHeight;
			out.style.width = `${w}px`;
			out.style.height = `${h}px`;
			renderer.resize(Math.round(w * dpr), Math.round(h * dpr));
		};
		sync();
		const ro = new ResizeObserver(sync);
		ro.observe(container);
		return () => {
			ro.disconnect();
			renderer.dispose();
			rendererRef.current = null;
		};
	}, [
		outRef,
		containerRef,
		maxDpr
	]);
	const m0 = shape.merged;
	const shapeW = readGlassValue(shape.lensW);
	const shapeH = readGlassValue(shape.lensH);
	const shapeR = shape.radius != null ? readGlassValue(shape.radius) : Math.min(shapeW, shapeH);
	useEffect(() => {
		if (!rendererRef.current) return;
		if (!generatorRef.current) generatorRef.current = createLensMapGenerator(m0.mapSize);
		const url = generatorRef.current.generate({
			lensHalfWidth: shapeW,
			lensHalfHeight: shapeH,
			borderRadius: shapeR,
			depth: m0.depth,
			clipToShape: m0.clipToShape,
			softEdge: m0.softEdge,
			sheenAngle: m0.sheenAngle,
			glow: m0.glow,
			glowSpread: m0.glowSpread,
			glowFalloff: m0.glowFalloff,
			sheen: m0.sheen,
			sheenWidth: m0.sheenWidth,
			sheenFalloff: m0.sheenFalloff,
			curvature: m0.curvature,
			splay: m0.splay,
			bend: m0.bend,
			bendWidth: m0.bendWidth
		});
		let stale = false;
		const img = new Image();
		img.onload = () => {
			if (!stale) rendererRef.current?.setDisplacementMap(img);
		};
		img.src = url;
		return () => {
			stale = true;
		};
	}, [JSON.stringify([
		m0.mapSize,
		shapeW,
		shapeH,
		shapeR,
		m0.depth,
		m0.clipToShape,
		m0.softEdge,
		m0.curvature,
		m0.splay,
		m0.glow,
		m0.glowSpread,
		m0.glowFalloff,
		m0.sheen,
		m0.sheenWidth,
		m0.sheenFalloff,
		m0.sheenAngle,
		m0.bend,
		m0.bendWidth
	]), failed]);
	const keyOf = (s) => {
		const m = s.merged;
		const w = readGlassValue(s.lensW);
		const h = readGlassValue(s.lensH);
		const r = s.radius != null ? readGlassValue(s.radius) : Math.min(w, h);
		return JSON.stringify([
			m.mapSize,
			w,
			h,
			r,
			m.depth,
			m.clipToShape,
			m.softEdge,
			m.curvature,
			m.splay,
			m.glow,
			m.glowSpread,
			m.glowFalloff,
			m.sheen,
			m.sheenWidth,
			m.sheenFalloff,
			m.sheenAngle,
			m.bend,
			m.bendWidth
		]);
	};
	const lensKeys = specs.map(keyOf);
	const lensKeysRef = useRef(lensKeys);
	lensKeysRef.current = lensKeys;
	const perLensMaps = useRef(/* @__PURE__ */ new Map());
	useEffect(() => {
		const gen = generatorRef.current;
		if (!gen) return;
		const live = new Set(lensKeysRef.current);
		perLensMaps.current.forEach((img, key) => {
			if (!live.has(key)) {
				perLensMaps.current.delete(key);
				rendererRef.current?.releaseDispMap(img);
			}
		});
		const defaultKey = lensKeysRef.current[0];
		const cleanups = [];
		const want = /* @__PURE__ */ new Set();
		specs.forEach((s, i) => {
			const key = lensKeysRef.current[i];
			if (key === defaultKey || want.has(key) || perLensMaps.current.has(key)) return;
			want.add(key);
			const m = s.merged;
			const w = readGlassValue(s.lensW);
			const h = readGlassValue(s.lensH);
			const r = s.radius != null ? readGlassValue(s.radius) : Math.min(w, h);
			const url = gen.generate({
				lensHalfWidth: w,
				lensHalfHeight: h,
				borderRadius: r,
				depth: m.depth,
				clipToShape: m.clipToShape,
				softEdge: m.softEdge,
				sheenAngle: m.sheenAngle,
				glow: m.glow,
				glowSpread: m.glowSpread,
				glowFalloff: m.glowFalloff,
				sheen: m.sheen,
				sheenWidth: m.sheenWidth,
				sheenFalloff: m.sheenFalloff,
				curvature: m.curvature,
				splay: m.splay,
				bend: m.bend,
				bendWidth: m.bendWidth
			});
			let stale = false;
			const img = new Image();
			img.onload = () => {
				if (!stale) perLensMaps.current.set(key, img);
			};
			img.src = url;
			cleanups.push(() => {
				stale = true;
			});
		});
		return () => cleanups.forEach((c) => c());
	}, [lensKeys.join("|"), failed]);
	useEffect(() => () => {
		generatorRef.current?.dispose();
		generatorRef.current = null;
	}, []);
	useEffect(() => {
		if (failed) return;
		let raf = 0;
		let vfc = 0;
		const v = driveOnVideoFrames;
		const useVfc = !!v && !hasLiveGeometry && typeof v.requestVideoFrameCallback === "function";
		const draw = () => {
			const renderer = rendererRef.current;
			const container = containerRef.current;
			if (!renderer || !container) return;
			const frame = getFrame();
			if (frame && frame.w > 0 && frame.h > 0) {
				const cw = container.clientWidth;
				const ch = container.clientHeight;
				const surfNorm = Math.sqrt((cw * cw + ch * ch) / 2);
				const keys = lensKeysRef.current;
				const descs = state.current.map((s, i) => {
					const lw = readGlassValue(s.lensW);
					const lh = readGlassValue(s.lensH);
					const rad = s.radius != null ? readGlassValue(s.radius) : Math.min(lw, lh);
					const sx = readGlassValue(s.x);
					const sy = readGlassValue(s.y);
					const ehw = lw * s.scale;
					const ehh = lh * s.scale;
					const ownsShape = i > 0 && keys[i] !== keys[0];
					const ownMap = ownsShape ? perLensMaps.current.get(keys[i]) : void 0;
					const flat = ownsShape && !ownMap;
					return {
						originX: (sx * cw - ehw) / cw,
						originY: 1 - (sy * ch + ehh) / ch,
						sizeX: 2 * ehw / cw,
						sizeY: 2 * ehh / ch,
						scaleX: flat ? 0 : (s.merged.scaleX ?? s.merged.strength) * surfNorm / cw,
						scaleY: flat ? 0 : (s.merged.scaleY ?? s.merged.strength) * surfNorm / ch,
						dispersion: s.merged.dispersion,
						specular: s.merged.specular,
						blur: s.merged.frost,
						cornerRadius: rad * s.scale / cw,
						opacity: s.opacity,
						brightness: s.merged.brightness,
						dispMap: ownMap
					};
				});
				renderer.render(frame.source, frame.w, frame.h, descs);
			}
			if (useVfc) vfc = v.requestVideoFrameCallback(draw);
			else raf = requestAnimationFrame(draw);
		};
		if (useVfc) vfc = v.requestVideoFrameCallback(draw);
		else raf = requestAnimationFrame(draw);
		return () => {
			cancelAnimationFrame(raf);
			if (useVfc && vfc) v.cancelVideoFrameCallback?.(vfc);
		};
	}, [
		failed,
		getFrame,
		containerRef,
		driveOnVideoFrames,
		hasLiveGeometry
	]);
	return failed;
};
/**
* One liquid-glass lens over a `<video>` or a `<canvas>`, drawn with WebGL (the
* surfaces Safari refuses to apply an SVG filter to). It's the same lens
* vocabulary as `<Glass>`; the same generated displacement map drives a GPU
* shader instead of `feDisplacementMap`.
*
* Pass `src` for a video, or `draw` for a per-frame canvas scene — one component,
* either source, so you don't pick a different element per medium:
*
* ```tsx
* <GlassSurface src="/clip.mp4" lensW={60} lensH={60} />
* <GlassSurface draw={(ctx, t) => { …paint a frame… }} />
* ```
*/
var GlassSurface = ({ src, draw, poster, loop = true, muted = true, autoPlay = true, crossOrigin, paused, videoRef: externalVideoRef, lenses, width, height, lens, lensW = 90, lensH = 90, borderRadius, x = .5, y = .5, maxDpr = 1.5, className, style, children }) => {
	const isVideo = src != null;
	const containerRef = useRef(null);
	const outRef = useRef(null);
	const videoRef = useRef(null);
	const [video, setVideo] = useState(null);
	const setVideoEl = React.useCallback((el) => {
		videoRef.current = el;
		if (typeof externalVideoRef === "function") externalVideoRef(el);
		else if (externalVideoRef) externalVideoRef.current = el;
	}, [externalVideoRef]);
	const srcRef = useRef(null);
	const drawRef = useRef(draw);
	drawRef.current = draw;
	const startRef = useRef(0);
	if (!isVideo && !srcRef.current && typeof document !== "undefined") srcRef.current = document.createElement("canvas");
	const specs = (lenses && lenses.length ? lenses.map((l) => ({
		lens: l.optics ? {
			...lens,
			...l.optics
		} : lens,
		lensW: l.w / 2,
		lensH: l.h / 2,
		borderRadius: l.radius,
		x: l.x,
		y: l.y,
		scale: l.scale,
		opacity: l.opacity
	})) : [{
		lens,
		lensW,
		lensH,
		borderRadius,
		x,
		y
	}]).map(resolveLens);
	useEffect(() => {
		if (isVideo) setVideo(videoRef.current);
	}, [isVideo]);
	useEffect(() => {
		const v = videoRef.current;
		if (!isVideo || !v || paused === void 0) return;
		if (paused) v.pause();
		else v.play().catch(() => {});
	}, [isVideo, paused]);
	const failed = useLensRenderer(outRef, containerRef, React.useCallback(() => {
		if (isVideo) {
			const v = videoRef.current;
			if (!v || v.readyState < 2) return null;
			return {
				source: v,
				w: v.videoWidth,
				h: v.videoHeight
			};
		}
		const c = srcRef.current;
		const container = containerRef.current;
		if (!c || !container || !drawRef.current) return null;
		const w = width ?? Math.round(container.clientWidth);
		const h = height ?? Math.round(container.clientHeight);
		if (w === 0 || h === 0) return null;
		if (c.width !== w || c.height !== h) {
			c.width = w;
			c.height = h;
		}
		const ctx = c.getContext("2d");
		if (!ctx) return null;
		if (startRef.current === 0) startRef.current = performance.now();
		drawRef.current(ctx, performance.now() - startRef.current);
		return {
			source: c,
			w,
			h
		};
	}, [
		isVideo,
		width,
		height
	]), specs, maxDpr, isVideo ? video : null);
	return /* @__PURE__ */ React.createElement("div", {
		ref: containerRef,
		className,
		style: {
			position: "relative",
			overflow: "hidden",
			...style
		}
	}, isVideo && /* @__PURE__ */ React.createElement("video", {
		ref: setVideoEl,
		src,
		poster,
		loop,
		muted,
		autoPlay,
		playsInline: true,
		crossOrigin,
		style: {
			position: "absolute",
			inset: 0,
			width: "100%",
			height: "100%",
			objectFit: "cover",
			visibility: failed ? "visible" : "hidden"
		}
	}), /* @__PURE__ */ React.createElement("canvas", {
		ref: outRef,
		style: {
			position: "absolute",
			inset: 0,
			pointerEvents: "none",
			display: failed ? "none" : "block"
		}
	}), !isVideo && failed && /* @__PURE__ */ React.createElement("div", { style: {
		position: "absolute",
		inset: 0,
		display: "grid",
		placeItems: "center",
		color: "#888",
		font: "13px system-ui"
	} }, "WebGL unavailable"), children != null && /* @__PURE__ */ React.createElement("div", { style: {
		position: "absolute",
		inset: 0
	} }, children));
};
//#endregion
//#region ../src/GlassMaterial.tsx
/**
* Material mode — the friendly default for `<Glass>children</Glass>`.
*
* You style the wrapper however you like (a translucent `background` = the tint,
* a `border-radius`, padding, a size — via `className` / `style` / Tailwind) and
* this turns that box into glass: it frosts and refracts the LIVE page behind it,
* the translucent colour reads as a tint over the refraction, a soft bright edge
* rims it, and the children render crisp on top.
*
* The mechanism is one CSS property: `backdrop-filter`. It filters whatever is
* painted BEHIND the element (never the element's own content), so:
*   • `blur()` + `saturate()` frost the backdrop — cross-browser.
*   • ` url(#…)` runs an SVG displacement filter on the backdrop — the liquid
*     refraction — which ships in Blink (Chrome/Edge) only. Safari and Firefox
*     get the frost + tint + edge; the bend needs a copyable backdrop (an in-place
*     `<Glass>` over its own content, or `refract`), so material mode is honest about it.
*
* Because the colour you set is the glass tint, it must be TRANSLUCENT — a solid
* `background` is opaque and hides the refraction (not glass). We dev-warn when
* the computed background is fully opaque.
*/
/**
* Does this engine support `backdrop-filter: url(#…)` (a custom SVG filter on the
* backdrop)? Blink (Chrome/Edge/Opera) does; WebKit (Safari) and Gecko (Firefox)
* support `backdrop-filter: blur()` but NOT `url()`. `@supports`/probe-element
* tests are unreliable here (engines parse the `url()` syntax without rendering
* it), so sniff the engine — the same approach `useIsWebKit` uses.
*
* We bias toward a false NEGATIVE: if we're unsure, we leave `url()` OFF. A
* wrongly-disabled Blink just loses the bend (still frosts); a wrongly-ENABLED
* Safari would get `url()` in the value, which is invalid there and drops the
* WHOLE `backdrop-filter` — no frost at all. So only enable when confident.
*
* SSR-safe: `false` on the server + first client render (so hydration matches),
* then settles on mount.
*/
var useSupportsBackdropUrl = () => {
	const [ok, setOk] = useState(false);
	useEffect(() => {
		if (typeof navigator === "undefined") return;
		const ua = navigator.userAgent;
		setOk(navigator.userAgentData != null || /\b(?:Chrome|Chromium|Edg)\//.test(ua) && !/\b(?:CriOS|EdgiOS|FxiOS|OPiOS)\b/.test(ua) && !/iPhone|iPad|iPod/.test(ua));
	}, []);
	return ok;
};
/**
* The material default look — a subtle glass SURFACE (not a magnifying loupe).
* Gentle body, a soft rim meniscus, light chromatic edge, a directional sheen.
* `frost` here is the backdrop blur in PX (the CSS `blur()` radius), unlike the
* tiny obb/px frost the copy-based engine uses. Override any field via `optics`.
*/
var MATERIAL_OPTICS = {
	strength: .05,
	depth: .5,
	curvature: .3,
	bend: .45,
	bendWidth: .16,
	dispersion: .32,
	frost: 6,
	saturate: 1.15,
	sheen: .32,
	sheenWidth: 3,
	sheenFalloff: 1.5,
	glow: .1,
	glowSpread: 1,
	glowFalloff: .5,
	specular: 1,
	sheenAngle: 45,
	brightness: 0
};
/**
* The displacement + dispersion + specular primitive chain for the BACKDROP-filter
* context. `SourceGraphic` here IS the backdrop (the live page behind the
* element), so this refracts it directly — no copy. Simpler than the copy-based
* `LensFilterContents`: the element's own border-box (+ radius) clips the result,
* so there's no shape-cutout, and the frost lives in the CSS `blur()` ahead of
* this filter, so there's no in-filter blur. userSpaceOnUse throughout (px).
*/
var MaterialFilterContents = ({ dispScale, dispersion, specular, hasSpecular, mapMatrix, width, height, mapUrl, feImageRef }) => {
	const mapInput = mapMatrix ? "scaledMap" : "map";
	return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("feFlood", {
		floodColor: "rgb(128,128,128)",
		floodOpacity: "1",
		result: "mapBg"
	}), /* @__PURE__ */ React.createElement("feImage", {
		ref: feImageRef,
		href: mapUrl || void 0,
		x: 0,
		y: 0,
		width,
		height,
		preserveAspectRatio: "none",
		result: "rawMap"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "rawMap",
		in2: "mapBg",
		operator: "over",
		result: "map"
	}), mapMatrix && /* @__PURE__ */ React.createElement("feColorMatrix", {
		in: "map",
		type: "matrix",
		values: mapMatrix,
		result: "scaledMap"
	}), dispersion > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("feDisplacementMap", {
		in: "SourceGraphic",
		in2: mapInput,
		scale: dispScale * (1 + DISPERSION_SPREAD * dispersion),
		xChannelSelector: "R",
		yChannelSelector: "G"
	}), /* @__PURE__ */ React.createElement("feColorMatrix", {
		type: "matrix",
		values: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
		result: "refractR"
	}), /* @__PURE__ */ React.createElement("feDisplacementMap", {
		in: "SourceGraphic",
		in2: mapInput,
		scale: dispScale * (1 + DISPERSION_SPREAD * .5 * dispersion),
		xChannelSelector: "R",
		yChannelSelector: "G"
	}), /* @__PURE__ */ React.createElement("feColorMatrix", {
		type: "matrix",
		values: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
		result: "refractG"
	}), /* @__PURE__ */ React.createElement("feDisplacementMap", {
		in: "SourceGraphic",
		in2: mapInput,
		scale: dispScale,
		xChannelSelector: "R",
		yChannelSelector: "G"
	}), /* @__PURE__ */ React.createElement("feColorMatrix", {
		type: "matrix",
		values: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
		result: "refractB"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "refractR",
		in2: "refractG",
		operator: "arithmetic",
		k1: "0",
		k2: "1",
		k3: "1",
		k4: "0",
		result: "refractRG"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "refractRG",
		in2: "refractB",
		operator: "arithmetic",
		k1: "0",
		k2: "1",
		k3: "1",
		k4: "0",
		result: "lensOut"
	})) : /* @__PURE__ */ React.createElement("feDisplacementMap", {
		in: "SourceGraphic",
		in2: mapInput,
		scale: dispScale,
		xChannelSelector: "R",
		yChannelSelector: "G",
		result: "lensOut"
	}), hasSpecular && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("feColorMatrix", {
		in: "map",
		type: "matrix",
		values: `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 ${-128 / 255}`,
		result: "sheenMask"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "sheenMask",
		in2: "lensOut",
		operator: "arithmetic",
		k1: "0",
		k2: specular,
		k3: "1",
		k4: "0"
	})));
};
var num = (v) => v == null ? void 0 : isGlassMotionValue(v) ? readGlassValue(v) : v;
var GlassMaterial = ({ children, optics, radius, width, height, className, style, ...rest }) => {
	const supportsUrl = useSupportsBackdropUrl();
	const merged = useMemo(() => ({
		...DEFAULT_LENS_PARAMS,
		...MATERIAL_OPTICS,
		...optics
	}), [optics]);
	const baseId = useId().replace(/:/g, "");
	const wrapRef = useRef(null);
	const filterRef = useRef(null);
	const feImageRef = useRef(null);
	const generatorRef = useRef(null);
	const mapUrlRef = useRef("");
	const versionRef = useRef(0);
	const [box, setBox] = useState({
		w: 0,
		h: 0,
		r: 0,
		appliedR: void 0
	});
	const [needsRelative, setNeedsRelative] = useState(false);
	const sized = box.w > 0 && box.h > 0;
	const explicitR = num(radius);
	const explicitW = num(width);
	const explicitH = num(height);
	const styleHasRadius = style?.borderRadius != null;
	const adoptedRef = useRef(false);
	useLayoutEffect(() => {
		adoptedRef.current = false;
	}, [
		explicitR,
		styleHasRadius,
		className
	]);
	useLayoutEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const measure = () => {
			const rect = el.getBoundingClientRect();
			const hasCS = typeof getComputedStyle !== "undefined";
			const cs = hasCS ? getComputedStyle(el) : null;
			const own = cs ? parseFloat(cs.borderTopLeftRadius) || 0 : 0;
			if (cs) {
				const pos = cs.position;
				setNeedsRelative((prev) => pos === "static" ? true : pos === "relative" ? prev : false);
			}
			let r;
			let appliedR;
			if (explicitR != null) {
				r = explicitR;
				appliedR = explicitR;
			} else if (styleHasRadius || own > 0 && !adoptedRef.current) {
				r = own;
				appliedR = void 0;
			} else {
				let child = el.firstElementChild;
				while (child && child.hasAttribute("data-lg-layer")) child = child.nextElementSibling;
				const childR = child && hasCS ? parseFloat(getComputedStyle(child).borderTopLeftRadius) || 0 : 0;
				r = childR;
				appliedR = childR;
				adoptedRef.current = true;
			}
			setBox((prev) => prev.w === rect.width && prev.h === rect.height && prev.r === r && prev.appliedR === appliedR ? prev : {
				w: rect.width,
				h: rect.height,
				r,
				appliedR
			});
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		window.addEventListener("resize", measure);
		return () => {
			ro.disconnect();
			window.removeEventListener("resize", measure);
		};
	}, [
		explicitR,
		styleHasRadius,
		className
	]);
	const shapeKey = JSON.stringify([
		box.w,
		box.h,
		box.r,
		merged.mapSize,
		merged.clipToShape,
		merged.softEdge,
		merged.depth,
		merged.curvature,
		merged.splay,
		merged.bend,
		merged.bendWidth,
		merged.sheen,
		merged.sheenWidth,
		merged.sheenFalloff,
		merged.sheenAngle,
		merged.glow,
		merged.glowSpread,
		merged.glowFalloff
	]);
	const sx = merged.scaleX ?? merged.strength;
	const sy = merged.scaleY ?? merged.strength;
	const maxScale = Math.max(sx, sy);
	const dispScale = maxScale * (sized ? Math.sqrt((box.w * box.w + box.h * box.h) / 2) : 0);
	const margin = sized ? Math.ceil(dispScale * (merged.dispersion > 0 ? 1.2 : 1) * .5 + 28) : 0;
	const mapScaleX = maxScale > 0 ? sx / maxScale : 1;
	const mapScaleY = maxScale > 0 ? sy / maxScale : 1;
	const mapMatrix = mapScaleX === 1 && mapScaleY === 1 ? null : matrixForAxisScale(mapScaleX, mapScaleY);
	const hasSpecular = merged.glow > 0 || merged.sheen > 0;
	useLayoutEffect(() => {
		if (!sized) return;
		const mapSize = merged.mapSize;
		if (!generatorRef.current || generatorRef.current.size !== mapSize) {
			generatorRef.current?.gen.dispose();
			generatorRef.current = {
				gen: createLensMapGenerator(mapSize),
				size: mapSize
			};
		}
		const url = generatorRef.current.gen.generate({
			lensHalfWidth: box.w / 2,
			lensHalfHeight: box.h / 2,
			borderRadius: box.r,
			depth: merged.depth,
			clipToShape: merged.clipToShape,
			softEdge: merged.softEdge,
			sheenAngle: merged.sheenAngle,
			glow: merged.glow,
			glowSpread: merged.glowSpread,
			glowFalloff: merged.glowFalloff,
			sheen: merged.sheen,
			sheenWidth: merged.sheenWidth,
			sheenFalloff: merged.sheenFalloff,
			curvature: merged.curvature,
			splay: merged.splay,
			bend: merged.bend,
			bendWidth: merged.bendWidth
		});
		mapUrlRef.current = url;
		feImageRef.current?.setAttribute("href", url);
		applyBackdropFilter();
	}, [sized, shapeKey]);
	const applyBackdropFilter = useMemo(() => () => {
		const el = wrapRef.current;
		const filterEl = filterRef.current;
		if (!el) return;
		const frost = Math.max(0, merged.frost);
		const sat = merged.saturate ?? 1;
		const fns = [frost > 0 ? `blur(${frost}px)` : "", sat !== 1 ? `saturate(${sat})` : ""].filter(Boolean).join(" ");
		let value = fns || "none";
		if (supportsUrl && filterEl && mapUrlRef.current) {
			versionRef.current += 1;
			filterEl.id = `lg-mat-${baseId}-v${versionRef.current}`;
			value = `${fns ? fns + " " : ""}url(#${filterEl.id})`;
		}
		el.style.backdropFilter = value;
		el.style.setProperty("-webkit-backdrop-filter", value);
	}, [
		merged.frost,
		merged.saturate,
		supportsUrl,
		baseId
	]);
	useEffect(() => {
		if (sized) applyBackdropFilter();
	}, [
		sized,
		applyBackdropFilter,
		merged.dispersion,
		merged.strength,
		merged.scaleX,
		merged.scaleY,
		merged.specular
	]);
	useEffect(() => () => {
		generatorRef.current?.gen.dispose();
		generatorRef.current = null;
	}, []);
	const warnedRef = useRef(false);
	useEffect(() => {
		if (warnedRef.current || !sized || typeof getComputedStyle === "undefined" || typeof document === "undefined") return;
		const el = wrapRef.current;
		if (!el) return;
		const bg = getComputedStyle(el).backgroundColor;
		let opaque = false;
		try {
			const c = document.createElement("canvas");
			c.width = c.height = 1;
			const ctx = c.getContext("2d");
			if (ctx) {
				ctx.clearRect(0, 0, 1, 1);
				ctx.fillStyle = bg;
				ctx.fillRect(0, 0, 1, 1);
				opaque = ctx.getImageData(0, 0, 1, 1).data[3] === 255;
			}
		} catch {
			opaque = false;
		}
		if (opaque && typeof console !== "undefined") {
			console.warn("[liquid-glass] <Glass>: the wrapper's background is fully opaque, so it hides the refraction (no glass shows through). Give it an alpha (e.g. `bg-red-400/40` / `rgba(...,0.4)`). (An opaque `background-image` — a solid gradient or photo — hides it the same way.)");
			warnedRef.current = true;
		}
	}, [sized]);
	const edgeShadow = useMemo(() => {
		const g = Math.max(0, Math.min(1.5, merged.specular));
		return [`inset 0 1px 0 rgba(255,255,255,${(.55 * g).toFixed(3)})`, `inset 0 0 0 1px rgba(255,255,255,${(.12 * g).toFixed(3)})`].join(", ");
	}, [merged.specular]);
	const userPos = style?.position;
	const position = userPos != null && userPos !== "static" && userPos !== "unset" && userPos !== "initial" ? userPos : needsRelative ? "relative" : void 0;
	const brightnessLayer = merged.brightness !== 0 ? /* @__PURE__ */ React.createElement("div", {
		"aria-hidden": true,
		"data-lg-layer": "",
		style: {
			position: "absolute",
			inset: 0,
			pointerEvents: "none",
			borderRadius: "inherit",
			background: merged.brightness > 0 ? "#fff" : "#000",
			opacity: Math.min(1, Math.abs(merged.brightness))
		}
	}) : null;
	return /* @__PURE__ */ React.createElement("div", {
		ref: wrapRef,
		"data-liquid-glass": "material",
		className,
		style: {
			display: "inline-block",
			...style,
			...position != null ? { position } : null,
			...explicitW != null ? { width: explicitW } : null,
			...explicitH != null ? { height: explicitH } : null,
			...box.appliedR != null ? { borderRadius: box.appliedR } : null
		},
		...rest
	}, brightnessLayer, children, /* @__PURE__ */ React.createElement("div", {
		"aria-hidden": true,
		"data-lg-layer": "",
		style: {
			position: "absolute",
			inset: 0,
			pointerEvents: "none",
			borderRadius: "inherit",
			boxShadow: edgeShadow
		}
	}), /* @__PURE__ */ React.createElement("svg", {
		"aria-hidden": true,
		"data-lg-layer": "",
		width: 0,
		height: 0,
		style: {
			position: "absolute",
			width: 0,
			height: 0
		}
	}, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("filter", {
		ref: filterRef,
		id: `lg-mat-${baseId}-v0`,
		filterUnits: "userSpaceOnUse",
		primitiveUnits: "userSpaceOnUse",
		colorInterpolationFilters: "sRGB",
		x: -margin,
		y: -margin,
		width: box.w + 2 * margin,
		height: box.h + 2 * margin
	}, sized && /* @__PURE__ */ React.createElement(MaterialFilterContents, {
		dispScale,
		dispersion: merged.dispersion,
		specular: merged.specular,
		hasSpecular,
		mapMatrix,
		width: box.w,
		height: box.h,
		mapUrl: mapUrlRef.current || "",
		feImageRef
	})))));
};
//#endregion
//#region ../src/Glass.tsx
/**
* Resolve WebKit (Safari) on mount. SSR-safe: returns `false` on the server and
* the first client render — so hydration matches — then settles to the real
* value with a re-render. WebKit drives two behaviour gates: supersampling is
* forced off (see {@link GlassProps.filterResolution}) and the specular mask is
* sampled from the raw map.
*/
var useIsWebKit = () => {
	const [isWebKit, setIsWebKit] = useState(false);
	useEffect(() => {
		setIsWebKit(typeof navigator !== "undefined" && /^((?!chrome|chromium|android).)*safari/i.test(navigator.userAgent));
	}, []);
	return isWebKit;
};
/**
* The shared filter-primitive chain: generated map (R/G displacement, B
* specular) → optional axis rescale → RGB-split displacement for chromatic
* aberration → specular lift from the B channel → lens-rect hole/composite.
* Also used by the backdrop-filter glass surfaces so dock/menus run the exact
* same pipeline.
*/
var LensFilterContents = ({ lens, mapHref, feImageRef, mapMatrixRef, blurStdDeviation, specularFromRawMap, brightnessInFilter, filterW, filterH, clipShapeRef }) => {
	const lensSX = lens.scaleX ?? lens.strength;
	const lensSY = lens.scaleY ?? lens.strength;
	const maxScale = Math.max(lensSX, lensSY);
	const dispScale = maxScale * (filterW && filterH ? Math.sqrt((filterW * filterW + filterH * filterH) / 2) : 1);
	const mapScaleX = maxScale > 0 ? lensSX / maxScale : 0;
	const mapScaleY = maxScale > 0 ? lensSY / maxScale : 0;
	const needsMapScale = !(mapScaleX === 1 && mapScaleY === 1);
	const mapInput = needsMapScale ? "scaledMap" : "map";
	const hasBlur = lens.frost > 0 && !!blurStdDeviation;
	const sourceInput = hasBlur ? "blurred" : "SourceGraphic";
	const hasSpecular = lens.glow > 0 || lens.sheen > 0;
	const spec = lens.specular;
	const inFilterBrightness = brightnessInFilter && lens.brightness !== 0;
	const needsShape = hasBlur || inFilterBrightness;
	return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("feFlood", {
		floodColor: "rgb(128,128,128)",
		floodOpacity: "1",
		result: "mapBg"
	}), /* @__PURE__ */ React.createElement("feImage", {
		ref: feImageRef,
		"data-lens": "",
		href: mapHref,
		preserveAspectRatio: "none",
		result: "rawMap"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "rawMap",
		in2: "mapBg",
		operator: "over",
		result: "map"
	}), needsMapScale && /* @__PURE__ */ React.createElement("feColorMatrix", {
		ref: mapMatrixRef,
		in: "map",
		type: "matrix",
		values: matrixForAxisScale(mapScaleX, mapScaleY),
		result: "scaledMap"
	}), hasBlur && /* @__PURE__ */ React.createElement("feGaussianBlur", {
		in: "SourceGraphic",
		stdDeviation: blurStdDeviation,
		result: "blurred"
	}), needsShape && /* @__PURE__ */ React.createElement("feImage", {
		ref: clipShapeRef,
		"data-lens": "",
		href: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
		preserveAspectRatio: "none",
		result: "lensShape"
	}), lens.dispersion > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("feDisplacementMap", {
		"data-lens": "",
		in: sourceInput,
		in2: mapInput,
		scale: dispScale * (1 + DISPERSION_SPREAD * .5 * lens.dispersion),
		xChannelSelector: "R",
		yChannelSelector: "G"
	}), /* @__PURE__ */ React.createElement("feColorMatrix", {
		type: "matrix",
		values: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
		result: "refractR"
	}), /* @__PURE__ */ React.createElement("feDisplacementMap", {
		"data-lens": "",
		in: sourceInput,
		in2: mapInput,
		scale: dispScale,
		xChannelSelector: "R",
		yChannelSelector: "G"
	}), /* @__PURE__ */ React.createElement("feColorMatrix", {
		type: "matrix",
		values: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
		result: "refractG"
	}), /* @__PURE__ */ React.createElement("feDisplacementMap", {
		"data-lens": "",
		in: sourceInput,
		in2: mapInput,
		scale: dispScale * (1 - DISPERSION_SPREAD * .5 * lens.dispersion),
		xChannelSelector: "R",
		yChannelSelector: "G"
	}), /* @__PURE__ */ React.createElement("feColorMatrix", {
		type: "matrix",
		values: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
		result: "refractB"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "refractR",
		in2: "refractG",
		operator: "arithmetic",
		k1: "0",
		k2: "1",
		k3: "1",
		k4: "0",
		result: "refractRG"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "refractRG",
		in2: "refractB",
		operator: "arithmetic",
		k1: "0",
		k2: "1",
		k3: "1",
		k4: "0",
		result: "lensOut"
	})) : /* @__PURE__ */ React.createElement("feDisplacementMap", {
		"data-lens": "",
		in: sourceInput,
		in2: mapInput,
		scale: dispScale,
		xChannelSelector: "R",
		yChannelSelector: "G",
		result: "lensOut"
	}), hasSpecular && (lens.sheenDark ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("feColorMatrix", {
		in: specularFromRawMap ? "rawMap" : "map",
		type: "matrix",
		values: `0 0 ${-spec} 0 ${1 + 128 * spec / 255}  0 0 ${-spec} 0 ${1 + 128 * spec / 255}  0 0 ${-spec} 0 ${1 + 128 * spec / 255}  0 0 0 0 1`,
		result: "sheenMask"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "sheenMask",
		in2: "lensOut",
		operator: "arithmetic",
		k1: "1",
		k2: "0",
		k3: "0",
		k4: "0",
		result: "lensOut"
	})) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("feColorMatrix", {
		in: specularFromRawMap ? "rawMap" : "map",
		type: "matrix",
		values: `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 ${-128 / 255}`,
		result: "sheenMask"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "sheenMask",
		in2: "lensOut",
		operator: "arithmetic",
		k1: "0",
		k2: spec,
		k3: "1",
		k4: "0",
		result: "lensOut"
	}))), inFilterBrightness && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("feFlood", {
		"data-lens": "",
		floodColor: lens.brightness > 0 ? "white" : "black",
		floodOpacity: Math.abs(lens.brightness),
		result: "brightnessFlood"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "brightnessFlood",
		in2: "lensShape",
		operator: "in",
		result: "brightnessVeil"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "brightnessVeil",
		in2: "lensOut",
		operator: "over",
		result: "lensOut"
	})), needsShape ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("feComposite", {
		in: "lensOut",
		in2: "lensShape",
		operator: "in",
		result: "lensOut"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "SourceGraphic",
		in2: "lensShape",
		operator: "out",
		result: "cutoutSrc"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "lensOut",
		in2: "cutoutSrc",
		operator: "over"
	})) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("feFlood", {
		"data-lens": "",
		floodColor: "black",
		floodOpacity: "1",
		result: "lensMask"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "SourceGraphic",
		in2: "lensMask",
		operator: "out",
		result: "cutoutSrc"
	}), /* @__PURE__ */ React.createElement("feComposite", {
		in: "lensOut",
		in2: "cutoutSrc",
		operator: "over"
	})));
};
var GlassDOM = ({ children, lens, x = .5, y = .5, lensW, lensH, borderRadius, refractionTarget, refractionBackground = "transparent", overlay, tintColor, tintOpacity, tintBlur, shadowOpacity, restShadowOpacity, edgeBias, depth, scale, filterResolution = 1, brightnessInFilter = false, pixelUnits = false, live = false, onLensMapChange, className, style, ...rest }) => {
	const isWebKit = useIsWebKit();
	const isWebKitRef = useRef(isWebKit);
	isWebKitRef.current = isWebKit;
	const brightnessInFilterRef = useRef(brightnessInFilter);
	brightnessInFilterRef.current = brightnessInFilter;
	const pixelUnitsRef = useRef(pixelUnits);
	pixelUnitsRef.current = pixelUnits;
	const liveRef = useRef(live);
	liveRef.current = live;
	const filterResolutionRef = useRef(filterResolution);
	filterResolutionRef.current = filterResolution;
	const merged = useMemo(() => ({
		...DEFAULT_LENS_PARAMS,
		...lens
	}), [lens]);
	const mergedRef = useRef(merged);
	mergedRef.current = merged;
	const baseId = useId().replace(/:/g, "");
	const containerRef = useRef(null);
	const sourceRef = useRef(null);
	const refractionRef = useRef(null);
	const overlayClipRef = useRef(null);
	const brightnessRef = useRef(null);
	const tintRef = useRef(null);
	const blurRef = useRef(null);
	const shadowRef = useRef(null);
	const restShadowRef = useRef(null);
	const filterRef = useRef(null);
	const feImageRef = useRef(null);
	const shapeImageRef = useRef(null);
	const mapMatrixRef = useRef(null);
	const lensElsRef = useRef([]);
	const dispElsRef = useRef([]);
	const [size, setSize] = useState({
		w: 0,
		h: 0
	});
	const sizeRef = useRef(size);
	sizeRef.current = size;
	const sized = size.w > 0 && size.h > 0;
	const hasCopy = refractionTarget != null;
	const [autoBehind, setAutoBehind] = useState(null);
	useLayoutEffect(() => {
		if (!hasCopy || refractionBackground !== "transparent") {
			setAutoBehind(null);
			return;
		}
		if (typeof window === "undefined") return;
		let el = containerRef.current?.parentElement ?? null;
		let found = null;
		while (el) {
			const bg = getComputedStyle(el).backgroundColor;
			const parts = bg.match(/rgba?\(([^)]+)\)/)?.[1].split(",");
			if ((parts && parts[3] != null ? parseFloat(parts[3]) : 1) > .95) {
				found = bg;
				break;
			}
			el = el.parentElement;
		}
		setAutoBehind(found);
	}, [hasCopy, refractionBackground]);
	const bleedFill = refractionBackground !== "transparent" ? refractionBackground : autoBehind ?? "transparent";
	const xRef = useRef(.5);
	const yRef = useRef(.5);
	const halfWRef = useRef(merged.lensW);
	const halfHRef = useRef(merged.lensH);
	const radiusRef = useRef(merged.borderRadius);
	const hasWRef = useRef(lensW !== void 0);
	hasWRef.current = lensW !== void 0;
	const hasHRef = useRef(lensH !== void 0);
	hasHRef.current = lensH !== void 0;
	const hasRRef = useRef(borderRadius !== void 0);
	hasRRef.current = borderRadius !== void 0;
	const autoRadiusRef = useRef(0);
	const depthRef = useRef(merged.depth);
	const scaleXRef = useRef(merged.scaleX ?? merged.strength);
	const scaleYRef = useRef(merged.scaleY ?? merged.strength);
	const tintOpacityRef = useRef(1);
	const tintBlurRef = useRef(0);
	const shadowOpacityRef = useRef(1);
	const restShadowOpacityRef = useRef(0);
	const edgeBiasRef = useRef(.5);
	const lastLeftRef = useRef(NaN);
	const lastTopRef = useRef(NaN);
	const lastScaleRef = useRef(NaN);
	const zoomRef = useRef(1);
	const versionRef = useRef(0);
	const maskKeyRef = useRef("");
	const updateQueuedRef = useRef(false);
	const mapUrlRef = useRef(null);
	const shapeUrlRef = useRef(null);
	const generatorRef = useRef(null);
	const tintColorRef = useRef(tintColor);
	tintColorRef.current = tintColor;
	const onMapChangeRef = useRef(onLensMapChange);
	onMapChangeRef.current = onLensMapChange;
	const bleedNorm = size.w > 0 && size.h > 0 ? Math.sqrt((size.w * size.w + size.h * size.h) / 2) : 0;
	let bleedStrength = Math.max(merged.scaleX ?? merged.strength, merged.scaleY ?? merged.strength);
	if (bleedNorm > 0) {
		const fullLW = typeof lensW === "number" ? lensW * 2 : size.w;
		const fullLH = typeof lensH === "number" ? lensH * 2 : size.h;
		const dispFactor = 1 + DISPERSION_SPREAD * merged.dispersion;
		bleedStrength = Math.min(bleedStrength, Math.max(fullLW, fullLH) * .6 / (bleedNorm * dispFactor));
	}
	const bleed = pixelUnits && refractionTarget != null && size.w > 0 && size.h > 0 ? Math.ceil(bleedStrength * bleedNorm * (1 + DISPERSION_SPREAD * merged.dispersion) * .5 + merged.depth + 28) + 16 : 0;
	const bleedRef = useRef(bleed);
	bleedRef.current = bleed;
	useLayoutEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const measure = () => {
			const rect = el.getBoundingClientRect();
			if (!hasRRef.current && typeof getComputedStyle !== "undefined") {
				let r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
				const child = sourceRef.current?.firstElementChild;
				if (!r && child) r = parseFloat(getComputedStyle(child).borderTopLeftRadius) || 0;
				autoRadiusRef.current = r;
			}
			setSize((prev) => prev.w === rect.width && prev.h === rect.height ? prev : {
				w: rect.width,
				h: rect.height
			});
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		window.addEventListener("resize", measure);
		return () => {
			ro.disconnect();
			window.removeEventListener("resize", measure);
		};
	}, []);
	const updateGeometry = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;
		let w = sizeRef.current.w;
		let h = sizeRef.current.h;
		if (!(w > 0 && h > 0)) {
			const rect = container.getBoundingClientRect();
			w = rect.width;
			h = rect.height;
		}
		if (!(w > 0 && h > 0)) return;
		const lensParams = mergedRef.current;
		const sx = scaleXRef.current;
		const sy = scaleYRef.current;
		let maxScale = Math.max(sx, sy);
		const dispersion = lensParams.dispersion;
		const halfW = hasWRef.current ? halfWRef.current : w / 2;
		const halfH = hasHRef.current ? halfHRef.current : h / 2;
		const radius = hasRRef.current ? radiusRef.current : autoRadiusRef.current;
		let cx = xRef.current * w;
		let cy = yRef.current * h;
		if (pixelUnitsRef.current && refractionRef.current) {
			cx = Math.max(halfW, Math.min(w - halfW, cx));
			cy = Math.max(halfH, Math.min(h - halfH, cy));
		}
		const left = cx - halfW;
		const top = cy - halfH;
		const fullW = 2 * halfW;
		const fullH = 2 * halfH;
		if (pixelUnitsRef.current) {
			const norm = Math.sqrt((w * w + h * h) / 2);
			const dispFactor = 1 + DISPERSION_SPREAD * dispersion;
			const maxDisp = Math.max(fullW, fullH) * .6;
			if (norm > 0) maxScale = Math.min(maxScale, maxDisp / (norm * dispFactor));
		}
		const fr = filterResolutionRef.current;
		const G = fr !== 1 && !isWebKitRef.current ? fr : 1;
		const GZ = isWebKitRef.current ? G * zoomRef.current : G;
		const posChanged = left !== lastLeftRef.current || top !== lastTopRef.current;
		const scaleChanged = maxScale !== lastScaleRef.current;
		lastLeftRef.current = left;
		lastTopRef.current = top;
		lastScaleRef.current = maxScale;
		if (posChanged || scaleChanged || liveRef.current) {
			const bias = edgeBiasRef.current;
			const px = pixelUnitsRef.current;
			const norm = Math.sqrt((w * w + h * h) / 2);
			const dispMax = maxScale * norm * (1 + DISPERSION_SPREAD * dispersion) * .5;
			const m = Math.ceil(dispMax + depthRef.current + 28);
			const bld = px && refractionRef.current ? bleedRef.current : 0;
			const lx = String(px ? (left + bld + bias) * GZ : (left + bias) / w);
			const ly = String(px ? (top + bld + bias) * GZ : (top + bias) / h);
			const lw = String(px ? Math.max(0, fullW - 2 * bias) * GZ : Math.max(0, fullW - 2 * bias) / w);
			const lh = String(px ? Math.max(0, fullH - 2 * bias) * GZ : Math.max(0, fullH - 2 * bias) / h);
			for (const el of lensElsRef.current) {
				el.setAttribute("x", lx);
				el.setAttribute("y", ly);
				el.setAttribute("width", lw);
				el.setAttribute("height", lh);
			}
			if (scaleChanged) {
				const dispBase = px ? maxScale * norm * GZ : maxScale;
				const scales = dispersion > 0 ? [
					dispBase * (1 + DISPERSION_SPREAD * .5 * dispersion),
					dispBase,
					dispBase * (1 - DISPERSION_SPREAD * .5 * dispersion)
				] : [dispBase];
				const dispEls = dispElsRef.current;
				for (let i = 0; i < dispEls.length; i += 1) dispEls[i].setAttribute("scale", String(scales[i] ?? 0));
			}
			const filterEl = filterRef.current;
			if (filterEl) {
				if (px) {
					filterEl.setAttribute("x", "0");
					filterEl.setAttribute("y", "0");
					if (refractionRef.current) {
						filterEl.setAttribute("width", String((left + bld + fullW + m) * GZ));
						filterEl.setAttribute("height", String((top + bld + fullH + m) * GZ));
					} else {
						filterEl.setAttribute("width", String(w * GZ));
						filterEl.setAttribute("height", String(h * GZ));
					}
				}
				versionRef.current += 1;
				filterEl.id = `lg-${baseId}-v${versionRef.current}`;
				const url = mapUrlRef.current ? `url(#${filterEl.id})` : "";
				if (refractionRef.current) {
					if (refractionRef.current.style.filter !== url) refractionRef.current.style.filter = url;
					refractionRef.current.style.clipPath = `inset(${Math.max(0, top + bld) * G}px ${Math.max(0, w + bld - (left + fullW)) * G}px ${Math.max(0, h + bld - (top + fullH)) * G}px ${Math.max(0, left + bld) * G}px round ${radius * G}px)`;
					if (sourceRef.current && !overlayClipRef.current) sourceRef.current.style.filter = "";
				} else if (sourceRef.current && sourceRef.current.style.filter !== url) sourceRef.current.style.filter = url;
			}
		}
		if (overlayClipRef.current) overlayClipRef.current.style.clipPath = `inset(${Math.max(0, top) * G}px ${Math.max(0, w - (left + fullW)) * G}px ${Math.max(0, h - (top + fullH)) * G}px ${Math.max(0, left) * G}px round ${radius * G}px)`;
		if (brightnessRef.current && !overlayClipRef.current) brightnessRef.current.style.clipPath = `inset(${Math.max(0, top)}px ${Math.max(0, w - (left + fullW))}px ${Math.max(0, h - (top + fullH))}px ${Math.max(0, left)}px round ${radius}px)`;
		const placeLensLayer = (el, opacity) => {
			el.style.transform = `translate(${left}px, ${top}px)`;
			el.style.width = `${fullW}px`;
			el.style.height = `${fullH}px`;
			el.style.borderRadius = `${radius}px`;
			if (opacity !== void 0) el.style.opacity = String(opacity);
		};
		if (shadowRef.current) placeLensLayer(shadowRef.current, shadowOpacityRef.current);
		if (restShadowRef.current) placeLensLayer(restShadowRef.current, restShadowOpacityRef.current);
		if (blurRef.current) {
			blurRef.current.style.transform = `translate3d(${left}px, ${top}px, 0)`;
			blurRef.current.style.width = `${fullW}px`;
			blurRef.current.style.height = `${fullH}px`;
			blurRef.current.style.borderRadius = `${radius}px`;
			const { uri, key } = roundedRectMaskUri(fullW, fullH, radius);
			if (maskKeyRef.current !== key) {
				const mask = `url("${uri}")`;
				blurRef.current.style.maskImage = mask;
				blurRef.current.style.setProperty("-webkit-mask-image", mask);
				blurRef.current.style.maskSize = "100% 100%";
				blurRef.current.style.setProperty("-webkit-mask-size", "100% 100%");
				maskKeyRef.current = key;
			}
		}
		if (tintRef.current) {
			placeLensLayer(tintRef.current);
			const color = tintColorRef.current ?? "white";
			tintRef.current.style.background = `color-mix(in srgb, ${color} ${100 * tintOpacityRef.current}%, transparent)`;
			tintRef.current.style.opacity = "1";
			const blur = tintBlurRef.current > 0 ? `blur(${tintBlurRef.current}px)` : "none";
			tintRef.current.style.backdropFilter = blur;
			tintRef.current.style.setProperty("-webkit-backdrop-filter", blur);
		}
		if (mapMatrixRef.current) {
			const mx = maxScale > 0 ? sx / maxScale : 0;
			const my = maxScale > 0 ? sy / maxScale : 0;
			mapMatrixRef.current.setAttribute("values", matrixForAxisScale(mx, my));
		}
	}, [baseId]);
	const scheduleUpdate = useCallback(() => {
		if (updateQueuedRef.current) return;
		updateQueuedRef.current = true;
		queueMicrotask(() => {
			updateQueuedRef.current = false;
			updateGeometry();
		});
	}, [updateGeometry]);
	const forceGeometry = useCallback(() => {
		lastLeftRef.current = NaN;
		lastScaleRef.current = NaN;
		updateGeometry();
	}, [updateGeometry]);
	useEffect(() => {
		const readZoom = () => {
			const iw = window.innerWidth;
			const z = iw > 0 ? window.outerWidth / iw : 1;
			if (!(z > .2 && z < 12)) return 1;
			return Math.abs(z - 1) < .04 ? 1 : z;
		};
		const onResize = () => {
			const z = readZoom();
			if (Math.abs(z - zoomRef.current) > .002) {
				zoomRef.current = z;
				forceGeometry();
			}
		};
		onResize();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [forceGeometry]);
	const regenerate = useCallback(() => {
		const mapSize = mergedRef.current.mapSize;
		if (!generatorRef.current || generatorRef.current.size !== mapSize) {
			generatorRef.current?.gen.dispose();
			generatorRef.current = {
				gen: createLensMapGenerator(mapSize),
				size: mapSize
			};
		}
		const lensParams = mergedRef.current;
		const halfW = hasWRef.current ? halfWRef.current : sizeRef.current.w / 2;
		const halfH = hasHRef.current ? halfHRef.current : sizeRef.current.h / 2;
		const radius = hasRRef.current ? radiusRef.current : autoRadiusRef.current;
		const url = generatorRef.current.gen.generate({
			lensHalfWidth: halfW,
			lensHalfHeight: halfH,
			borderRadius: radius,
			depth: depthRef.current,
			clipToShape: lensParams.clipToShape,
			softEdge: lensParams.softEdge,
			sheenAngle: lensParams.sheenAngle,
			glow: lensParams.glow,
			glowSpread: lensParams.glowSpread,
			glowFalloff: lensParams.glowFalloff,
			sheen: lensParams.sheen,
			sheenWidth: lensParams.sheenWidth,
			sheenFalloff: lensParams.sheenFalloff,
			curvature: lensParams.curvature,
			splay: lensParams.splay,
			bend: lensParams.bend,
			bendWidth: lensParams.bendWidth
		});
		mapUrlRef.current = url;
		feImageRef.current?.setAttribute("href", url);
		if (lensParams.frost > 0 || brightnessInFilterRef.current && lensParams.brightness !== 0) {
			const shape = lensShapeMaskUri(2 * halfW, 2 * halfH, radius);
			shapeUrlRef.current = shape.uri;
			shapeImageRef.current?.setAttribute("href", shape.uri);
		}
		onMapChangeRef.current?.(url);
		forceGeometry();
	}, [forceGeometry]);
	const regenerateRef = useRef(regenerate);
	regenerateRef.current = regenerate;
	const shapeKey = JSON.stringify([
		merged.mapSize,
		merged.clipToShape,
		merged.softEdge,
		merged.sheenAngle,
		merged.glow,
		merged.glowSpread,
		merged.glowFalloff,
		merged.sheen,
		merged.sheenWidth,
		merged.sheenFalloff,
		merged.curvature,
		merged.splay,
		merged.bend,
		merged.bendWidth,
		isGlassMotionValue(lensW) ? "mv" : lensW ?? (size.w / 2 || merged.lensW),
		isGlassMotionValue(lensH) ? "mv" : lensH ?? (size.h / 2 || merged.lensH),
		isGlassMotionValue(borderRadius) ? "mv" : borderRadius ?? autoRadiusRef.current,
		isGlassMotionValue(depth) ? "mv" : depth ?? merged.depth,
		brightnessInFilter && merged.brightness !== 0
	]);
	useLayoutEffect(() => {
		const subs = [];
		const bind = (value, target, fallback, onChange = () => {
			if (!liveRef.current) scheduleUpdate();
		}) => {
			if (value === void 0) {
				target.current = fallback;
				return;
			}
			if (isGlassMotionValue(value)) {
				target.current = value.get();
				subs.push(value.on("change", (next) => {
					target.current = next;
					onChange();
				}));
			} else target.current = value;
		};
		bind(x, xRef, .5);
		bind(y, yRef, .5);
		bind(lensW ?? merged.lensW, halfWRef, merged.lensW);
		bind(lensH ?? merged.lensH, halfHRef, merged.lensH);
		bind(borderRadius ?? merged.borderRadius, radiusRef, merged.borderRadius);
		bind(depth ?? merged.depth, depthRef, merged.depth);
		bind(scale ?? merged.scaleX ?? merged.strength, scaleXRef, merged.scaleX ?? merged.strength);
		bind(scale ?? merged.scaleY ?? merged.strength, scaleYRef, merged.scaleY ?? merged.strength);
		bind(tintOpacity, tintOpacityRef, 1);
		bind(tintBlur, tintBlurRef, 0);
		bind(shadowOpacity, shadowOpacityRef, 1);
		bind(restShadowOpacity, restShadowOpacityRef, 0);
		bind(edgeBias, edgeBiasRef, .5);
		updateGeometry();
		return () => subs.forEach((unsub) => unsub());
	}, [
		x,
		y,
		lensW,
		lensH,
		borderRadius,
		depth,
		scale,
		tintOpacity,
		tintBlur,
		shadowOpacity,
		restShadowOpacity,
		edgeBias,
		merged,
		scheduleUpdate,
		updateGeometry
	]);
	const hasDispersion = merged.dispersion > 0;
	const hasBlur = merged.frost > 0;
	useLayoutEffect(() => {
		const filterEl = filterRef.current;
		lensElsRef.current = filterEl ? Array.from(filterEl.querySelectorAll("[data-lens]")) : [];
		dispElsRef.current = filterEl ? Array.from(filterEl.querySelectorAll("feDisplacementMap")) : [];
		if (feImageRef.current && mapUrlRef.current) feImageRef.current.setAttribute("href", mapUrlRef.current);
		if (shapeImageRef.current && shapeUrlRef.current) shapeImageRef.current.setAttribute("href", shapeUrlRef.current);
		forceGeometry();
	}, [
		sized,
		hasDispersion,
		hasBlur,
		merged.glow > 0 || merged.sheen > 0,
		merged.sheenDark,
		merged.scaleX,
		merged.scaleY,
		merged.strength,
		merged.brightness,
		brightnessInFilter,
		pixelUnits,
		isWebKit,
		refractionTarget != null,
		overlay != null,
		forceGeometry
	]);
	useLayoutEffect(() => {
		if (sized) forceGeometry();
	}, [
		size.w,
		size.h,
		bleed,
		forceGeometry
	]);
	useLayoutEffect(() => {
		if (!sized) return;
		regenerateRef.current();
	}, [sized, shapeKey]);
	useEffect(() => {
		const subs = [];
		let timer;
		const onChange = () => {
			clearTimeout(timer);
			timer = setTimeout(() => regenerateRef.current(), 90);
		};
		for (const value of [
			lensW,
			lensH,
			borderRadius,
			depth
		]) if (isGlassMotionValue(value)) subs.push(value.on("change", onChange));
		return () => {
			subs.forEach((unsub) => unsub());
			clearTimeout(timer);
		};
	}, [
		lensW,
		lensH,
		borderRadius,
		depth
	]);
	useEffect(() => () => {
		generatorRef.current?.gen.dispose();
		generatorRef.current = null;
		onMapChangeRef.current?.(null);
	}, []);
	useEffect(() => {
		if (!live || !sized) return;
		let raf = 0;
		const loop = () => {
			raf = requestAnimationFrame(loop);
			updateGeometry();
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [
		live,
		sized,
		updateGeometry
	]);
	const blurG = filterResolution !== 1 && !isWebKit ? filterResolution : 1;
	const blurStdDeviation = hasBlur && sized ? pixelUnits ? `${merged.frost * blurG}` : `${merged.frost / size.w} ${merged.frost / size.h}` : void 0;
	const G = filterResolution !== 1 && !isWebKit ? filterResolution : 1;
	const superSource = G > 1 && overlay == null && refractionTarget == null && sized;
	const autoFitWidth = overlay == null && refractionTarget == null && !superSource && lensW === void 0;
	const superWrap = (ref, content, outerStyle) => /* @__PURE__ */ React.createElement("div", {
		ref,
		style: {
			...outerStyle,
			position: "absolute",
			top: 0,
			left: 0,
			width: size.w * G,
			height: size.h * G,
			transform: `scale(${1 / G})`,
			transformOrigin: "top left"
		}
	}, /* @__PURE__ */ React.createElement("div", { style: {
		transform: `scale(${G})`,
		transformOrigin: "top left",
		width: size.w,
		height: size.h
	} }, content));
	const brightnessLayer = merged.brightness !== 0 && !brightnessInFilter ? /* @__PURE__ */ React.createElement("div", {
		ref: brightnessRef,
		style: {
			position: "absolute",
			inset: 0,
			pointerEvents: "none",
			background: merged.brightness > 0 ? "white" : "black",
			opacity: Math.abs(merged.brightness)
		}
	}) : null;
	const shadowLayer = (ref, shadow, insetShadow) => shadow || insetShadow ? /* @__PURE__ */ React.createElement("div", {
		ref,
		style: {
			position: "absolute",
			top: 0,
			left: 0,
			pointerEvents: "none",
			willChange: "transform",
			boxSizing: "border-box",
			boxShadow: [shadow, insetShadow ? `inset ${insetShadow}` : null].filter(Boolean).join(", ")
		}
	}) : null;
	return /* @__PURE__ */ React.createElement("div", {
		ref: containerRef,
		"data-liquid-glass": "",
		className,
		style: {
			contain: "layout",
			position: "relative",
			overflow: "visible",
			...autoFitWidth ? { width: "fit-content" } : null,
			...superSource ? { minHeight: size.h } : null,
			...style
		},
		...rest
	}, superSource ? superWrap(sourceRef, children, { willChange: "filter" }) : overlay == null && refractionTarget == null ? /* @__PURE__ */ React.createElement("div", {
		ref: sourceRef,
		style: autoFitWidth ? { willChange: "filter" } : {
			willChange: "filter",
			position: "relative",
			height: sized ? size.h : void 0,
			overflow: "hidden",
			contain: "paint"
		}
	}, children) : overlay == null && pixelUnits ? /* @__PURE__ */ React.createElement("div", {
		ref: sourceRef,
		style: {
			position: "absolute",
			inset: 0,
			isolation: "isolate"
		}
	}, children) : /* @__PURE__ */ React.createElement("div", {
		ref: overlay != null ? void 0 : sourceRef,
		style: overlay != null ? void 0 : { willChange: "filter" }
	}, children), refractionTarget != null && (pixelUnits ? /* @__PURE__ */ React.createElement("div", {
		ref: refractionRef,
		style: {
			position: "absolute",
			inset: -bleed,
			pointerEvents: "none",
			willChange: "filter, clip-path",
			background: bleedFill
		}
	}, /* @__PURE__ */ React.createElement("div", { style: {
		position: "absolute",
		inset: bleed
	} }, refractionTarget)) : G > 1 ? superWrap(refractionRef, refractionTarget, {
		pointerEvents: "none",
		willChange: "filter, clip-path",
		background: bleedFill
	}) : /* @__PURE__ */ React.createElement("div", {
		ref: refractionRef,
		style: {
			position: "absolute",
			inset: 0,
			pointerEvents: "none",
			willChange: "filter, clip-path",
			background: bleedFill
		}
	}, refractionTarget)), overlay != null && /* @__PURE__ */ React.createElement("div", {
		ref: overlayClipRef,
		style: {
			position: "absolute",
			inset: 0,
			pointerEvents: "none"
		}
	}, /* @__PURE__ */ React.createElement("div", {
		ref: sourceRef,
		style: { willChange: "filter" }
	}, overlay), brightnessLayer), /* @__PURE__ */ React.createElement("div", { style: {
		position: "absolute",
		inset: 0,
		pointerEvents: "none"
	} }, /* @__PURE__ */ React.createElement("svg", {
		viewBox: `0 0 ${size.w} ${size.h}`,
		width: "100%",
		height: "100%",
		style: { display: "block" }
	}, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("filter", {
		ref: filterRef,
		id: `lg-${baseId}-v0`,
		filterUnits: pixelUnits ? "userSpaceOnUse" : "objectBoundingBox",
		primitiveUnits: pixelUnits ? "userSpaceOnUse" : "objectBoundingBox",
		colorInterpolationFilters: "sRGB",
		x: 0,
		y: 0,
		width: pixelUnits ? size.w * G : 1,
		height: pixelUnits ? size.h * G : 1
	}, sized && /* @__PURE__ */ React.createElement(LensFilterContents, {
		lens: {
			...merged,
			scaleX: scale !== void 0 ? readGlassValue(scale) : merged.scaleX ?? merged.strength,
			scaleY: scale !== void 0 ? readGlassValue(scale) : merged.scaleY ?? merged.strength
		},
		mapHref: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
		feImageRef,
		mapMatrixRef,
		blurStdDeviation,
		specularFromRawMap: isWebKit,
		brightnessInFilter,
		filterW: pixelUnits ? size.w * G : void 0,
		filterH: pixelUnits ? size.h * G : void 0,
		clipShapeRef: shapeImageRef
	})))), overlay == null && brightnessLayer, tintColor !== void 0 && /* @__PURE__ */ React.createElement("div", {
		ref: tintRef,
		style: {
			position: "absolute",
			top: 0,
			left: 0,
			pointerEvents: "none",
			overflow: "hidden",
			willChange: "transform"
		}
	})), hasBlur && children == null && refractionTarget == null && overlay == null && /* @__PURE__ */ React.createElement("div", {
		ref: blurRef,
		style: {
			position: "absolute",
			top: 0,
			left: 0,
			pointerEvents: "none",
			willChange: "backdrop-filter, transform",
			backdropFilter: `blur(${merged.frost}px)`,
			WebkitBackdropFilter: `blur(${merged.frost}px)`
		}
	}), shadowLayer(shadowRef, merged.edgeShadow, merged.edgeInsetShadow), shadowLayer(restShadowRef, merged.restEdgeShadow, merged.restEdgeInsetShadow));
};
var useHalf = (v) => useMemo(() => v == null ? void 0 : isGlassMotionValue(v) ? deriveGlass([v], () => v.get() / 2) : v / 2, [v]);
/** The public {@link GlassProps} adapter over the internal DOM + WebGL impls. It
*  translates the full-px / `optics` / `refract` vocabulary to the engine's, and
*  routes to the WebGL surface when `src` or `draw` is given. See {@link GlassProps}. */
var Glass = (props) => {
	const { children, width, height, size, radius, center, optics, refract, behind, src, draw, lenses, videoRef, paused, poster, loop, muted, autoPlay, crossOrigin, maxDpr, unstable_lens, ...restProps } = props;
	const rest = {
		...restProps,
		...unstable_lens ?? {}
	};
	const cx = center?.x;
	const cy = center?.y;
	const [sw, sh] = Array.isArray(size) ? size : size != null ? [size, size] : [void 0, void 0];
	const lensW = useHalf(width ?? sw);
	const lensH = useHalf(height ?? sh);
	if (src != null || draw != null) return /* @__PURE__ */ React.createElement(GlassSurface, {
		src,
		draw,
		lens: optics,
		lenses,
		videoRef,
		paused,
		poster,
		loop,
		muted,
		autoPlay,
		crossOrigin,
		maxDpr,
		lensW,
		lensH,
		borderRadius: radius,
		x: cx,
		y: cy,
		className: props.className,
		style: props.style
	}, children);
	const { overlay, tintColor, tintOpacity, tintBlur, shadowOpacity, restShadowOpacity, edgeBias, brightnessInFilter, depth, scale, filterResolution, pixelUnits, live, onLensMapChange, ...htmlRest } = rest;
	const animatedGeometry = isGlassMotionValue(width) || isGlassMotionValue(height) || isGlassMotionValue(radius) || isGlassMotionValue(sw) || isGlassMotionValue(sh) || isGlassMotionValue(cx) || isGlassMotionValue(cy);
	if (children != null && refract == null && src == null && draw == null && lenses == null && overlay == null && !pixelUnits && tintColor == null && tintOpacity == null && tintBlur == null && shadowOpacity == null && restShadowOpacity == null && edgeBias == null && !brightnessInFilter && filterResolution == null && !live && depth == null && scale == null && onLensMapChange == null && cx == null && cy == null && !animatedGeometry) return /* @__PURE__ */ React.createElement(GlassMaterial, {
		...htmlRest,
		optics,
		radius,
		width: width ?? sw,
		height: height ?? sh
	}, children);
	return /* @__PURE__ */ React.createElement(GlassDOM, {
		...rest,
		lensW,
		lensH,
		borderRadius: radius,
		x: cx,
		y: cy,
		lens: optics,
		refractionTarget: refract,
		refractionBackground: behind
	}, children);
};
//#endregion
//#region ../src/interaction.tsx
/**
* Opt-in motion helpers for building interactive glass controls: a
* velocity-driven squash-and-stretch spring, a rubber-band easing for
* over-drag, and a transform-only motion div. None are required to use
* `<Glass>` — recipes use them to make a control feel alive.
*/
var SPRING_STIFFNESS = 176;
var SPRING_DAMPING = 13.6;
var STRETCH_CEILING = .34;
var SPEED_SHAPE = .75;
var SPEED_DIVISOR = 84;
var MAX_STEP = .033;
var VEL_DT_MIN = .008;
var VEL_DT_MAX = .03;
/**
* Velocity-driven squash-and-stretch spring. Watches a position signal, derives
* its velocity, and runs an underdamped spring on `stretch` toward
* `min(STRETCH_CEILING, max(speed-response, hold))`. While `holdRef.current` > 0
* (press-and-hold) the lens stays stretched. `stretch` then drives
* lensW · (1 − 0.2·s) and lensH · (1 + 0.4·s).
*/
var useLensWobble = (position, stretch, holdRef, kickRef) => {
	useEffect(() => {
		let frame = 0;
		let displacement = 0;
		let speedValue = 0;
		let prevStamp = 0;
		let prevPosition = position.get();
		let active = false;
		const stretchTarget = (pointerSpeed) => {
			const fromSpeed = Math.pow(pointerSpeed, SPEED_SHAPE) / SPEED_DIVISOR;
			const responsive = fromSpeed < STRETCH_CEILING ? fromSpeed : STRETCH_CEILING;
			const held = holdRef.current;
			const raised = responsive > held ? responsive : held;
			return raised < STRETCH_CEILING ? raised : STRETCH_CEILING;
		};
		const settled = (pointerSpeed) => Math.abs(displacement) < 6e-4 && Math.abs(speedValue) < .006 && pointerSpeed < .006 && holdRef.current === 0;
		const step = (now) => {
			const gap = (now - prevStamp) / 1e3;
			const dt = gap < MAX_STEP ? gap : MAX_STEP;
			prevStamp = now;
			const pos = position.get();
			const velDt = gap < VEL_DT_MIN ? VEL_DT_MIN : gap > VEL_DT_MAX ? VEL_DT_MAX : gap;
			const pointerSpeed = Math.abs((pos - prevPosition) / velDt);
			prevPosition = pos;
			const accel = SPRING_STIFFNESS * (stretchTarget(pointerSpeed) - displacement) - SPRING_DAMPING * speedValue;
			speedValue += accel * dt;
			displacement += speedValue * dt;
			stretch.set(displacement);
			if (settled(pointerSpeed)) {
				active = false;
				stretch.set(0);
				return;
			}
			frame = requestAnimationFrame(step);
		};
		const begin = () => {
			if (active) return;
			active = true;
			prevStamp = performance.now();
			prevPosition = position.get();
			frame = requestAnimationFrame(step);
		};
		kickRef.current = begin;
		const detach = position.on("change", begin);
		return () => {
			detach();
			cancelAnimationFrame(frame);
			kickRef.current = () => {};
		};
	}, [
		position,
		stretch,
		holdRef,
		kickRef
	]);
};
/**
* Rubber-band overshoot for dragging past the ends — a cubic ease-out of the
* normalized excess, expanded inline (1−(1−t)³ = t·(3 + t·(t−3))).
*/
var rubberBand = (excess, limit, range) => {
	const t = excess < range ? excess / range : 1;
	return limit * t * (3 + t * (t - 3));
};
/**
* Minimal motion.div: composes translateX/scale from signals without
* re-rendering (the glass controls animate at 60fps during interaction).
*/
var GlassDiv = React.forwardRef(({ x, scaleX, scaleY, style, children, ...rest }, forwardedRef) => {
	const nodeRef = useRef(null);
	useEffect(() => {
		const node = nodeRef.current;
		if (!node) return;
		const sources = [
			x,
			scaleX,
			scaleY
		].filter((v) => v != null);
		const compose = () => {
			let transform = "";
			if (x) transform = `translateX(${x.get()}px)`;
			if (scaleX || scaleY) {
				const sx = scaleX ? scaleX.get() : 1;
				const sy = scaleY ? scaleY.get() : 1;
				transform += `${transform ? " " : ""}scale(${sx}, ${sy})`;
			}
			node.style.transform = transform;
		};
		compose();
		const detaches = sources.map((v) => v.on("change", compose));
		return () => detaches.forEach((off) => off());
	}, [
		x,
		scaleX,
		scaleY
	]);
	return /* @__PURE__ */ React.createElement("div", {
		ref: (node) => {
			nodeRef.current = node;
			if (typeof forwardedRef === "function") forwardedRef(node);
			else if (forwardedRef) forwardedRef.current = node;
		},
		style,
		...rest
	}, children);
});
GlassDiv.displayName = "GlassDiv";
//#endregion
export { Glass, GlassDiv, animateGlassValue, cubicBezier, deriveGlass, glassEase, glassValue, rubberBand, useLensWobble };
