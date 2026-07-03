import { Container, Glass, Html, Renderer, Scene } from '../vendor/liquid-dom/core/index.js';

const BACKDROP_URL = new URL('../assets/bg.jpg', import.meta.url);
const pointer = { x: 0, y: 0 };
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const backdropImage = {
  width: 1024,
  height: 704,
};

const backdropProbe = new Image();
backdropProbe.onload = () => {
  backdropImage.width = backdropProbe.naturalWidth || backdropImage.width;
  backdropImage.height = backdropProbe.naturalHeight || backdropImage.height;
};
backdropProbe.src = BACKDROP_URL.href;

window.addEventListener('pointermove', (event) => {
  pointer.x = event.clientX / Math.max(window.innerWidth, 1) - 0.5;
  pointer.y = event.clientY / Math.max(window.innerHeight, 1) - 0.5;
}, { passive: true });

const apiAvailable =
  Boolean(navigator.gpu) &&
  Boolean(globalThis.GPUQueue?.prototype) &&
  'copyElementImageToTexture' in globalThis.GPUQueue.prototype;

if (!apiAvailable) {
  window.__liquidDomStatus = 'unavailable';
  document.body.classList.add('liquid-dom-unavailable');
  startCssBackdropMotion();
} else {
  window.__liquidDomStatus = 'starting';
  startLiquidDom();
}

function getBackdropMotion(timeMs) {
  if (prefersReducedMotion) {
    return { x: pointer.x * 10, y: pointer.y * 7 };
  }

  const time = timeMs / 1000;
  return {
    x: Math.sin(time * 0.34) * 28 + Math.sin(time * 0.11) * 18 + pointer.x * 24,
    y: Math.cos(time * 0.27) * 22 + Math.sin(time * 0.16) * 12 + pointer.y * 18,
  };
}

function applyBackdropVars(x, y) {
  document.documentElement.style.setProperty('--bg-drift-x', `calc(50% + ${x.toFixed(2)}px)`);
  document.documentElement.style.setProperty('--bg-drift-y', `calc(50% + ${y.toFixed(2)}px)`);
}

function getBackdropBox(motion) {
  const viewportWidth = Math.max(window.innerWidth, 1);
  const viewportHeight = Math.max(window.innerHeight, 1);
  const imageRatio = Math.max(backdropImage.width / Math.max(backdropImage.height, 1), 0.1);
  let width = viewportWidth * 1.18;
  let height = width / imageRatio;

  if (height < viewportHeight * 1.08) {
    height = viewportHeight * 1.08;
    width = height * imageRatio;
  }

  return {
    width,
    height,
    left: (viewportWidth - width) / 2 + motion.x,
    top: (viewportHeight - height) / 2 + motion.y,
  };
}

function syncCardReflections(elements, motion, timeMs) {
  const backdropBox = getBackdropBox(motion);
  const time = timeMs / 1000;
  const viewportWidth = Math.max(window.innerWidth, 1);
  const viewportHeight = Math.max(window.innerHeight, 1);

  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    if (rect.bottom < -40 || rect.top > viewportHeight + 40) continue;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const normalizedX = centerX / viewportWidth - 0.5;
    const normalizedY = centerY / viewportHeight - 0.5;
    const parallaxX = pointer.x * 28 - normalizedX * 16 + Math.sin(time * 0.8 + centerX * 0.012) * 7;
    const parallaxY = pointer.y * 20 - normalizedY * 12 + Math.cos(time * 0.66 + centerY * 0.01) * 5;
    const lensX = pointer.x * 22 - normalizedX * 22 + Math.sin(time * 1.08 + centerY * 0.011) * 9;
    const lensY = pointer.y * 16 - normalizedY * 16 + Math.cos(time * 0.94 + centerX * 0.009) * 7;
    const edgeX = 18 + Math.abs(normalizedX) * 16 + Math.abs(pointer.x) * 14;
    const edgeY = 12 + Math.abs(normalizedY) * 12 + Math.abs(pointer.y) * 10;
    const glareX = 50 + pointer.x * 52 - normalizedX * 26 + Math.sin(time * 0.55 + normalizedX) * 12;
    const glareY = 18 + pointer.y * 38 - normalizedY * 18 + Math.cos(time * 0.42 + normalizedY) * 8;
    const opacity = 0.36 + Math.min(0.18, Math.hypot(pointer.x, pointer.y) * 0.16);
    const rimOpacity = 0.58 + Math.min(0.22, Math.hypot(pointer.x, pointer.y) * 0.22);
    const prismAngle = 118 + normalizedX * 22 + pointer.x * 18 + Math.sin(time * 0.38 + normalizedY) * 8;

    element.style.setProperty('--card-reflect-x', `${(backdropBox.left - rect.left + parallaxX).toFixed(2)}px`);
    element.style.setProperty('--card-reflect-y', `${(backdropBox.top - rect.top + parallaxY).toFixed(2)}px`);
    element.style.setProperty('--card-reflect-w', `${backdropBox.width.toFixed(2)}px`);
    element.style.setProperty('--card-reflect-h', `${backdropBox.height.toFixed(2)}px`);
    element.style.setProperty('--card-lens-x', `${lensX.toFixed(2)}px`);
    element.style.setProperty('--card-lens-y', `${lensY.toFixed(2)}px`);
    element.style.setProperty('--card-edge-x', `${edgeX.toFixed(2)}px`);
    element.style.setProperty('--card-edge-y', `${edgeY.toFixed(2)}px`);
    element.style.setProperty('--card-reflect-glare-x', `${Math.max(-10, Math.min(110, glareX)).toFixed(2)}%`);
    element.style.setProperty('--card-reflect-glare-y', `${Math.max(-10, Math.min(90, glareY)).toFixed(2)}%`);
    element.style.setProperty('--card-reflect-opacity', opacity.toFixed(3));
    element.style.setProperty('--card-rim-opacity', rimOpacity.toFixed(3));
    element.style.setProperty('--card-prism-angle', `${prismAngle.toFixed(2)}deg`);
  }
}

function installCardGlassLayers(elements) {
  for (const element of elements) {
    if (element.querySelector(':scope > .card-glass-lens')) continue;

    const lens = document.createElement('span');
    lens.className = 'card-glass-lens';
    lens.setAttribute('aria-hidden', 'true');

    const rim = document.createElement('span');
    rim.className = 'card-glass-rim';
    rim.setAttribute('aria-hidden', 'true');

    element.prepend(rim);
    element.prepend(lens);
  }
}

function startCssBackdropMotion() {
  const cardElements = [...document.querySelectorAll('.card')];
  installCardGlassLayers(cardElements);
  let frameId = 0;
  const frame = (timeMs) => {
    const motion = getBackdropMotion(timeMs);
    applyBackdropVars(motion.x, motion.y);
    syncCardReflections(cardElements, motion, timeMs);
    frameId = requestAnimationFrame(frame);
  };

  frameId = requestAnimationFrame(frame);
  window.addEventListener('pagehide', () => cancelAnimationFrame(frameId), { once: true });
}

function startLiquidDom() {
  const targets = [...document.querySelectorAll('.menu-panel, .present-btn, .card')];
  const cardElements = targets.filter((element) => element.classList.contains('card'));
  if (targets.length === 0) return;
  installCardGlassLayers(cardElements);

  document.body.classList.add('liquid-dom-active');

  const scene = new Scene();
  const backdropElement = document.createElement('div');
  backdropElement.className = 'liquid-dom-backdrop';
  backdropElement.style.backgroundImage = [
    'linear-gradient(112deg, rgba(3, 5, 13, 0.62), rgba(5, 12, 25, 0.34) 42%, rgba(28, 8, 34, 0.36))',
    `url("${BACKDROP_URL}")`,
  ].join(', ');
  backdropElement.style.backgroundSize = 'auto, 118% auto';
  backdropElement.style.backgroundPosition = 'center, 50% 50%';

  const backdrop = scene.add(new Html({
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
    zIndex: -2,
    element: backdropElement,
  }));

  const container = new Container({
    blur: 4,
    spacing: 6,
    bezelWidth: 34,
    thickness: 150,
    displacementFactor: 3.25,
    displacementBlur: 2.5,
    ior: 1.62,
    contentIor: 1.12,
    contentDepth: 42,
    dispersion: 0.17,
    surfaceProfile: 'convex',
    specularStrength: 2.45,
    specularWidth: 3.2,
    specularFalloff: 0.52,
    specularSharpness: 5.2,
    specularOpacity: 0.98,
    oppositeSpecularStrength: 0.88,
    reflectionOffset: 46,
    tint: { r: 0.09, g: 0.12, b: 0.17, a: 0.24 },
    shadowColor: { r: 0, g: 0, b: 0, a: 0.32 },
    shadowOffsetY: 16,
    shadowBlur: 34,
    zIndex: 1,
  });

  const glassEntries = targets.map((element) => {
    const glass = new Glass({
      width: 1,
      height: 1,
      cornerRadius: 8,
      cornerSmoothing: 0.62,
      pointerEvents: false,
    });
    container.add(glass);
    return { element, glass };
  });

  scene.add(container);

  const renderer = new Renderer({ scene, maxDpr: 2 });
  renderer.canvas.className = 'liquid-dom-canvas';
  document.body.prepend(renderer.canvas);
  window.__liquidDomStatus = 'active';

  const syncGeometry = (motion) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    backdrop.width = viewportWidth;
    backdrop.height = viewportHeight;
    syncCardReflections(cardElements, motion, performance.now());

    for (const entry of glassEntries) {
      const rect = entry.element.getBoundingClientRect();
      entry.glass.x = rect.left;
      entry.glass.y = rect.top;
      entry.glass.width = Math.max(1, rect.width);
      entry.glass.height = Math.max(1, rect.height);
      entry.glass.zIndex = rect.bottom < -40 || rect.top > viewportHeight + 40 ? -10 : 0;
    }
  };

  const setLightFromPointer = (event) => {
    container.lightDirection = Math.atan2(pointer.y, pointer.x);
    container.reflectionOffset = 34 + Math.min(26, Math.hypot(pointer.x, pointer.y) * 40);
  };

  window.addEventListener('pointermove', setLightFromPointer, { passive: true });

  let frameId = 0;
  let failed = false;
  const frame = () => {
    if (failed) return;
    const motion = getBackdropMotion(performance.now());
    applyBackdropVars(motion.x, motion.y);
    backdropElement.style.backgroundPosition =
      `center, calc(50% + ${motion.x.toFixed(2)}px) calc(50% + ${motion.y.toFixed(2)}px)`;
    backdropElement.dispatchEvent(new Event('paint', { bubbles: true }));
    syncGeometry(motion);
    try {
      renderer.render();
      frameId = requestAnimationFrame(frame);
    } catch (error) {
      failed = true;
      window.__liquidDomStatus = `error: ${error instanceof Error ? error.message : String(error)}`;
      document.body.classList.remove('liquid-dom-active');
      document.body.classList.add('liquid-dom-unavailable');
      renderer.canvas.remove();
      renderer.destroy();
      console.warn('Liquid DOM disabled; falling back to CSS glass.', error);
    }
  };

  frame();

  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frameId);
    renderer.destroy();
  }, { once: true });
}
