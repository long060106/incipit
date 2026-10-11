import { geoArea, geoBounds, geoCentroid, geoContains, geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { Feature, MultiLineString, MultiPolygon, Polygon } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';

/*
  The globe: a wireframe Earth drawn on a canvas, one country outline at a time. It turns
  slowly by itself until the reader takes hold of it. Countries where a book is set carry a
  wash of the accent colour, deeper the more books there are, and a pin.

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
  borders: MultiLineString;
}

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
  return { countries, borders: mesh(topology, object) };
}

const inBounds = ([[west, south], [east, north]]: Country['bounds'], [lon, lat]: [number, number]) =>
  lat >= south && lat <= north && (west <= east ? lon >= west && lon <= east : lon >= west || lon <= east);

export function createGlobe(canvas: HTMLCanvasElement, options: GlobeOptions): GlobeHandle {
  const context = canvas.getContext('2d')!;
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

  const radius = () => (Math.min(width, height) / 2 - 18) * zoom;

  const resize = () => {
    const box = canvas.getBoundingClientRect();
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = box.width;
    height = box.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const style = getComputedStyle(canvas);
    colours = {
      text: style.getPropertyValue('--text').trim() || colours.text,
      accent: style.getPropertyValue('--accent').trim() || colours.accent,
      bg: style.getPropertyValue('--bg').trim() || colours.bg,
    };
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

    // The sphere: barely lighter than the room, lit from the upper left.
    const shade = context.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    shade.addColorStop(0, `color-mix(in srgb, ${colours.text} 7%, ${colours.bg})`);
    shade.addColorStop(1, colours.bg);
    context.beginPath();
    path({ type: 'Sphere' });
    context.fillStyle = shade;
    context.fill();

    context.beginPath();
    path(graticule);
    context.lineWidth = 0.5;
    context.globalAlpha = 0.09;
    context.strokeStyle = colours.text;
    context.stroke();
    context.globalAlpha = 1;

    if (world) {
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
      context.lineWidth = 0.6;
      context.globalAlpha = 0.42;
      context.strokeStyle = colours.text;
      context.stroke();
      context.globalAlpha = 1;

      const marked = world.countries.find((country) => country.code === (selected ?? hovered));
      if (marked) {
        context.beginPath();
        path(marked.shape);
        context.lineWidth = 1.1;
        context.strokeStyle = counts.has(marked.code) || marked.code === selected ? colours.accent : colours.text;
        context.stroke();
      }

      // A pin for every country with books, so that the small ones can be found too.
      context.fillStyle = colours.accent;
      for (const country of world.countries) {
        if (!counts.has(country.code)) continue;
        const point = visible(country.centre);
        if (!point) continue;
        context.beginPath();
        context.arc(point[0], point[1], country.code === selected ? 3.2 : 1.9, 0, Math.PI * 2);
        context.fill();
      }
    }

    context.beginPath();
    path({ type: 'Sphere' });
    context.lineWidth = 0.8;
    context.globalAlpha = 0.5;
    context.strokeStyle = colours.text;
    context.stroke();
    context.globalAlpha = 1;
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
    },
  };
}
