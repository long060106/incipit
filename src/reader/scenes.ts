/*
  The weather of a book (src/reader/ambience.ts): instead of the plain night sky, each book
  that has one gets the air it is set in, drawn behind the page. Snow over Frankenstein's
  Arctic, rain on the window at Thornfield, the sea under Moby Dick, embers for the Iliad's
  burning Troy, fog for Dracula's London, fireflies for Gatsby's summer, leaves for an
  autumn in the country, blossom for a spring one.

  Every scene is slow and quiet, faint behind the column of text and clearer in the margins,
  and answers the mouse a little: snow and leaves are blown aside, embers swirl, fog parts,
  fireflies come closer, the sea rises under the cursor. Movement is measured in time, not
  frames. With reduced motion a scene is drawn once and stays still.
*/

import type { Book, GenreId } from '../data/types';

export type SceneId = 'night' | 'snow' | 'rain' | 'sea' | 'embers' | 'mist' | 'fireflies' | 'leaves' | 'blossom';

/** The books whose air is plain from the story; every other book is under the night sky, or its genre's. */
const SCENE_OF: Record<string, SceneId> = {
  frankenstein: 'snow',
  'crime-and-punishment': 'snow',
  'anna-karenina': 'snow',
  'war-and-peace': 'snow',
  'the-brothers-karamazov': 'snow',
  'notes-from-underground': 'snow',
  'dead-souls': 'snow',
  'the-call-of-the-wild': 'snow',
  'white-fang': 'snow',
  'a-christmas-carol': 'snow',
  'ethan-frome': 'snow',
  dubliners: 'snow',
  'the-invisible-man': 'snow',
  'fathers-and-sons': 'leaves',

  'wuthering-heights': 'rain',
  'the-metamorphosis': 'rain',
  'the-trial': 'rain',
  hunger: 'rain',
  'north-and-south': 'rain',
  'sense-and-sensibility': 'rain',
  'tess-of-the-durbervilles': 'rain',
  'madame-bovary': 'rain',
  'the-woman-in-white': 'rain',
  'sister-carrie': 'rain',

  'moby-dick': 'sea',
  'the-odyssey': 'sea',
  'twenty-thousand-leagues-under-the-sea': 'sea',
  'treasure-island': 'sea',
  'robinson-crusoe': 'sea',
  'gullivers-travels': 'sea',
  'lord-jim': 'sea',
  'the-count-of-monte-cristo': 'sea',
  persuasion: 'sea',
  kidnapped: 'sea',
  'the-awakening': 'sea',
  'the-island-of-doctor-moreau': 'sea',
  'around-the-world-in-eighty-days': 'sea',
  'three-men-in-a-boat': 'sea',
  'the-scarlet-pimpernel': 'sea',
  'the-adventures-of-huckleberry-finn': 'sea',
  siddhartha: 'sea',

  'jane-eyre': 'embers',
  'the-iliad': 'embers',
  'the-divine-comedy': 'embers',
  'the-phantom-of-the-opera': 'embers',
  'the-hunchback-of-notre-dame': 'embers',
  'the-arabian-nights': 'embers',
  'journey-to-the-centre-of-the-earth': 'embers',
  beowulf: 'embers',
  germinal: 'embers',
  'the-war-of-the-worlds': 'embers',
  'a-tale-of-two-cities': 'embers',
  'les-miserables': 'embers',
  'romance-of-the-three-kingdoms': 'embers',
  'the-art-of-war': 'embers',
  'little-women': 'embers',
  'the-three-musketeers': 'embers',
  ivanhoe: 'embers',
  'the-last-of-the-mohicans': 'embers',

  dracula: 'mist',
  'the-strange-case-of-dr-jekyll-and-mr-hyde': 'mist',
  'the-picture-of-dorian-gray': 'mist',
  'the-hound-of-the-baskervilles': 'mist',
  'great-expectations': 'mist',
  'the-adventures-of-sherlock-holmes': 'mist',
  'heart-of-darkness': 'mist',
  'the-turn-of-the-screw': 'mist',
  carmilla: 'mist',
  'the-king-in-yellow': 'mist',
  'the-moonstone': 'mist',
  'the-scarlet-letter': 'mist',
  'oliver-twist': 'mist',
  'david-copperfield': 'mist',
  'the-man-who-was-thursday': 'mist',
  'the-thirty-nine-steps': 'mist',
  'the-yellow-wallpaper': 'mist',

  'the-great-gatsby': 'fireflies',
  'peter-pan': 'fireflies',
  'alices-adventures-in-wonderland': 'fireflies',
  'the-wonderful-wizard-of-oz': 'fireflies',
  'the-jungle-book': 'fireflies',
  'the-adventures-of-tom-sawyer': 'fireflies',
  'romeo-and-juliet': 'fireflies',
  'the-decameron': 'fireflies',
  'grimms-fairy-tales': 'fireflies',
  'the-adventures-of-pinocchio': 'fireflies',
  'noli-me-tangere': 'fireflies',
  'the-home-and-the-world': 'fireflies',
  gitanjali: 'fireflies',
  'the-prophet': 'fireflies',
  'tao-te-ching': 'fireflies',
  'the-book-of-tea': 'fireflies',
  'my-antonia': 'fireflies',
  'mrs-dalloway': 'fireflies',

  'pride-and-prejudice': 'leaves',
  emma: 'leaves',
  'northanger-abbey': 'leaves',
  middlemarch: 'leaves',
  'far-from-the-madding-crowd': 'leaves',
  'silas-marner': 'leaves',
  walden: 'leaves',
  'the-legend-of-sleepy-hollow': 'leaves',
  'the-sorrows-of-young-werther': 'leaves',
  'the-age-of-innocence': 'leaves',
  'swanns-way': 'blossom',
  'the-secret-garden': 'blossom',
  'anne-of-green-gables': 'blossom',
  heidi: 'blossom',
  botchan: 'blossom',
  'the-wind-in-the-willows': 'blossom',
  'my-brilliant-career': 'blossom',
  'black-beauty': 'leaves',
  'the-analects': 'blossom',
  bushido: 'blossom',
};

const BY_GENRE: Partial<Record<GenreId, SceneId>> = {
  gothic: 'mist',
  romance: 'leaves',
  adventure: 'sea',
};

export function sceneOf(book: Pick<Book, 'id' | 'genres'> | undefined): SceneId {
  if (!book) return 'night';
  return SCENE_OF[book.id] ?? book.genres.map((genre) => BY_GENRE[genre]).find(Boolean) ?? 'night';
}

/** What a scene is told at every frame. */
export interface Air {
  now: number;
  /** Seconds since the last frame. */
  dt: number;
  mouse: { x: number; y: number; here: boolean };
  /** How much shows at this place across the page: faint behind the text, whole in the margins. */
  veil: (x: number) => number;
}

export interface Scene {
  draw: (pen: CanvasRenderingContext2D, air: Air) => void;
}

const rnd = (from: number, to: number) => from + Math.random() * (to - from);
const TAU = Math.PI * 2;

/** A soft round of light, drawn once and laid down many times. */
function blob(colour: string, size = 128): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const pen = canvas.getContext('2d')!;
  const glow = pen.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  glow.addColorStop(0, `rgba(${colour},1)`);
  glow.addColorStop(0.35, `rgba(${colour},0.45)`);
  glow.addColorStop(1, `rgba(${colour},0)`);
  pen.fillStyle = glow;
  pen.fillRect(0, 0, size, size);
  return canvas;
}

/** A wash of light over the whole window: a moon, a hearth, the sky's cold. */
function wash(pen: CanvasRenderingContext2D, x: number, y: number, reach: number, colour: string, alpha: number) {
  const glow = pen.createRadialGradient(x, y, 0, x, y, reach);
  glow.addColorStop(0, `rgba(${colour},${alpha})`);
  glow.addColorStop(1, `rgba(${colour},0)`);
  pen.fillStyle = glow;
  pen.fillRect(0, 0, pen.canvas.width, pen.canvas.height);
}

/** The moon: a bright disc, a little shaded on one side, in a wide halo. */
function drawMoon(pen: CanvasRenderingContext2D, halo: HTMLCanvasElement, x: number, y: number, size: number, light: number) {
  pen.globalAlpha = 0.55 * light;
  pen.drawImage(halo, x - size * 7, y - size * 7, size * 14, size * 14);
  pen.globalAlpha = light;
  const face = pen.createRadialGradient(x - size * 0.35, y - size * 0.35, 0, x, y, size);
  face.addColorStop(0, '#fffdf4');
  face.addColorStop(0.7, '#ece8da');
  face.addColorStop(1, '#cfcabb');
  pen.fillStyle = face;
  pen.beginPath();
  pen.arc(x, y, size, 0, TAU);
  pen.fill();
  pen.globalAlpha = 1;
}

/** Pushes a point away from the cursor, gently, within a reach. */
function blowAway(point: { x: number; y: number }, air: Air, reach: number, strength: number) {
  if (!air.mouse.here) return;
  const dx = point.x - air.mouse.x;
  const dy = point.y - air.mouse.y;
  const distance = Math.hypot(dx, dy);
  if (distance > reach || distance < 0.5) return;
  const push = (1 - distance / reach) ** 2 * strength * air.dt;
  point.x += (dx / distance) * push;
  point.y += (dy / distance) * push;
}

export function makeScene(id: SceneId, width: number, height: number): Scene | null {
  const area = width * height;
  switch (id) {
    case 'snow':
      return snow(width, height, area);
    case 'rain':
      return rain(width, height, area);
    case 'sea':
      return sea(width, height);
    case 'embers':
      return embers(width, height, area);
    case 'mist':
      return mist(width, height);
    case 'fireflies':
      return fireflies(width, height, area);
    case 'leaves':
      return falling(width, height, area, false);
    case 'blossom':
      return falling(width, height, area, true);
    default:
      return null;
  }
}

/** Snow in three depths, the nearest large and soft as if out of focus; a cold light from above. */
function snow(width: number, height: number, area: number): Scene {
  const SIZE = [1.1, 2, 3.8];
  const SPEED = [12, 22, 38];
  const LIGHT = [0.5, 0.75, 0.55];
  const flakes = Array.from({ length: Math.min(420, Math.round(area / 4500)) }, () => {
    const depth = Math.random() < 0.5 ? 0 : Math.random() < 0.75 ? 1 : 2;
    return {
      x: rnd(0, width),
      y: rnd(0, height),
      depth,
      speed: SPEED[depth] * rnd(0.8, 1.2),
      phase: rnd(0, TAU),
      sway: rnd(0.3, 0.9),
    };
  });
  const soft = blob('238,244,255', 64);
  return {
    draw(pen, air) {
      wash(pen, width * 0.5, -height * 0.15, Math.max(width, height) * 0.8, '140,170,225', 0.09);
      for (const flake of flakes) {
        flake.y += flake.speed * air.dt;
        flake.x += Math.sin(air.now * 0.0006 * flake.sway + flake.phase) * (6 + flake.depth * 6) * air.dt;
        blowAway(flake, air, 110, 120);
        if (flake.y > height + 8) [flake.y, flake.x] = [-8, rnd(0, width)];
        if (flake.x < -8) flake.x += width + 16;
        else if (flake.x > width + 8) flake.x -= width + 16;
        const light = LIGHT[flake.depth] * air.veil(flake.x);
        if (flake.depth < 2) {
          pen.globalAlpha = light;
          pen.fillStyle = '#eef3ff';
          pen.beginPath();
          pen.arc(flake.x, flake.y, SIZE[flake.depth], 0, TAU);
          pen.fill();
        } else {
          const size = SIZE[2] * 3.2;
          pen.globalAlpha = light;
          pen.drawImage(soft, flake.x - size, flake.y - size, size * 2, size * 2);
        }
      }
      pen.globalAlpha = 1;
      // Frost at the edges of the window.
      const frost = pen.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.42, width / 2, height / 2, Math.hypot(width, height) * 0.56);
      frost.addColorStop(0, 'rgba(205,222,255,0)');
      frost.addColorStop(1, 'rgba(205,222,255,0.07)');
      pen.fillStyle = frost;
      pen.fillRect(0, 0, width, height);
    },
  };
}

/** Rain slanting past, and beads of it on the glass that now and then run down. */
function rain(width: number, height: number, area: number): Scene {
  const streaks = Array.from({ length: Math.min(220, Math.round(area / 9000)) }, () => ({
    x: rnd(-80, width),
    y: rnd(0, height),
    length: rnd(14, 34),
    speed: rnd(340, 560),
    light: rnd(0.12, 0.32),
  }));
  const beads = Array.from({ length: Math.min(70, Math.round(area / 22000)) }, () => ({
    x: rnd(0, width),
    y: rnd(0, height),
    size: rnd(1.8, 4.6),
    running: 0,
    trail: 0,
  }));
  return {
    draw(pen, air) {
      pen.fillStyle = 'rgba(14,20,32,0.38)';
      pen.fillRect(0, 0, width, height);
      pen.lineWidth = 1;
      pen.strokeStyle = 'rgb(165,185,220)';
      for (const streak of streaks) {
        streak.y += streak.speed * air.dt;
        streak.x += streak.speed * 0.13 * air.dt;
        if (streak.y > height + 30) [streak.y, streak.x] = [-30, rnd(-80, width)];
        pen.globalAlpha = streak.light * air.veil(streak.x);
        pen.beginPath();
        pen.moveTo(streak.x, streak.y);
        pen.lineTo(streak.x - streak.length * 0.13, streak.y - streak.length);
        pen.stroke();
      }
      for (const bead of beads) {
        // Now and then a bead lets go and runs down the glass, leaving a wet trail.
        if (!bead.running && Math.random() < air.dt * 0.05) bead.running = rnd(24, 70);
        if (bead.running) {
          bead.y += bead.running * air.dt;
          bead.trail = Math.min(46, bead.trail + bead.running * air.dt);
          bead.x += Math.sin(air.now * 0.003 + bead.size * 9) * 0.12;
          if (bead.y > height + 12)
            Object.assign(bead, {
              y: rnd(-20, height * 0.5),
              x: rnd(0, width),
              running: 0,
              trail: 0,
            });
        } else bead.trail = Math.max(0, bead.trail - 14 * air.dt);
        const veil = air.veil(bead.x);
        if (bead.trail > 1) {
          pen.globalAlpha = 0.08 * veil;
          pen.strokeStyle = 'rgb(200,215,240)';
          pen.lineWidth = bead.size * 0.9;
          pen.beginPath();
          pen.moveTo(bead.x, bead.y - bead.trail);
          pen.lineTo(bead.x, bead.y);
          pen.stroke();
        }
        pen.globalAlpha = 0.22 * veil;
        pen.fillStyle = 'rgb(200,215,240)';
        pen.beginPath();
        pen.arc(bead.x, bead.y, bead.size, 0, TAU);
        pen.fill();
        // The light the bead catches.
        pen.globalAlpha = 0.65 * veil;
        pen.fillStyle = '#eef4ff';
        pen.beginPath();
        pen.arc(bead.x - bead.size * 0.35, bead.y - bead.size * 0.35, bead.size * 0.28, 0, TAU);
        pen.fill();
      }
      pen.globalAlpha = 1;
    },
  };
}

/** A night sea under the moon: long swells at the foot of the window, the moon's road glittering on them. */
function sea(width: number, height: number): Scene {
  const moon = { x: width * 0.9, y: height * 0.16 };
  const LINES = 14;
  const swells = Array.from({ length: LINES }, (_, at) => {
    const near = at / (LINES - 1);
    return {
      near,
      y: height * (0.56 + 0.42 * near ** 1.4),
      lift: 2 + near * 12,
      length: 260 + near * 380,
      speed: 0.00012 + near * 0.00022,
      phase: rnd(0, TAU),
    };
  });
  const glints = Array.from({ length: 70 }, () => ({
    line: Math.floor(rnd(0, LINES)),
    spread: rnd(-1, 1),
    phase: rnd(0, TAU),
    pace: rnd(0.0015, 0.004),
  }));
  const halo = blob('235,238,250', 128);
  /** How high a swell stands at a point, with the sea rising a little under the cursor. */
  const surface = (swell: (typeof swells)[number], x: number, air: Air) => {
    let y =
      swell.y +
      Math.sin(x / swell.length + air.now * swell.speed + swell.phase) * swell.lift +
      Math.sin(x / (swell.length * 0.37) - air.now * swell.speed * 1.7) * swell.lift * 0.35;
    if (air.mouse.here) {
      const across = (x - air.mouse.x) / 160;
      const down = (swell.y - air.mouse.y) / 140;
      y -= Math.exp(-across * across - down * down) * 10 * (0.4 + swell.near) * (0.6 + 0.4 * Math.sin(air.now * 0.002 - Math.abs(across) * 2));
    }
    return y;
  };
  return {
    draw(pen, air) {
      wash(pen, moon.x, moon.y, height * 0.7, '200,210,235', 0.07);
      drawMoon(pen, halo, moon.x, moon.y, 14, 1);
      pen.lineWidth = 1;
      for (const swell of swells) {
        pen.strokeStyle = `rgba(185,205,235,${0.07 + swell.near * 0.16})`;
        pen.globalAlpha = 1;
        pen.beginPath();
        for (let x = -10; x <= width + 10; x += 14) {
          const y = surface(swell, x, air);
          if (x === -10) pen.moveTo(x, y);
          else pen.lineTo(x, y);
        }
        pen.stroke();
      }
      // The moon's road: points of light on the swells, below it, widening towards the shore.
      for (const glint of glints) {
        const swell = swells[glint.line];
        const x = moon.x + glint.spread * (30 + swell.near * 170);
        const shine = Math.max(0, Math.sin(air.now * glint.pace + glint.phase));
        pen.globalAlpha = shine * shine * (0.35 + 0.4 * swell.near) * (1 - Math.abs(glint.spread) * 0.6) * air.veil(x);
        pen.fillStyle = '#f4f1e4';
        pen.fillRect(x - 1.5 - swell.near * 2, surface(swell, x, air) - 0.6, 3 + swell.near * 4, 1.2);
      }
      pen.globalAlpha = 1;
    },
  };
}

/** Embers rising from a hearth below the window, its light breathing on the dark. */
function embers(width: number, height: number, area: number): Scene {
  const sparks = Array.from({ length: Math.min(140, Math.round(area / 14000)) }, () => ({
    x: rnd(0, width),
    y: rnd(0, height),
    rise: rnd(12, 34),
    size: rnd(0.7, 2),
    phase: rnd(0, TAU),
    heat: rnd(0, 1),
  }));
  const glow = blob('255,150,60', 64);
  return {
    draw(pen, air) {
      const breath = 0.86 + 0.09 * Math.sin(air.now * 0.0021) + 0.05 * Math.sin(air.now * 0.0067 + 1);
      wash(pen, width / 2, height + 90, height * 1.1, '255,105,35', 0.2 * breath);
      wash(pen, width / 2, height + 30, height * 0.55, '255,160,70', 0.1 * breath);
      for (const spark of sparks) {
        spark.y -= spark.rise * air.dt;
        spark.x += Math.sin(air.now * 0.0011 + spark.phase) * 14 * air.dt;
        // About the cursor, the embers turn in a slow eddy.
        if (air.mouse.here) {
          const dx = spark.x - air.mouse.x;
          const dy = spark.y - air.mouse.y;
          const distance = Math.hypot(dx, dy);
          if (distance < 120 && distance > 0.5) {
            const turn = (1 - distance / 120) * 70 * air.dt;
            spark.x += (-dy / distance) * turn;
            spark.y += (dx / distance) * turn * 0.6;
          }
        }
        if (spark.y < -10) [spark.y, spark.x] = [height + rnd(0, 40), rnd(0, width)];
        const life = Math.max(0, Math.min(1, spark.y / height)) ** 0.8;
        const flicker = 0.55 + 0.45 * Math.sin(air.now * 0.006 + spark.phase * 3);
        const light = life * flicker * air.veil(spark.x);
        const size = spark.size * 5;
        pen.globalAlpha = light * 0.5;
        pen.drawImage(glow, spark.x - size, spark.y - size, size * 2, size * 2);
        pen.globalAlpha = light;
        pen.fillStyle = spark.heat > 0.5 ? '#ffd690' : '#ffb35e';
        pen.beginPath();
        pen.arc(spark.x, spark.y, spark.size * 0.6, 0, TAU);
        pen.fill();
      }
      pen.globalAlpha = 1;
    },
  };
}

/** Banks of fog drifting slowly across a pale moon, parting a little about the cursor. */
function mist(width: number, height: number): Scene {
  const fog = blob('185,195,210', 128);
  const banks = Array.from({ length: 16 }, () => ({
    x: rnd(-200, width + 200),
    y: rnd(height * 0.05, height * 1.05),
    size: rnd(220, 480),
    drift: rnd(6, 16) * (Math.random() < 0.5 ? -1 : 1) * 0.4 + 7,
    light: rnd(0.05, 0.1),
    phase: rnd(0, TAU),
    dx: 0,
    dy: 0,
  }));
  const moon = { x: width * 0.09, y: height * 0.2 };
  const halo = blob('225,228,240', 128);
  return {
    draw(pen, air) {
      drawMoon(pen, halo, moon.x, moon.y, 16, 0.7);
      for (const bank of banks) {
        bank.x += bank.drift * air.dt;
        const reach = bank.size * 0.6;
        if (bank.x - reach > width) bank.x = -reach;
        else if (bank.x + reach < 0) bank.x = width + reach;
        // It gives way before the cursor, and comes back slowly.
        const at = { x: bank.x + bank.dx, y: bank.y + bank.dy };
        blowAway(at, air, bank.size * 0.55, 160);
        bank.dx = (at.x - bank.x) * Math.pow(0.4, air.dt);
        bank.dy = (at.y - bank.y) * Math.pow(0.4, air.dt);
        const swell = 1 + 0.08 * Math.sin(air.now * 0.00025 + bank.phase);
        const size = bank.size * swell;
        pen.globalAlpha = bank.light * (0.4 + 0.6 * air.veil(at.x));
        pen.drawImage(fog, at.x - size / 2, at.y - size * 0.32, size, size * 0.64);
      }
      pen.globalAlpha = 1;
    },
  };
}

/** Fireflies on a summer night: each glows for a moment and goes dark, and the near ones come to the cursor. */
function fireflies(width: number, height: number, area: number): Scene {
  const glow = blob('215,235,120', 64);
  const flies = Array.from({ length: Math.min(70, Math.round(area / 26000)) }, () => ({
    x: rnd(0, width),
    y: rnd(height * 0.15, height),
    heading: rnd(0, TAU),
    speed: rnd(8, 20),
    turn: rnd(0.0003, 0.0009),
    phase: rnd(0, TAU),
    // Its own rhythm: a glow every few seconds.
    pace: rnd(0.0007, 0.0013),
    size: rnd(0.9, 1.6),
  }));
  return {
    draw(pen, air) {
      wash(pen, width * 0.5, height * 1.2, height, '40,70,40', 0.18);
      for (const fly of flies) {
        fly.heading += Math.sin(air.now * fly.turn + fly.phase) * 0.9 * air.dt;
        let vx = Math.cos(fly.heading) * fly.speed;
        let vy = Math.sin(fly.heading) * fly.speed * 0.7;
        if (air.mouse.here) {
          const dx = air.mouse.x - fly.x;
          const dy = air.mouse.y - fly.y;
          const distance = Math.hypot(dx, dy);
          // Curious, from afar; never quite onto the cursor.
          if (distance < 260 && distance > 40) {
            vx += (dx / distance) * 14 * (1 - distance / 260);
            vy += (dy / distance) * 14 * (1 - distance / 260);
          }
        }
        fly.x += vx * air.dt;
        fly.y += vy * air.dt;
        if (fly.x < -20) fly.x = width + 20;
        else if (fly.x > width + 20) fly.x = -20;
        if (fly.y < height * 0.05) fly.heading = Math.abs(fly.heading);
        else if (fly.y > height + 10) fly.heading = -Math.abs(fly.heading);
        const beat = Math.max(0, Math.sin(air.now * fly.pace + fly.phase));
        const light = beat ** 3 * air.veil(fly.x);
        if (light < 0.01) continue;
        const size = 16 * fly.size;
        pen.globalAlpha = light * 0.7;
        pen.drawImage(glow, fly.x - size, fly.y - size, size * 2, size * 2);
        pen.globalAlpha = light;
        pen.fillStyle = '#f4ffc0';
        pen.beginPath();
        pen.arc(fly.x, fly.y, fly.size, 0, TAU);
        pen.fill();
      }
      pen.globalAlpha = 1;
    },
  };
}

/** Leaves of autumn, or petals of spring, falling and turning over as they fall. */
function falling(width: number, height: number, area: number, blossom: boolean): Scene {
  const TINTS = blossom ? ['#f3d6dc', '#f7e4e6', '#ecc3cd', '#fbeff0'] : ['#c27a2c', '#a8541f', '#d39a3a', '#8e3b1c', '#b8892e'];
  const many = blossom ? area / 12000 : area / 20000;
  const pieces = Array.from({ length: Math.min(blossom ? 110 : 60, Math.round(many)) }, () => ({
    x: rnd(0, width),
    y: rnd(-height, height),
    size: blossom ? rnd(4, 7) : rnd(6, 11),
    fall: blossom ? rnd(16, 30) : rnd(22, 40),
    spin: rnd(-1.2, 1.2),
    angle: rnd(0, TAU),
    flip: rnd(0, TAU),
    flipPace: rnd(1, 2.6),
    phase: rnd(0, TAU),
    tint: TINTS[Math.floor(Math.random() * TINTS.length)],
    light: rnd(0.55, 0.85),
  }));
  return {
    draw(pen, air) {
      if (!blossom) wash(pen, width * 0.5, height * 1.1, height, '120,60,20', 0.12);
      else wash(pen, width * 0.5, -height * 0.1, height, '200,150,170', 0.06);
      // Now and then a gust: the whole air leans one way, then the other.
      const gust = Math.sin(air.now * 0.00013) * 0.6 + Math.sin(air.now * 0.00041 + 2) * 0.4;
      for (const piece of pieces) {
        piece.y += piece.fall * air.dt;
        piece.x += (gust * 22 + Math.sin(air.now * 0.0009 + piece.phase) * 12) * air.dt;
        piece.angle += piece.spin * air.dt;
        piece.flip += piece.flipPace * air.dt;
        blowAway(piece, air, 120, 140);
        if (piece.y > height + 14) [piece.y, piece.x] = [-14, rnd(-40, width + 40)];
        if (piece.x < -20) piece.x += width + 40;
        else if (piece.x > width + 20) piece.x -= width + 40;
        const turned = Math.cos(piece.flip);
        pen.save();
        pen.translate(piece.x, piece.y);
        pen.rotate(piece.angle);
        pen.scale(0.25 + 0.75 * Math.abs(turned), 1);
        // The underside is paler.
        pen.globalAlpha = piece.light * (turned < 0 ? 0.75 : 1) * air.veil(piece.x);
        pen.fillStyle = piece.tint;
        const r = piece.size;
        pen.beginPath();
        pen.moveTo(-r, 0);
        pen.quadraticCurveTo(0, -r * (blossom ? 0.75 : 0.55), r, 0);
        pen.quadraticCurveTo(0, r * (blossom ? 0.75 : 0.55), -r, 0);
        pen.fill();
        if (!blossom) {
          pen.globalAlpha *= 0.5;
          pen.strokeStyle = '#3a1a08';
          pen.lineWidth = 0.6;
          pen.beginPath();
          pen.moveTo(-r, 0);
          pen.lineTo(r * 0.9, 0);
          pen.stroke();
        }
        pen.restore();
      }
      pen.globalAlpha = 1;
    },
  };
}
