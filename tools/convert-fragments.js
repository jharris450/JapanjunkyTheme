#!/usr/bin/env node
/**
 * convert-fragments.js
 *
 * Converts a directory of GIF files into sprite sheet PNGs + metadata JSON
 * for the JapanJunky memory fragments system.
 *
 * Usage: node convert-fragments.js <input-dir> <output-dir> [max-frames]
 *
 * Requires: sharp, gif-frames (npm packages)
 *
 * max-frames defaults to 24. Frames are evenly sampled from the source GIF
 * to keep sprite sheets small while preserving animation feel.
 */

var fs = require('fs');
var path = require('path');
var gifFrames = require('gif-frames');
var sharp = require('sharp');

var args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node convert-fragments.js <input-dir> <output-dir> [max-frames]');
  process.exit(1);
}

var inputDir = args[0];
var outputDir = args[1];
var maxFrames = parseInt(args[2], 10) || 24;

if (!fs.existsSync(inputDir)) {
  console.error('Input directory does not exist: ' + inputDir);
  process.exit(1);
}

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Find all GIF files
var gifs = fs.readdirSync(inputDir).filter(function (f) {
  return /\.gif$/i.test(f);
});

if (gifs.length === 0) {
  console.error('No GIF files found in: ' + inputDir);
  process.exit(1);
}

console.log('Found ' + gifs.length + ' GIF files (max ' + maxFrames + ' frames per sheet)');

/**
 * Sample N evenly-spaced indices from a range of total.
 */
function sampleIndices(total, n) {
  if (n >= total) {
    var all = [];
    for (var i = 0; i < total; i++) all.push(i);
    return all;
  }
  var indices = [];
  for (var i = 0; i < n; i++) {
    indices.push(Math.round(i * (total - 1) / (n - 1)));
  }
  return indices;
}

/**
 * Process a single GIF file into a sprite sheet.
 */
async function processGif(gifName, idx) {
  var gifPath = path.join(inputDir, gifName);
  var baseName = gifName.replace(/\.gif$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  var fragName = 'frag-' + baseName;

  console.log('[' + (idx + 1) + '/' + gifs.length + '] Processing: ' + gifName);

  // 1. Extract all frames
  var allFrameData = await gifFrames({
    url: gifPath,
    frames: 'all',
    outputType: 'png',
    cumulative: true
  });

  var totalFrames = allFrameData.length;
  if (totalFrames === 0) {
    console.error('  No frames extracted, skipping');
    return null;
  }

  var frameW = allFrameData[0].frameInfo.width;
  var frameH = allFrameData[0].frameInfo.height;

  // 2. Compute FPS from GIF delays (in centiseconds)
  var delays = allFrameData.map(function (d) { return d.frameInfo.delay; });
  var avgDelay = delays.reduce(function (a, b) { return a + b; }, 0) / delays.length;
  var sourceFps = avgDelay > 0 ? (100 / avgDelay) : 10;

  // 3. Sample frames
  var indices = sampleIndices(totalFrames, maxFrames);
  var frameCount = indices.length;

  // Compute effective FPS after sampling
  var sampleRatio = totalFrames / frameCount;
  var fps = Math.max(1, Math.round(sourceFps / sampleRatio));

  console.log('  Source: ' + totalFrames + ' frames @ ~' + Math.round(sourceFps) + 'fps');
  console.log('  Sampled: ' + frameCount + ' frames @ ' + fps + 'fps');

  // 4. Read sampled frame PNGs into buffers
  var frameBuffers = [];
  for (var i = 0; i < indices.length; i++) {
    var frameData = allFrameData[indices[i]];
    var chunks = [];
    await new Promise(function (resolve, reject) {
      var stream = frameData.getImage();
      stream.on('data', function (chunk) { chunks.push(chunk); });
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    frameBuffers.push(Buffer.concat(chunks));
  }

  // 5. Compute grid layout (aim for roughly square)
  var cols = Math.ceil(Math.sqrt(frameCount));
  var rows = Math.ceil(frameCount / cols);

  // 6. Assemble sprite sheet using sharp
  var sheetW = cols * frameW;
  var sheetH = rows * frameH;

  // Build composite operations
  var composites = [];
  for (var i = 0; i < frameBuffers.length; i++) {
    var col = i % cols;
    var row = Math.floor(i / cols);
    composites.push({
      input: frameBuffers[i],
      left: col * frameW,
      top: row * frameH
    });
  }

  var sheetPath = path.join(outputDir, fragName + '.png');
  await sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toFile(sheetPath);

  // 7. Write metadata JSON
  var metaPath = path.join(outputDir, fragName + '.json');
  var meta = {
    name: baseName,
    frameCount: frameCount,
    columns: cols,
    rows: rows,
    fps: fps,
    width: frameW,
    height: frameH
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  console.log('  -> ' + fragName + '.png (' + cols + 'x' + rows + ' grid, ' +
    frameCount + ' frames, ' + fps + 'fps, ' + frameW + 'x' + frameH + ')');

  // 8. Return Liquid config line
  return "        { url: {{ '" + fragName + ".png' | asset_url | json }}, " +
    "frames: " + frameCount + ", cols: " + cols + ", rows: " + rows + ", " +
    "fps: " + fps + ", w: " + frameW + ", h: " + frameH + " }";
}

// Main
(async function () {
  var liquidLines = [];

  for (var i = 0; i < gifs.length; i++) {
    var line = await processGif(gifs[i], i);
    if (line) liquidLines.push(line);
  }

  // Write Liquid config snippet
  var liquidPath = path.join(outputDir, 'fragments-config.liquid');
  var liquidContent = '      fragments: [\n' + liquidLines.join(',\n') + '\n      ]';
  fs.writeFileSync(liquidPath, liquidContent);

  console.log('\nDone! ' + liquidLines.length + ' sprite sheets generated.');
  console.log('Liquid config snippet saved to: ' + liquidPath);
  console.log('\nNext steps:');
  console.log('1. Upload all frag-*.png files to Shopify assets/');
  console.log('2. Copy contents of fragments-config.liquid into theme.liquid JJ_SCREENSAVER_CONFIG');
})();
