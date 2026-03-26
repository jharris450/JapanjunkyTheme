#!/usr/bin/env node
/**
 * convert-fragments.js
 *
 * Converts a directory of GIF files into sprite sheet PNGs + metadata JSON
 * for the JapanJunky memory fragments system.
 *
 * Usage: node convert-fragments.js <input-dir> <output-dir>
 *
 * Requires: ffmpeg, ffprobe, ImageMagick v7 (magick command)
 */

var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var os = require('os');

var args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node convert-fragments.js <input-dir> <output-dir>');
  process.exit(1);
}

var inputDir = args[0];
var outputDir = args[1];

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

console.log('Found ' + gifs.length + ' GIF files');

var liquidLines = [];

gifs.forEach(function (gifName, idx) {
  var gifPath = path.join(inputDir, gifName);
  var baseName = gifName.replace(/\.gif$/i, '').replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
  var fragName = 'frag-' + baseName;

  console.log('[' + (idx + 1) + '/' + gifs.length + '] Processing: ' + gifName);

  // Create temp dir for frames
  var tmpDir = path.join(os.tmpdir(), 'frag-' + baseName + '-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 1. Extract frames
    child_process.execSync(
      'ffmpeg -i "' + gifPath + '" -vsync 0 "' + path.join(tmpDir, 'frame_%04d.png') + '"',
      { stdio: 'pipe' }
    );

    // 2. Count frames
    var frames = fs.readdirSync(tmpDir).filter(function (f) {
      return /^frame_\d+\.png$/.test(f);
    });
    var frameCount = frames.length;

    if (frameCount === 0) {
      console.error('  No frames extracted, skipping');
      return;
    }

    // 3. Get dimensions from first frame
    var identifyOut = child_process.execSync(
      'magick identify -format "%w %h" "' + path.join(tmpDir, 'frame_0001.png') + '"',
      { encoding: 'utf8' }
    ).trim();
    var dims = identifyOut.split(' ');
    var frameW = parseInt(dims[0], 10);
    var frameH = parseInt(dims[1], 10);

    // 4. Get FPS from per-frame delays (GIFs define delay per frame, not a stream rate)
    var fps = 10; // default fallback
    try {
      var probeOut = child_process.execSync(
        'ffprobe -v quiet -print_format json -show_entries frame=duration_time "' + gifPath + '"',
        { encoding: 'utf8' }
      );
      var probeData = JSON.parse(probeOut);
      if (probeData.frames && probeData.frames.length > 0) {
        var totalDuration = 0;
        var validFrames = 0;
        for (var pi = 0; pi < probeData.frames.length; pi++) {
          var dur = parseFloat(probeData.frames[pi].duration_time);
          if (dur > 0) {
            totalDuration += dur;
            validFrames++;
          }
        }
        if (validFrames > 0) {
          var avgDuration = totalDuration / validFrames;
          var probeFps = Math.round(1.0 / avgDuration);
          if (probeFps > 0 && probeFps < 60) {
            fps = probeFps;
          }
        }
      }
    } catch (e) {
      // fallback to default fps
    }

    // 5. Compute grid (aim for roughly square)
    var cols = Math.ceil(Math.sqrt(frameCount));
    var rows = Math.ceil(frameCount / cols);

    // 6. Assemble sprite sheet
    var sheetPath = path.join(outputDir, fragName + '.png');
    child_process.execSync(
      'magick montage "' + path.join(tmpDir, 'frame_*.png') + '"' +
      ' -tile ' + cols + 'x' + rows +
      ' -geometry ' + frameW + 'x' + frameH + '+0+0' +
      ' -background transparent' +
      ' "' + sheetPath + '"',
      { stdio: 'pipe' }
    );

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

    // 8. Append Liquid config line
    liquidLines.push(
      "        { url: {{ '" + fragName + ".png' | asset_url | json }}, " +
      "frames: " + frameCount + ", cols: " + cols + ", rows: " + rows + ", " +
      "fps: " + fps + ", w: " + frameW + ", h: " + frameH + " }"
    );

    console.log('  -> ' + fragName + '.png (' + cols + 'x' + rows + ' grid, ' +
      frameCount + ' frames, ' + fps + ' fps, ' + frameW + 'x' + frameH + ')');

  } finally {
    // Cleanup temp frames
    try {
      var tmpFiles = fs.readdirSync(tmpDir);
      tmpFiles.forEach(function (f) { fs.unlinkSync(path.join(tmpDir, f)); });
      fs.rmdirSync(tmpDir);
    } catch (e) { /* best effort */ }
  }
});

// Write Liquid config snippet
var liquidPath = path.join(outputDir, 'fragments-config.liquid');
var liquidContent = '      fragments: [\n' + liquidLines.join(',\n') + '\n      ]';
fs.writeFileSync(liquidPath, liquidContent);

console.log('\nDone! ' + liquidLines.length + ' sprite sheets generated.');
console.log('Liquid config snippet saved to: ' + liquidPath);
console.log('\nNext steps:');
console.log('1. Upload all frag-*.png files to Shopify assets/');
console.log('2. Copy contents of fragments-config.liquid into theme.liquid JJ_SCREENSAVER_CONFIG');
