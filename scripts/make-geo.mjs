// Builds the outlines the globe draws: Natural Earth's country shapes (the world-atlas
// package), with each country's id rewritten from its ISO number to the two-letter code
// that `setting.countries` uses in src/data/books.ts. Run with `npm run geo`.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import countries from 'i18n-iso-countries';

const require = createRequire(import.meta.url);

// Shapes Natural Earth draws without an ISO number.
const BY_NAME = { Kosovo: 'XK', 'N. Cyprus': 'CY', Somaliland: 'SO' };

await mkdir('public/geo', { recursive: true });

for (const detail of ['110m', '50m']) {
  const world = JSON.parse(await readFile(require.resolve(`world-atlas/countries-${detail}.json`), 'utf8'));
  const unknown = [];
  for (const shape of world.objects.countries.geometries) {
    const code = (shape.id && countries.numericToAlpha2(shape.id)) || BY_NAME[shape.properties.name];
    if (!code) unknown.push(shape.properties.name);
    shape.id = code ?? null;
    delete shape.properties;
  }
  delete world.objects.land;
  const file = `public/geo/world-${detail}.json`;
  const text = JSON.stringify(world);
  await writeFile(file, text);
  console.log(`${file}: ${world.objects.countries.geometries.length} shapes, ${Math.round(text.length / 1024)} KB`, unknown.length ? `(no code: ${unknown.join(', ')})` : '');
}
