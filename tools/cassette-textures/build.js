/**
 * Crops the WM-F45 reference photos into face textures for the cassette model.
 * Run: node tools/cassette-textures/build.js
 * Source dir defaults to the user's desktop folder; override with $CASSETTE_SRC.
 *
 * Outputs (assets/): cassette-front.png (window punched to alpha), cassette-back,
 * cassette-left, cassette-right, cassette-top, cassette-deck, cassette-lid-inner.
 * Crop boxes are in SOURCE pixels — eyeball the outputs and tune as needed.
 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const SRC = process.env.CASSETTE_SRC || 'C:/Users/Jacob/Desktop/cassette';
const OUT = path.resolve(__dirname, '../../assets');
const MAX = 512; // longest output edge (NPOT ok: model uses NearestFilter + no mipmaps)

// { src, out, crop:{left,top,width,height} }  — crops in source pixels.
const FACES = [
  { src: 'front.png',      out: 'cassette-front.png',     crop: { left: 70,  top: 30,  width: 720, height: 910 } },
  { src: 'back.png',       out: 'cassette-back.png',      crop: { left: 55,  top: 20,  width: 655, height: 870 } },
  { src: 'leftside.png',   out: 'cassette-left.png',      crop: { left: 110, top: 120, width: 770, height: 370 } },
  { src: 'rightside.png',  out: 'cassette-right.png',     crop: { left: 110, top: 80,  width: 770, height: 380 } },
  { src: 'top.png',        out: 'cassette-top.png',       crop: { left: 110, top: 150, width: 730, height: 370 } },
  { src: 'openbottom.png', out: 'cassette-deck.png',      crop: { left: 80,  top: 120, width: 720, height: 720 } },
  { src: 'opentop.png',    out: 'cassette-lid-inner.png', crop: { left: 60,  top: 40,  width: 640, height: 560 } }
];

// Window opening as a fraction of the cropped FRONT output (rounded rect).
const WINDOW = { x: 0.235, y: 0.125, w: 0.50, h: 0.445, r: 0.18 };

function fitSize(w, h) {
  var s = MAX / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

async function run() {
  if (!fs.existsSync(SRC)) {
    console.error('Source folder not found: ' + SRC + '\nSet CASSETTE_SRC to the reference photo folder.');
    process.exit(1);
  }
  for (const f of FACES) {
    var srcPath = path.join(SRC, f.src);
    if (!fs.existsSync(srcPath)) {
      console.error('Missing source file: ' + srcPath);
      process.exit(1);
    }
    const dim = fitSize(f.crop.width, f.crop.height);
    let img = sharp(srcPath).extract(f.crop).resize(dim.w, dim.h);

    if (f.out === 'cassette-front.png') {
      // Punch a transparent rounded-rect window via a dest-out composite.
      const wx = Math.round(WINDOW.x * dim.w), wy = Math.round(WINDOW.y * dim.h);
      const ww = Math.round(WINDOW.w * dim.w), wh = Math.round(WINDOW.h * dim.h);
      const rr = Math.round(WINDOW.r * Math.min(ww, wh));
      const mask = Buffer.from(
        '<svg width="' + dim.w + '" height="' + dim.h + '">' +
        '<rect x="' + wx + '" y="' + wy + '" width="' + ww + '" height="' + wh +
        '" rx="' + rr + '" ry="' + rr + '" fill="#fff"/></svg>',
        'utf8'
      );
      img = img.ensureAlpha().composite([{ input: mask, blend: 'dest-out' }]);
    }

    await img.png().toFile(path.join(OUT, f.out));
    console.log('wrote ' + f.out + ' (' + dim.w + 'x' + dim.h + ')');
  }
  console.log('done.');
}

run().catch(function (err) { console.error(err && err.message ? err.message : err); process.exit(1); });
