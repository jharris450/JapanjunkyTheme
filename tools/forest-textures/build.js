import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, 'sources');
const OUT_DIR = path.join(__dirname, '..', '..', 'assets');

const TEXTURES = [
  { src: 'cedar_bark_src.jpg',  out: 'cedar_bark.png',         w: 256,  h: 512 },
  { src: 'cedar_moss_src.jpg',  out: 'cedar_moss_base.png',    w: 256,  h: 256 },
  { src: 'shimenawa_src.jpg',   out: 'shimenawa_rope.png',     w: 512,  h: 128 },
  { src: 'shide_src.jpg',       out: 'shide_paper.png',        w: 64,   h: 128, alpha: true },
  { src: 'hokora_src.jpg',      out: 'hokora_stone.png',       w: 256,  h: 256, alpha: true },
  { src: 'jizo_src.jpg',        out: 'jizo_face.png',          w: 128,  h: 256, alpha: true },
  { src: 'ishidoro_src.jpg',    out: 'ishidoro_stone.png',     w: 128,  h: 256, alpha: true },
  { src: 'sotoba_src.jpg',      out: 'sotoba_wood.png',        w: 64,   h: 512, alpha: true },
  { src: 'haka_src.jpg',        out: 'haka_stone.png',         w: 128,  h: 128, alpha: true },
  { src: 'needles_src.jpg',     out: 'ground_needles.png',     w: 512,  h: 512 },
  { src: 'moss_src.jpg',        out: 'moss_patch.png',         w: 256,  h: 256 },
  { src: 'silhouette_src.jpg',  out: 'silhouette_trunks.png',  w: 1024, h: 512, alpha: true }
];

async function processTexture(t) {
  const src = path.join(SRC_DIR, t.src);
  const out = path.join(OUT_DIR, t.out);

  let pipe = sharp(src)
    .resize(t.w, t.h, { fit: 'cover' })
    .modulate({ saturation: 1.4, brightness: 1.05 })
    .tint({ r: 255, g: 215, b: 170 });

  if (t.alpha) pipe = pipe.ensureAlpha();
  pipe = pipe.png({ palette: true, colors: 32, dither: 1.0 });

  await pipe.toFile(out);
  console.log(`✓ ${t.src} → ${t.out} (${t.w}×${t.h})`);
}

async function buildAtlas() {
  const ATLAS = path.join(OUT_DIR, 'shrine_atlas.png');
  const slots = [
    { file: 'jizo_face.png',      x: 0,    y: 0,   w: 128, h: 256 },
    { file: 'ishidoro_stone.png', x: 128,  y: 0,   w: 128, h: 256 },
    { file: 'sotoba_wood.png',    x: 256,  y: 0,   w: 64,  h: 512 },
    { file: 'haka_stone.png',     x: 320,  y: 0,   w: 128, h: 128 },
    { file: 'shide_paper.png',    x: 448,  y: 0,   w: 64,  h: 128 }
  ];
  const composite = slots.map(s => ({
    input: path.join(OUT_DIR, s.file),
    left: s.x,
    top:  s.y
  }));
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r:0,g:0,b:0,alpha:0 } }
  })
    .composite(composite)
    .png()
    .toFile(ATLAS);

  const uv = {};
  for (const s of slots) {
    uv[s.file.replace('.png', '')] = {
      u0: s.x / 1024,
      v0: 1 - (s.y + s.h) / 1024,
      u1: (s.x + s.w) / 1024,
      v1: 1 - s.y / 1024
    };
  }
  await writeFile(
    path.join(OUT_DIR, 'shrine_atlas.json'),
    JSON.stringify(uv, null, 2)
  );
  console.log('✓ shrine_atlas.png + shrine_atlas.json');
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const t of TEXTURES) {
    try {
      await processTexture(t);
    } catch (e) {
      console.error(`✗ ${t.src}: ${e.message}`);
    }
  }
  try { await buildAtlas(); } catch (e) { console.error(`✗ atlas: ${e.message}`); }
}

main();
