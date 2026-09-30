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
 * PARTS — a model entry is a list of named parts (build.py). Each part becomes
 * its own Mesh parented to a tilt node under `group`, positioned AT the part's
 * pivot (its positions are exported relative to that pivot), so hinging it is a
 * plain `mesh.rotation.x`. A part flagged `transparent` (the record player's
 * smoked dust cover) gets transparent + depthWrite:false + renderOrder 1 and
 * takes its opacity from the atlas alpha — the dither path preserves alpha, so
 * the painted alpha (~96/255) is what reaches the framebuffer. A part flagged
 * `hidden` starts invisible (the record player's LP: the platter ships blank);
 * `spin` turns it about Y while setPlaying(true); `dynamic_rect` is the atlas
 * rect [x, y, w, h] that setLoaded() repaints with the loaded product's artwork.
 *
 * window.JJ_ModelBuilder.build(THREE, name, texUrl) -> {
 *   group, meshes, restOpen,
 *   setOpen(t), setLoaded(product|null), setPlaying(b), update(dt), dispose()
 * }
 * setOpen(t) drives every part that declares an `open_angle` to
 * `open_angle * clamp(t)`; it is a no-op for a model without one. `restOpen` is
 * `view.rest_open` (0..1) — the lid state a freshly built model sits at, already
 * applied before build() returns (record 1 = open, cassette 0).
 *
 * setLoaded(product) shows every `hidden` part and, for every part carrying a
 * `dynamic_rect`, builds a one-off texture: the live atlas canvas copied, the
 * product's `labelUrl` (the 3rd product image) drawn cover-fit into that rect,
 * that rect dithered through the active palette, and the result bound to the
 * part's material. setLoaded(null) hides the parts again and drops the texture,
 * so the painted fallback label comes back. An empty/failed labelUrl also keeps
 * the fallback. setPlaying(b) + update(dt) spin the `spin` parts at 33⅓ rpm.
 * Models with none of those parts no-op through all three, so player.js drives
 * every model through one contract.
 */
(function () {
  'use strict';

  var TEX_DIM = 256;   // atlas size from tools/blender/build.py
  var SHADER_RES = 240; // matches the player's 240 px canvas backing store
  // 33 1/3 rpm = 100/3 / 60 rev/s * 2pi = 3.49 rad/s. The speed a `spin` part
  // (the record player's LP) turns at while a song plays.
  var SPIN_RATE = 3.49;

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

    // Parts. Pre-parts entries kept the arrays at the top level; treat one of
    // those as a single opaque 'body' part at the origin.
    var parts = (data.parts && data.parts.length) ? data.parts : [{
      name: 'body', pivot: [0, 0, 0], transparent: false,
      positions: data.positions, uvs: data.uvs, indices: data.indices
    }];

    var geos = [];
    for (var gi = 0; gi < parts.length; gi++) {
      var pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(parts[gi].positions, 3));
      pg.setAttribute('uv', new THREE.Float32BufferAttribute(parts[gi].uvs, 2));
      pg.setIndex(new THREE.Uint16BufferAttribute(parts[gi].indices, 1));
      geos.push(pg);
    }

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

    var mats = [];
    var tex = null;
    var atlasCanvas = null;   // the dithered atlas canvas, when the dither path is live
    var dynParts = [];        // { mesh, mat, rect, tex } for parts with a dynamic_rect

    function bindTexture(m, t) {
      if (m.uniforms && m.uniforms.uTexture) m.uniforms.uTexture.value = t;
      else { m.map = t; m.needsUpdate = true; }
    }

    // A material currently showing a dynamic texture must not be reset to the
    // atlas behind setLoaded's back (the plain-texture fallback calls assign()).
    function holdsDynamic(m) {
      for (var i = 0; i < dynParts.length; i++) {
        if (dynParts[i].mat === m && dynParts[i].tex) return true;
      }
      return false;
    }

    function assign(next) {
      if (disposed) { try { next.dispose(); } catch (e) {} return; }
      var prev = tex;
      tex = next;
      for (var mi = 0; mi < mats.length; mi++) {
        if (!holdsDynamic(mats[mi])) bindTexture(mats[mi], next);
      }
      if (prev && prev !== next) { try { prev.dispose(); } catch (e) {} }
    }

    // Dithered path: Image -> 256x256 canvas -> Floyd-Steinberg -> CanvasTexture.
    function ditheredTexture(palette) {
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = TEX_DIM;
      atlasCanvas = canvas;
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
          atlasCanvas = null;   // tainted: copying it would taint the dynamic one too
          assign(plainTexture());
        }
      };
      img.onerror = function () {
        if (disposed) return;
        console.error('[JJ_ModelBuilder] atlas failed to load: ' + texUrl);
        atlasCanvas = null;
        assign(plainTexture()); // undithered fallback
      };
      img.src = texUrl;
      return canvasTex;
    }

    var palette = activePalette();
    tex = (palette && typeof document !== 'undefined')
      ? ditheredTexture(palette)
      : plainTexture();

    function makeMaterial(transparent) {
      var m;
      if (ps1) {
        m = new THREE.ShaderMaterial({
          uniforms: {
            uResolution: { value: SHADER_RES },
            uTexture: { value: tex }
          },
          vertexShader: window.JJ_PS1.vert,
          fragmentShader: window.JJ_PS1.frag,
          side: THREE.FrontSide
        });
      } else {
        m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
      }
      if (transparent) {
        // Opacity is the atlas alpha (the frag is a passthrough and the dither
        // path restores alpha byte-for-byte), so the material only has to enable
        // blending and stop writing depth — otherwise the cover would occlude
        // the deck it is meant to show through.
        m.transparent = true;
        m.depthWrite = false;
      }
      return m;
    }

    var group = new THREE.Group();
    var view = data.view || {};
    var s = (typeof view.scale === 'number') ? view.scale : 1;
    group.scale.set(s, s, s);
    // VIEW.tilt lives on a node BETWEEN the group and the parts: player.js spins
    // the group about Y, so the tilt must not be on the same object or the spin
    // would happen in the tilted frame and the unit would wobble.
    var tiltNode = new THREE.Object3D();
    tiltNode.rotation.x = (typeof view.tilt === 'number') ? view.tilt : 0;
    group.add(tiltNode);

    var meshes = [];
    var hinges = [];   // { mesh, angle } for every part with an open_angle
    var hiddenMeshes = [];  // parts that only appear once media is loaded
    var spinners = [];      // parts that turn while a song plays
    for (var pi = 0; pi < parts.length; pi++) {
      var part = parts[pi];
      var pm = makeMaterial(!!part.transparent);
      mats.push(pm);
      var pmesh = new THREE.Mesh(geos[pi], pm);
      var pv = part.pivot || [0, 0, 0];
      pmesh.position.set(pv[0] || 0, pv[1] || 0, pv[2] || 0);
      if (part.transparent) pmesh.renderOrder = 1;   // draw after the opaque parts
      if (part.hidden) { pmesh.visible = false; hiddenMeshes.push(pmesh); }
      if (part.spin) spinners.push(pmesh);
      if (part.dynamic_rect && part.dynamic_rect.length === 4) {
        dynParts.push({ mesh: pmesh, mat: pm, rect: part.dynamic_rect, tex: null });
      }
      tiltNode.add(pmesh);
      meshes.push(pmesh);
      if (typeof part.open_angle === 'number') hinges.push({ mesh: pmesh, angle: part.open_angle });
    }

    function clamp01(t) {
      t = +t;
      if (!(t > 0)) return 0;      // also catches NaN
      return t > 1 ? 1 : t;
    }

    function setOpen(t) {
      var k = clamp01(t);
      for (var i = 0; i < hinges.length; i++) hinges[i].mesh.rotation.x = hinges[i].angle * k;
    }

    var restOpen = clamp01(view.rest_open);
    setOpen(restOpen);

    // ---- loaded media ------------------------------------------------------
    // The atlas as a canvas we are allowed to read back. On the dither path that
    // is the canvas the dithered atlas lives in; on the plain path the loaded
    // Image is drawn into a fresh canvas instead. null = not usable yet (still
    // loading, or tainted), in which case the painted fallback label stands.
    function atlasSource() {
      if (atlasCanvas) return atlasCanvas;
      var img = tex && tex.image;
      return (img && (img.width || img.naturalWidth)) ? img : null;
    }

    function dropDynamic() {
      for (var i = 0; i < dynParts.length; i++) {
        var d = dynParts[i];
        if (!d.tex) continue;
        var old = d.tex;
        d.tex = null;                 // clear first: holdsDynamic() must say no
        bindTexture(d.mat, tex);      // back to the shared atlas
        try { old.dispose(); } catch (e) {}
      }
    }

    // Copy the atlas, draw `img` cover-fit into each dynamic rect, dither that
    // rect, bind the result. Throws (and is caught by the caller) if the canvas
    // turns out not to be readable.
    function paintDynamic(img) {
      var src = atlasSource();
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      if (!src || !iw || !ih) return;
      var palette = activePalette();
      for (var i = 0; i < dynParts.length; i++) {
        var d = dynParts[i];
        var r = d.rect;
        var canvas = document.createElement('canvas');
        canvas.width = canvas.height = TEX_DIM;
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, TEX_DIM, TEX_DIM);
        ctx.drawImage(src, 0, 0, TEX_DIM, TEX_DIM);
        // cover-fit, centred: fill the rect, crop the overflow
        var k = Math.max(r[2] / iw, r[3] / ih);
        var dw = iw * k, dh = ih * k;
        ctx.save();
        ctx.beginPath();
        ctx.rect(r[0], r[1], r[2], r[3]);
        ctx.clip();
        ctx.drawImage(img, r[0] + (r[2] - dw) / 2, r[1] + (r[3] - dh) / 2, dw, dh);
        ctx.restore();
        if (palette) {
          // Same alpha dance as the atlas path: dither RGB, restore alpha, so the
          // label stays fully opaque and nothing bleeds across its edge.
          var id = ctx.getImageData(r[0], r[1], r[2], r[3]);
          var n = r[2] * r[3], p, a;
          var alpha = new Uint8Array(n);
          for (p = 0, a = 0; a < n; p += 4, a++) alpha[a] = id.data[p + 3];
          window.JJ_Dither.ditherImageData(id, r[2], r[3], palette);
          for (p = 0, a = 0; a < n; p += 4, a++) id.data[p + 3] = alpha[a];
          ctx.putImageData(id, r[0], r[1]);
        }
        var next = applyTexParams(new THREE.CanvasTexture(canvas));
        var old = d.tex;
        d.tex = next;
        bindTexture(d.mat, next);
        if (old) { try { old.dispose(); } catch (e) {} }
      }
    }

    // Bumped on every setLoaded call so a slow label image cannot land on top of
    // a later load (or an eject), the same way `disposed` guards the atlas.
    var loadToken = 0;

    function setLoaded(product) {
      if (disposed) return;
      var token = ++loadToken;
      var i;
      if (!product) {
        for (i = 0; i < hiddenMeshes.length; i++) hiddenMeshes[i].visible = false;
        dropDynamic();
        return;
      }
      for (i = 0; i < hiddenMeshes.length; i++) hiddenMeshes[i].visible = true;
      var url = product.labelUrl;
      if (!url || !dynParts.length || typeof document === 'undefined') {
        dropDynamic();   // no artwork: the atlas's own painted fallback label
        return;
      }
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        if (disposed || token !== loadToken) return;
        try {
          paintDynamic(img);
        } catch (e) {
          // Tainted canvas (a CDN without CORS headers) or a failed upload: keep
          // the painted fallback rather than binding something unrenderable.
          console.warn('[JJ_ModelBuilder] label skipped (canvas not readable): ' + url);
          dropDynamic();
        }
      };
      img.onerror = function () {
        if (disposed || token !== loadToken) return;
        console.warn('[JJ_ModelBuilder] label failed to load: ' + url);
        dropDynamic();
      };
      img.src = url;
    }

    // ---- playing spin ------------------------------------------------------
    var playing = false;
    function setPlaying(b) { playing = !!b; }
    function update(dt) {
      if (!playing || !spinners.length) return;
      dt = +dt;
      if (!(dt > 0)) return;          // also catches NaN
      for (var i = 0; i < spinners.length; i++) spinners[i].rotation.y += dt * SPIN_RATE;
    }

    function dispose() {
      disposed = true;
      for (var i = 0; i < geos.length; i++) { try { geos[i].dispose(); } catch (e) {} }
      try { if (tex) tex.dispose(); } catch (e) {}
      for (var d = 0; d < dynParts.length; d++) {
        if (dynParts[d].tex) { try { dynParts[d].tex.dispose(); } catch (e) {} }
        dynParts[d].tex = null;
      }
      for (var j = 0; j < mats.length; j++) { try { mats[j].dispose(); } catch (e) {} }
    }
    return {
      group: group, meshes: meshes, restOpen: restOpen,
      setOpen: setOpen, setLoaded: setLoaded,
      setPlaying: setPlaying, update: update, dispose: dispose
    };
  }

  window.JJ_ModelBuilder = { build: build };
})();
