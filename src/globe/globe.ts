import { geoArea, geoBounds, geoCentroid, geoContains, geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo';
import { feature, merge, mesh } from 'topojson-client';
import type { Feature, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';

/*
  The globe: an Earth drawn on a canvas, with sea and land of its own colours, lit from the
  upper left and dark on the far side, inside a thin halo of air. It turns slowly by itself
  until the reader takes hold of it. Countries where a book is set carry a wash of the accent
  colour, deeper the more books there are, and a pin.

  Two sets of outlines are loaded. The coarse one is drawn while the globe moves, the fine
  one once it rests, so that turning stays smooth.
*/

type Shape = Feature<Polygon | MultiPolygon>;

interface Country {
  code: string;
  shape: Shape;
  /** The middle of its largest piece of land: [longitude, latitude]. */
  centre: [number, number];
  /** How many degrees that piece spans, for choosing how far to zoom in on it. */
  span: number;
  bounds: [[number, number], [number, number]];
}

interface World {
  countries: Country[];
  /** Every country as one piece of land, to colour in a single stroke. */
  land: MultiPolygon;
  /** The lines between countries, without the coasts. */
  borders: MultiLineString;
  coasts: MultiLineString;
}

/* The Earth's own colours, for a dark room and for a light one. */
const EARTH = {
  dark: { seaLit: '#1d3a57', sea: '#0f2238', seaFar: '#060d17', land: '#3b392e', air: '128, 170, 226', night: 0.62, glint: 0.1 },
  light: { seaLit: '#c3d8e8', sea: '#93b3cb', seaFar: '#5f819b', land: '#e6dfcb', air: '96, 142, 200', night: 0.4, glint: 0.3 },
};

export interface GlobeOptions {
  /** Books set in each country, by two-letter code. */
  counts: Map<string, number>;
  onHover: (code: string | null, at: { x: number; y: number } | null) => void;
  onSelect: (code: string | null) => void;
}

export interface GlobeHandle {
  select: (code: string | null) => void;
  /** Changes which countries are lit, when the reader moves to another period. */
  setCounts: (counts: Map<string, number>) => void;
  destroy: () => void;
}

const TURN = 2.2; // degrees a second, when left alone
const REST_MS = 5000; // how long after the reader lets go before it turns by itself again
const FLY_MS = 1500;
const MAX_ZOOM = 5;
const MAX_TILT = 78;
const PIN_REACH = 12; // px around a pin that still counts as pointing at its country

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const easeInOutSine = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

function readWorld(topology: Topology): World {
  const object = topology.objects.countries as GeometryCollection;
  const shapes = (feature(topology, object) as unknown as { features: Shape[] }).features;
  const countries: Country[] = [];
  for (const shape of shapes) {
    if (typeof shape.id !== 'string') continue;
    // A country's far-flung territories would drag its middle out to sea.
    const pieces: Polygon[] =
      shape.geometry.type === 'Polygon'
        ? [shape.geometry]
        : shape.geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }));
    const main = pieces.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
    const [[west, south], [east, north]] = geoBounds(main);
    countries.push({
      code: shape.id,
      shape,
      centre: geoCentroid(main),
      span: Math.max(north - south, east >= west ? east - west : east + 360 - west),
      bounds: geoBounds(shape),
    });
  }
  return {
    countries,
    land: merge(topology, object.geometries as Parameters<typeof merge>[1]),
    borders: mesh(topology, object, (a, b) => a !== b),
    coasts: mesh(topology, object, (a, b) => a === b),
  };
}

const inBounds = ([[west, south], [east, north]]: Country['bounds'], [lon, lat]: [number, number]) =>
  lat >= south && lat <= north && (west <= east ? lon >= west && lon <= east : lon >= west || lon <= east);

export function createGlobe(canvas: HTMLCanvasElement, options: GlobeOptions): GlobeHandle {
  const context = canvas.getContext('2d')!;
  // The layer the pins are lit on: the same size as the globe's, over it, and deaf to the mouse.
  const over = document.createElement('canvas');
  over.className = 'globe-canvas globe-pins';
  over.setAttribute('aria-hidden', 'true');
  canvas.after(over);
  const lights = over.getContext('2d')!;
  const pins: { x: number; y: number; chosen: boolean; over: boolean; beat: number }[] = [];
  const projection = geoOrthographic().clipAngle(90).precision(0.4);
  const path = geoPath(projection, context);
  const graticule = geoGraticule10();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let counts = options.counts;
  let most = Math.max(1, ...counts.values());

  let coarse: World | null = null;
  let fine: World | null = null;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let colours = { text: '#ece8df', accent: '#c9a45c', bg: '#0c0c0d' };
  let earth = EARTH.dark;

  let rotation: [number, number] = [-12, -18];
  let zoom = 1;
  let spin: [number, number] = [0, 0]; // degrees a frame, left over from a drag
  let hovered: string | null = null;
  let selected: string | null = null;
  let fly: { from: [number, number]; to: [number, number]; zoomFrom: number; zoomTo: number; start: number } | null = null;
  let touched = -Infinity;
  let dirty = true;
  let moving = false;
  let before = performance.now();
  let frame = 0;
  let stopped = false;

  // The halo of air reaches a tenth of the radius past the edge, and is given room for it.
  const radius = () => (Math.min(width, height) / 2 / 1.1) * zoom;

  const resize = () => {
    const box = canvas.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = box.width;
    height = box.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    over.width = canvas.width;
    over.height = canvas.height;
    const style = getComputedStyle(canvas);
    colours = {
      text: style.getPropertyValue('--text').trim() || colours.text,
      accent: style.getPropertyValue('--accent').trim() || colours.accent,
      bg: style.getPropertyValue('--bg').trim() || colours.bg,
    };
    // Which room the globe stands in: the canvas turns any colour into #rrggbb to be read.
    context.fillStyle = colours.bg;
    const hex = String(context.fillStyle);
    const light = hex.startsWith('#') && parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16) > 384;
    earth = light ? EARTH.light : EARTH.dark;
    dirty = true;
  };

  const place = () => {
    projection
      .translate([width / 2, height / 2])
      .scale(radius())
      .rotate([rotation[0], rotation[1], 0]);
  };

  const draw = () => {
    const world = (moving ? coarse : fine) ?? coarse;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    place();

    const r = radius();
    const cx = width / 2;
    const cy = height / 2;

    // Where the light falls, on the upper left of the sphere.
    const lx = cx - r * 0.38;
    const ly = cy - r * 0.42;

    // The air: a thin glow that reaches a little past the edge and fades into the room.
    const air = context.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.1);
    air.addColorStop(0, `rgba(${earth.air}, 0.34)`);
    air.addColorStop(0.35, `rgba(${earth.air}, 0.12)`);
    air.addColorStop(1, `rgba(${earth.air}, 0)`);
    context.beginPath();
    context.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
    context.fillStyle = air;
    context.fill();

    // The sea: lighter where the light falls, deep toward the far edge.
    const sea = context.createRadialGradient(lx, ly, r * 0.05, cx, cy, r);
    sea.addColorStop(0, earth.seaLit);
    sea.addColorStop(0.55, earth.sea);
    sea.addColorStop(1, earth.seaFar);
    context.beginPath();
    path({ type: 'Sphere' });
    context.fillStyle = sea;
    context.fill();

    // The light's glint on the water.
    const glint = context.createRadialGradient(lx, ly, 0, lx, ly, r * 0.55);
    glint.addColorStop(0, `rgba(255, 255, 255, ${earth.glint})`);
    glint.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = glint;
    context.fill();

    context.beginPath();
    path(graticule);
    context.lineWidth = 0.5;
    context.globalAlpha = 0.06;
    context.strokeStyle = colours.text;
    context.stroke();
    context.globalAlpha = 1;

    if (world) {
      context.beginPath();
      path(world.land);
      context.fillStyle = earth.land;
      context.fill();

      for (const country of world.countries) {
        const count = counts.get(country.code) ?? 0;
        const lit = country.code === selected;
        const under = country.code === hovered;
        if (!count && !lit && !under) continue;
        context.beginPath();
        path(country.shape);
        context.fillStyle = count || lit ? colours.accent : colours.text;
        context.globalAlpha = lit ? 0.62 : count ? 0.1 + 0.3 * Math.sqrt(count / most) + (under ? 0.16 : 0) : 0.1;
        context.fill();
      }
      context.globalAlpha = 1;

      context.beginPath();
      path(world.borders);
      context.lineWidth = 0.5;
      context.globalAlpha = 0.2;
      context.strokeStyle = colours.text;
      context.stroke();
      context.beginPath();
      path(world.coasts);
      context.lineWidth = 0.7;
      context.globalAlpha = 0.4;
      context.stroke();
      context.globalAlpha = 1;
    }

    // Night: the side turned from the light falls into shadow, sea and land alike.
    const night = context.createRadialGradient(lx, ly, r * 0.5, cx - r * 0.08, cy - r * 0.08, r * 1.02);
    night.addColorStop(0, 'rgba(0, 0, 0, 0)');
    night.addColorStop(0.6, `rgba(0, 0, 0, ${earth.night * 0.35})`);
    night.addColorStop(1, `rgba(0, 0, 0, ${earth.night})`);
    context.beginPath();
    path({ type: 'Sphere' });
    context.fillStyle = night;
    context.fill();

    if (world) {
      const marked = world.countries.find((country) => country.code === (selected ?? hovered));
      if (marked) {
        context.beginPath();
        path(marked.shape);
        context.lineWidth = 1.1;
        context.strokeStyle = counts.has(marked.code) || marked.code === selected ? colours.accent : colours.text;
        context.stroke();
      }

      // A pin for every country with books, so that the small ones can be found too. Where
      // they are is noted here; they are lit on a layer of their own (glow, below).
      pins.length = 0;
      for (const country of world.countries) {
        if (!counts.has(country.code)) continue;
        const point = visible(country.centre);
        if (point) pins.push({ x: point[0], y: point[1], chosen: country.code === selected, over: country.code === hovered, beat: country.centre[0] * 0.21 + country.centre[1] * 0.13 });
      }
    }

    // The edge of the air, brightest on the lit side.
    const rim = context.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    rim.addColorStop(0, `rgba(${earth.air}, 0.85)`);
    rim.addColorStop(1, `rgba(${earth.air}, 0.18)`);
    context.beginPath();
    path({ type: 'Sphere' });
    context.lineWidth = 1;
    context.strokeStyle = rim;
    context.stroke();
  };

  /**
   * The pins, each a point of light with a glow about it that rises and falls slowly, no two
   * together. They are drawn every frame on a small layer over the globe, which is itself
   * drawn only when it moves.
   */
  const glow = () => {
    lights.setTransform(ratio, 0, 0, ratio, 0, 0);
    lights.clearRect(0, 0, width, height);
    const now = performance.now();
    lights.fillStyle = colours.accent;
    for (const pin of pins) {
      const breath = reduced ? 0.8 : 0.72 + 0.28 * Math.sin(now / 1500 + pin.beat);
      const lit = pin.chosen || pin.over ? 1.5 : 1;
      const size = pin.chosen ? 3.2 : 2;
      lights.globalAlpha = 0.07 * breath * lit;
      lights.beginPath();
      lights.arc(pin.x, pin.y, size * (4.6 + breath), 0, Math.PI * 2);
      lights.fill();
      lights.globalAlpha = 0.16 * breath * lit;
      lights.beginPath();
      lights.arc(pin.x, pin.y, size * 2.6, 0, Math.PI * 2);
      lights.fill();
      lights.globalAlpha = 0.34 * breath * lit;
      lights.beginPath();
      lights.arc(pin.x, pin.y, size * 1.6, 0, Math.PI * 2);
      lights.fill();
      lights.globalAlpha = 1;
      lights.beginPath();
      lights.arc(pin.x, pin.y, size, 0, Math.PI * 2);
      lights.fill();
      // By night the heart of the light is nearly white.
      if (earth === EARTH.dark) {
        lights.fillStyle = '#fff6dc';
        lights.globalAlpha = 0.85;
        lights.beginPath();
        lights.arc(pin.x, pin.y, size * 0.45, 0, Math.PI * 2);
        lights.fill();
        lights.fillStyle = colours.accent;
      }
    }
    lights.globalAlpha = 1;
  };

  /** Where a place is on screen, or null when it is on the far side. */
  const visible = (lonLat: [number, number]): [number, number] | null => {
    const far = geoDistance([-rotation[0], -rotation[1]], lonLat) > Math.PI / 2 - 0.02;
    return far ? null : projection(lonLat);
  };

  const countryAt = (x: number, y: number): string | null => {
    const world = fine ?? coarse;
    if (!world) return null;
    place();
    if (Math.hypot(x - width / 2, y - height / 2) > radius()) return null;
    let nearest: string | null = null;
    let reach = PIN_REACH;
    for (const country of world.countries) {
      if (!counts.has(country.code)) continue;
      const point = visible(country.centre);
      if (!point) continue;
      const distance = Math.hypot(point[0] - x, point[1] - y);
      if (distance < reach) {
        reach = distance;
        nearest = country.code;
      }
    }
    const lonLat = projection.invert!([x, y]);
    if (!lonLat) return nearest;
    const inside = world.countries.find((country) => inBounds(country.bounds, lonLat) && geoContains(country.shape, lonLat));
    // Inside a large country the country wins; a pin only reaches out over sea and small neighbours.
    if (inside && counts.has(inside.code)) return inside.code;
    return nearest ?? inside?.code ?? null;
  };

  const tick = (now: number) => {
    if (stopped) return;
    frame = requestAnimationFrame(tick);
    const dt = Math.min(now - before, 100);
    before = now;
    const step = dt / (1000 / 60);
    let moved = false;

    if (fly) {
      const t = clamp((now - fly.start) / FLY_MS, 0, 1);
      const eased = easeInOutSine(t);
      const at = geoInterpolate(fly.from, fly.to)(eased);
      rotation = [-at[0], -at[1]];
      zoom = fly.zoomFrom + (fly.zoomTo - fly.zoomFrom) * eased;
      if (t === 1) fly = null;
      moved = true;
    } else if (!drag && (Math.abs(spin[0]) > 0.004 || Math.abs(spin[1]) > 0.004)) {
      rotation = [rotation[0] + spin[0] * step, clamp(rotation[1] + spin[1] * step, -MAX_TILT, MAX_TILT)];
      spin = [spin[0] * Math.pow(0.94, step), spin[1] * Math.pow(0.94, step)];
      moved = true;
    } else if (!drag && !reduced && !selected && !hovered && now - touched > REST_MS) {
      rotation = [rotation[0] + (TURN * dt) / 1000, rotation[1]];
      moved = true;
    }

    // Once the globe comes to rest it is drawn again, with the fine outlines.
    if (moved || drag) dirty = true;
    else if (moving) dirty = true;
    const wasMoving = moving;
    moving = moved || !!drag;
    if (dirty || wasMoving !== moving) {
      dirty = false;
      draw();
    }
    glow();
  };

  // Dragging turns the globe; two fingers or the wheel zoom it.
  let drag: { id: number; x: number; y: number; travelled: number } | null = null;
  const fingers = new Map<number, { x: number; y: number }>();
  let pinch = 0;

  const local = (event: PointerEvent | WheelEvent) => {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const onDown = (event: PointerEvent) => {
    fingers.set(event.pointerId, local(event));
    canvas.setPointerCapture(event.pointerId);
    touched = performance.now();
    fly = null;
    spin = [0, 0];
    if (fingers.size === 1) drag = { id: event.pointerId, ...local(event), travelled: 0 };
    else {
      drag = null;
      const [a, b] = [...fingers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
    canvas.dataset.dragging = 'true';
  };

  const onMove = (event: PointerEvent) => {
    const at = local(event);
    touched = performance.now();
    if (fingers.has(event.pointerId)) fingers.set(event.pointerId, at);
    if (fingers.size === 2) {
      const [a, b] = [...fingers.values()];
      const apart = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoom = clamp((zoom * apart) / pinch, 1, MAX_ZOOM);
      pinch = apart;
      dirty = true;
      return;
    }
    if (drag && drag.id === event.pointerId) {
      const perPixel = 180 / (Math.PI * radius());
      const dx = (at.x - drag.x) * perPixel;
      const dy = -(at.y - drag.y) * perPixel;
      drag.travelled += Math.hypot(at.x - drag.x, at.y - drag.y);
      drag.x = at.x;
      drag.y = at.y;
      rotation = [rotation[0] + dx, clamp(rotation[1] + dy, -MAX_TILT, MAX_TILT)];
      spin = [dx, dy];
      if (drag.travelled > 4 && hovered) setHover(null, null);
      return;
    }
    if (event.pointerType === 'mouse') setHover(countryAt(at.x, at.y), at);
  };

  const onUp = (event: PointerEvent) => {
    fingers.delete(event.pointerId);
    pinch = 0;
    if (!fingers.size) delete canvas.dataset.dragging;
    if (!drag || drag.id !== event.pointerId) return;
    const pressed = drag.travelled <= 4;
    drag = null;
    if (!pressed) return;
    spin = [0, 0];
    if (event.type === 'pointercancel') return;
    const at = local(event);
    const code = countryAt(at.x, at.y);
    select(code && counts.has(code) ? code : null);
    options.onSelect(selected);
  };

  const onLeave = () => setHover(null, null);

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    touched = performance.now();
    fly = null;
    zoom = clamp(zoom * Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.03 : 0.0012)), 1, MAX_ZOOM);
    dirty = true;
  };

  const setHover = (code: string | null, at: { x: number; y: number } | null) => {
    if (code !== hovered) {
      hovered = code;
      dirty = true;
      canvas.dataset.over = code && counts.has(code) ? 'book' : code ? 'land' : 'sea';
    }
    options.onHover(code, code ? at : null);
  };

  const select = (code: string | null) => {
    selected = code;
    dirty = true;
    const country = code ? (fine ?? coarse)?.countries.find((entry) => entry.code === code) : null;
    spin = [0, 0];
    touched = performance.now();
    if (!country) {
      // Step back out to the whole globe.
      if (zoom > 1.01) fly = { from: [-rotation[0], -rotation[1]], to: [-rotation[0], -rotation[1]], zoomFrom: zoom, zoomTo: 1, start: performance.now() };
      return;
    }
    const to: [number, number] = [country.centre[0], clamp(country.centre[1], -MAX_TILT, MAX_TILT)];
    const zoomTo = clamp(24 / country.span, 1.1, 2.1);
    if (reduced) {
      rotation = [-to[0], -to[1]];
      zoom = zoomTo;
      return;
    }
    fly = { from: [-rotation[0], -rotation[1]], to, zoomFrom: zoom, zoomTo, start: performance.now() };
  };

  const load = async (detail: string) => readWorld(await (await fetch(`${import.meta.env.BASE_URL}geo/world-${detail}.json`)).json());
  load('110m').then((world) => {
    coarse = world;
    dirty = true;
    return load('50m').then((better) => {
      fine = better;
      dirty = true;
    });
  }).catch(() => undefined);

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const themes = new MutationObserver(resize);
  themes.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  resize();
  frame = requestAnimationFrame(tick);

  return {
    select,
    setCounts(next) {
      counts = next;
      most = Math.max(1, ...counts.values());
      dirty = true;
    },
    destroy() {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      themes.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      over.remove();
    },
  };
}
