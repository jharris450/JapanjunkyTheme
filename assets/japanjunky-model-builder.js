/**
 * japanjunky-model-builder.js
 * Turns a generated window.JJ_MODELS entry (tools/blender/build.py) into a
 * three.js group for the toolbox player. Static PS1 look: BufferGeometry +
 * unlit material, nearest-filter 256x256 atlas, no lighting.
 *
 * Material: when window.JJ_PS1 is present the mesh uses the shared PS1
 * vertex-snapping ShaderMaterial (same one the bundle stage and the product
 * viewer use, shaderRes 240 to match the player's 240 px backing store);
 * otherwise it falls back to MeshBasicMaterial.
 *
 * Texture: when window.JJ_Dither is present the atlas is loaded through an
 * Image, drawn to a 256x256 canvas, Floyd-Steinberg dithered to the site
 * palette and used as a CanvasTexture. window.JJ_MODEL_DITHER selects the
 * palette: 'site' (default) | 'neutral' | 'off'.
 *
 * COLOUR SPACE — the PS1 frag is a raw passthrough (gl_FragColor = texel) and
 * three injects no decode/encode into a ShaderMaterial. On the shader path the
 * texture therefore stays at NoColorSpace so the texel bytes reach the (also
 * unencoded) framebuffer unchanged and a dithered palette colour renders as
 * the exact palette RGB. Tagging it SRGBColorSpace would make three upload it
 * as SRGB8_ALPHA8, the sampler would hand back linear values, and with no
 * output encoding the model would come out dark/washed. The MeshBasicMaterial
 * fallback DOES get three's own decode+encode, so that path keeps
 * SRGBColorSpace. (bundle-stage.js does the same: its CanvasTextures are left
 * at the default NoColorSpace and fed straight to the PS1 shader.)
 *
 * window.JJ_ModelBuilder.build(THREE, name, texUrl) -> {
 *   group, setOpen(t), setPlaying(b), update(dt), dispose()
 * }
 * setOpen / setPlaying / update are no-ops (no animation yet) but kept so
 * player.js drives every model through one contract.
 */
(function () {
  'use strict';

  var TEX_DIM = 256;   // atlas size from tools/blender/build.py
  var SHADER_RES = 240; // matches the player's 240 px canvas backing store

  // Default dither palette. theme.liquid (or the harness) may override this
  // before the builder runs for an easy on-site switch.
  if (typeof window.JJ_MODEL_DITHER === 'undefined') window.JJ_MODEL_DITHER = 'site';

  function ditherMode() {
    var m = window.JJ_MODEL_DITHER;
    return (m === 'neutral' || m === 'off') ? m : 'site';
  }

  // Active palette array, or null when dithering is off / unavailable.
  function activePalette() {
    var D = window.JJ_Dither;
    if (!D || typeof D.ditherImageData !== 'function') return null;
    var m = ditherMode();
    if (m === 'off') return null;
    return m === 'neutral' ? D.NEUTRAL_PALETTE : D.PALETTE;
  }

  function usePS1() {
    return !!(window.JJ_PS1 && window.JJ_PS1.vert && window.JJ_PS1.frag);
  }

  function build(THREE, name, texUrl) {
    var data = window.JJ_MODELS && window.JJ_MODELS[name];
    if (!data) throw new Error('JJ_ModelBuilder: unknown model ' + name);

    var ps1 = usePS1();
    var disposed = false;

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    geo.setIndex(new THREE.Uint16BufferAttribute(data.indices, 1));

    // Nearest / clamp / no mipmaps on every path; colour space per the note above.
    function applyTexParams(t) {
      t.generateMipmaps = false;
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.colorSpace = ps1 ? (THREE.NoColorSpace || '') : THREE.SRGBColorSpace;
      return t;
    }

    // Undithered path — the original behaviour.
    function plainTexture() {
      return applyTexParams(new THREE.TextureLoader().load(texUrl, undefined, undefined, function () {
        console.error('[JJ_ModelBuilder] atlas failed to load: ' + texUrl);
      }));
    }

    var mat = null;
    var tex = null;

    function assign(next) {
      if (disposed) { try { next.dispose(); } catch (e) {} return; }
      var prev = tex;
      tex = next;
      if (mat) {
        if (mat.uniforms && mat.uniforms.uTexture) mat.uniforms.uTexture.value = next;
        else { mat.map = next; mat.needsUpdate = true; }
      }
      if (prev && prev !== next) { try { prev.dispose(); } catch (e) {} }
    }

    // Dithered path: Image -> 256x256 canvas -> Floyd-Steinberg -> CanvasTexture.
    function ditheredTexture(palette) {
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = TEX_DIM;
      var canvasTex = applyTexParams(new THREE.CanvasTexture(canvas));
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        if (disposed) return;
        try {
          var ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, TEX_DIM, TEX_DIM);
          ctx.drawImage(img, 0, 0, TEX_DIM, TEX_DIM);
          var id = ctx.getImageData(0, 0, TEX_DIM, TEX_DIM);
          // ditherImageData leaves the alpha bytes alone but it DOES diffuse RGB
          // error into (and out of) fully transparent pixels, which bleeds fringe
          // colour along the atlas's 1-bit alpha edges. Snapshot alpha, dither,
          // restore alpha -> the cutout stays exactly 1-bit.
          var n = TEX_DIM * TEX_DIM;
          var alpha = new Uint8Array(n);
          var i, a;
          for (i = 0, a = 0; a < n; i += 4, a++) alpha[a] = id.data[i + 3];
          window.JJ_Dither.ditherImageData(id, TEX_DIM, TEX_DIM, palette);
          for (i = 0, a = 0; a < n; i += 4, a++) id.data[i + 3] = alpha[a];
          ctx.putImageData(id, 0, 0);
          canvasTex.needsUpdate = true;
        } catch (e) {
          // Tainted canvas (cross-origin CDN without CORS): a tainted canvas can't
          // be uploaded at all (texImage2D throws), so fall back to the plain
          // undithered TextureLoader path instead of retrying the canvas.
          console.warn('[JJ_ModelBuilder] dither skipped (canvas tainted): ' + texUrl);
          assign(plainTexture());
        }
      };
      img.onerror = function () {
        if (disposed) return;
        console.error('[JJ_ModelBuilder] atlas failed to load: ' + texUrl);
        assign(plainTexture()); // undithered fallback
      };
      img.src = texUrl;
      return canvasTex;
    }

    var palette = activePalette();
    tex = (palette && typeof document !== 'undefined')
      ? ditheredTexture(palette)
      : plainTexture();

    if (ps1) {
      mat = new THREE.ShaderMaterial({
        uniforms: {
          uResolution: { value: SHADER_RES },
          uTexture: { value: tex }
        },
        vertexShader: window.JJ_PS1.vert,
        fragmentShader: window.JJ_PS1.frag,
        side: THREE.FrontSide
      });
    } else {
      mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
    }

    var mesh = new THREE.Mesh(geo, mat);

    var group = new THREE.Group();
    group.add(mesh);
    var view = data.view || {};
    var s = (typeof view.scale === 'number') ? view.scale : 1;
    group.scale.set(s, s, s);
    mesh.rotation.x = (typeof view.tilt === 'number') ? view.tilt : 0;

    function noop() {}
    function dispose() {
      disposed = true;
      try { geo.dispose(); } catch (e) {}
      try { if (tex) tex.dispose(); } catch (e) {}
      try { mat.dispose(); } catch (e) {}
    }
    return { group: group, setOpen: noop, setPlaying: noop, update: noop, dispose: dispose };
  }

  window.JJ_ModelBuilder = { build: build };
})();
