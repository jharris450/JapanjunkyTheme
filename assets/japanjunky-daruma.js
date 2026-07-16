/* Daruma reroll trigger — the doll that replaced the [Reroll] button.
   Hover states are pure CSS (straw pegs pop out of the face holes); this
   file owns the click sequence: split the doll open, luminous gold smoke
   + sparks curl out and wrap the lifted top half while two physics-tumbled
   bone dice arc out of the opening (three.js scene on #jj-daruma-fx),
   THEN control passes back to bundle-stage's reroll; the shut doll rattles
   while the records shuffle. bundle-stage.js calls window.JJ_DARUMA.play(fn).

   FX canvas geometry (buffer px = CSS px / 2, canvas 300x360 CSS):
   doll center x 75, doll top y 103, seam (flap line, 55% down) y 138. */
(function () {
  'use strict';

  // Handheld: enabled (mobile spec 2026-07-15) — bundle-stage.js reparents
  // the doll + #jj-daruma-fx into the landing's daruma slot. The FX scene is
  // reparent-safe and DPR-independent: it renders to a fixed 150x180 ortho
  // buffer (setSize updateStyle=false; CX/SEAM/TOP are buffer coords, no
  // viewport/rect/DPR reads), CSS upscales it pixelated — nothing to cap.
  // Touch: the click sequence fires as-is; the CSS-only pointerenter peg
  // rattle simply never runs (acceptable degrade).

  var btn = document.getElementById('jj-bundle-reroll');
  if (!btn || !btn.classList.contains('jj-daruma')) return;

  var busy = false;

  // ─── FX scene (lazy-built on first play) ─────────────────────
  var BUF_W = 150, BUF_H = 180;
  var CX = 75, SEAM = 138, TOP = 103;
  var fx = null;

  function cssColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  // Wispy luminous smoke: stacked soft blobs with holes punched out.
  function smokeTexture(seed) {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var rnd = (function (s) {
      return function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    })(seed);
    for (var i = 0; i < 6; i++) {
      var x = 20 + rnd() * 24, y = 20 + rnd() * 24, r = 10 + rnd() * 16;
      var grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.5)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    g.globalCompositeOperation = 'destination-out';
    for (var j = 0; j < 4; j++) {
      var hx = 12 + rnd() * 40, hy = 12 + rnd() * 40, hr = 4 + rnd() * 9;
      var hole = g.createRadialGradient(hx, hy, 0, hx, hy, hr);
      hole.addColorStop(0, 'rgba(0,0,0,0.85)');
      hole.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = hole;
      g.fillRect(0, 0, 64, 64);
    }
    var tex = new THREE.CanvasTexture(c);
    tex.flipY = false; // painted CanvasTexture on r150+: see memory gotcha
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function dotTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 16;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(8, 8, 0, 8, 8, 8);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 16, 16);
    var tex = new THREE.CanvasTexture(c);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Aged bone die face: cream base, grime blotches, uneven carved pips.
  function dieFace(pips, rnd) {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    g.fillStyle = '#ddd4bc';
    g.fillRect(0, 0, 64, 64);
    for (var i = 0; i < 7; i++) { // grime
      g.fillStyle = 'rgba(' + (150 + (rnd() * 40 | 0)) + ',' + (135 + (rnd() * 35 | 0)) + ',105,0.28)';
      g.beginPath();
      g.ellipse(rnd() * 64, rnd() * 64, 4 + rnd() * 12, 3 + rnd() * 9, rnd() * 3, 0, 7);
      g.fill();
    }
    // darkened edges so faces separate without lighting
    var edge = g.createRadialGradient(32, 32, 20, 32, 32, 46);
    edge.addColorStop(0, 'rgba(60,44,24,0)');
    edge.addColorStop(1, 'rgba(60,44,24,0.4)');
    g.fillStyle = edge;
    g.fillRect(0, 0, 64, 64);
    pips.forEach(function (p) {
      var x = p[0] + (rnd() - 0.5) * 5, y = p[1] + (rnd() - 0.5) * 5, r = 5 + rnd() * 2.5;
      var pip = g.createRadialGradient(x, y, 0, x, y, r);
      pip.addColorStop(0, '#2e1e10');
      pip.addColorStop(0.7, '#54381e');
      pip.addColorStop(1, 'rgba(84,56,30,0)');
      g.fillStyle = pip;
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
    });
    // dissolve noise: 4px blocks get a random alpha threshold; ramping the
    // material's alphaTest discards blocks in random order — the die
    // disintegrates instead of fading uniformly. Needs mipmaps OFF or the
    // averaged alpha turns the dissolve back into a uniform fade.
    var id = g.getImageData(0, 0, 64, 64);
    for (var by = 0; by < 64; by += 4) {
      for (var bx = 0; bx < 64; bx += 4) {
        var a = 25 + rnd() * 225 | 0;
        for (var yy = 0; yy < 4; yy++) {
          for (var xx = 0; xx < 4; xx++) {
            id.data[((by + yy) * 64 + bx + xx) * 4 + 3] = a;
          }
        }
      }
    }
    g.putImageData(id, 0, 0);
    var tex = new THREE.CanvasTexture(c);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    return tex;
  }

  var PIP_LAYOUTS = {
    1: [[32, 32]],
    2: [[19, 19], [45, 45]],
    3: [[17, 17], [32, 32], [47, 47]],
    4: [[19, 19], [45, 19], [19, 45], [45, 45]],
    5: [[19, 19], [45, 19], [32, 32], [19, 45], [45, 45]],
    6: [[19, 14], [45, 14], [19, 32], [45, 32], [19, 50], [45, 50]]
  };

  function buildFx() {
    var canvas = document.getElementById('jj-daruma-fx');
    if (!canvas || !window.THREE) return null;

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
    renderer.setSize(BUF_W, BUF_H, false);
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    // pixel-mapped ortho: world x = buffer px, world y = -buffer px (y down)
    var camera = new THREE.OrthographicCamera(0, BUF_W, 0, -BUF_H, -200, 200);

    var gold = new THREE.Color(cssColor('--jj-secondary', '#f5d742'));
    var cream = new THREE.Color('#f0e6c8');

    var rnd = (function (s) {
      return function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
    })(42);

    // — smoke wisps —
    var smokeTexes = [smokeTexture(7), smokeTexture(23), smokeTexture(61)];
    var smoke = [];
    var quad = new THREE.PlaneGeometry(1, 1);
    for (var i = 0; i < 14; i++) {
      var mat = new THREE.MeshBasicMaterial({
        map: smokeTexes[i % 3],
        color: (i % 4 === 3 ? cream : gold),
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      var m = new THREE.Mesh(quad, mat);
      m.visible = false;
      scene.add(m);
      smoke.push({
        mesh: m,
        born: rnd() * 0.45,
        dur: 1.0 + rnd() * 0.4,
        theta0: rnd() * Math.PI * 2,
        omega: (rnd() < 0.5 ? -1 : 1) * (2.5 + rnd() * 2),
        rise: 55 + rnd() * 40,
        amp: 20 + rnd() * 14,
        grow: 30 + rnd() * 25,
        spin: (rnd() - 0.5) * 3
      });
    }

    // — sparks (helix around the top half) —
    var N = 40;
    var pgeo = new THREE.BufferGeometry();
    var pos = new Float32Array(N * 3);
    var col = new Float32Array(N * 3);
    pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pgeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var pmat = new THREE.PointsMaterial({
      size: 3, map: dotTexture(), vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false
    });
    var points = new THREE.Points(pgeo, pmat);
    scene.add(points);
    var sparks = [];
    for (var s = 0; s < N; s++) {
      sparks.push({
        born: rnd() * 0.6,
        dur: 0.9 + rnd() * 0.4,
        theta0: rnd() * Math.PI * 2,
        omega: (rnd() < 0.5 ? -1 : 1) * (3 + rnd() * 3),
        r: 26 + rnd() * 14,
        yEnd: 50 + rnd() * 40,
        tint: rnd() < 0.7 ? gold : cream
      });
    }

    // — dice: proper 6-face bone cubes, gravity + tumble —
    var faceOrder = [1, 6, 2, 5, 3, 4]; // +x,-x,+y,-y,+z,-z — opposites sum 7
    var shade = [0.92, 0.78, 1.0, 0.7, 0.88, 0.8]; // baked directional shading
    var dice = [];
    for (var d = 0; d < 2; d++) {
      var mats = faceOrder.map(function (n, fi) {
        var m2 = new THREE.MeshBasicMaterial({
          map: dieFace(PIP_LAYOUTS[n], rnd), alphaTest: 0.02
        });
        m2.color.setScalar(shade[fi]);
        return m2;
      });
      var cube = new THREE.Mesh(new THREE.BoxGeometry(13, 13, 13), mats);
      cube.visible = false;
      scene.add(cube);
      dice.push({ mesh: cube, mats: mats });
    }

    // — glow pool at the seam —
    var glowMat = new THREE.MeshBasicMaterial({
      map: dotTexture(), color: gold, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var glow = new THREE.Mesh(quad, glowMat);
    glow.position.set(CX, -SEAM, -20);
    scene.add(glow);

    return {
      canvas: canvas, renderer: renderer, scene: scene, camera: camera,
      smoke: smoke, sparks: sparks, sparkPos: pos, sparkCol: col, pgeo: pgeo,
      dice: dice, glow: glow, glowMat: glowMat, rnd: rnd
    };
  }

  var DUR = 1.9; // fx timeline length (s)

  function runFx() {
    if (!fx) fx = buildFx();
    if (!fx) return;
    var canvas = fx.canvas;
    canvas.style.display = '';

    // (re)launch dice
    fx.dice.forEach(function (die, i) {
      var r = fx.rnd;
      die.t0 = 0.08 + i * 0.14;
      die.x = CX + (i ? 8 : -8);
      die.y = SEAM + 2;
      die.vx = (i ? 1 : -1) * (26 + r() * 20);
      die.vy = -(215 + r() * 30);
      die.rx = 4 + r() * 5; die.ry = 4 + r() * 5; die.rz = (r() - 0.5) * 6;
      die.mesh.visible = false;
      die.mesh.position.set(die.x, -die.y, 10);
      die.mesh.rotation.set(r() * 6.28, r() * 6.28, r() * 6.28);
    });

    var start = performance.now();
    function frame(now) {
      var t = (now - start) / 1000;
      if (t >= DUR) {
        canvas.style.display = 'none';
        return;
      }

      // smoke: rise + curl around the top half; dim on the far side of the
      // helix so the wisps read as wrapping, not just overlaying
      fx.smoke.forEach(function (w) {
        var p = (t - w.born) / w.dur;
        if (p <= 0 || p >= 1) { w.mesh.visible = false; return; }
        w.mesh.visible = true;
        var e = 1 - (1 - p) * (1 - p);
        var th = w.theta0 + w.omega * t;
        var wrap = 0.55 + 0.45 * Math.max(0, Math.cos(th));
        w.mesh.position.set(
          CX + w.amp * e * Math.cos(th),
          -(SEAM - w.rise * e),
          5 * Math.sin(th)
        );
        var sc = 10 + w.grow * e;
        w.mesh.scale.set(sc, sc, 1);
        w.mesh.rotation.z = w.spin * t;
        w.mesh.material.opacity = Math.sin(Math.PI * p) * 0.6 * wrap;
      });

      // sparks
      for (var s = 0; s < fx.sparks.length; s++) {
        var sp = fx.sparks[s], k = s * 3;
        var pp = (t - sp.born) / sp.dur;
        if (pp <= 0 || pp >= 1) {
          fx.sparkCol[k] = fx.sparkCol[k + 1] = fx.sparkCol[k + 2] = 0;
          continue;
        }
        var th2 = sp.theta0 + sp.omega * t;
        fx.sparkPos[k] = CX + sp.r * Math.cos(th2);
        fx.sparkPos[k + 1] = -(SEAM - (SEAM - sp.yEnd) * pp);
        fx.sparkPos[k + 2] = 5 * Math.sin(th2);
        var b = Math.sin(Math.PI * pp) * (0.4 + 0.6 * Math.max(0, Math.cos(th2)));
        fx.sparkCol[k] = sp.tint.r * b;
        fx.sparkCol[k + 1] = sp.tint.g * b;
        fx.sparkCol[k + 2] = sp.tint.b * b;
      }
      fx.pgeo.attributes.position.needsUpdate = true;
      fx.pgeo.attributes.color.needsUpdate = true;

      // dice physics: launch, gravity arc, tumble, fade on the way down
      fx.dice.forEach(function (die) {
        var dt = t - die.t0;
        if (dt < 0 || dt > 1.5) { die.mesh.visible = false; return; }
        die.mesh.visible = true;
        var px = die.x + die.vx * dt;
        var py = die.y + die.vy * dt + 190 * dt * dt;
        die.mesh.position.set(px, -py, 10);
        die.mesh.rotation.x += die.rx * 0.016;
        die.mesh.rotation.y += die.ry * 0.016;
        die.mesh.rotation.z += die.rz * 0.016;
        // disintegrate on the way down: alphaTest sweeps past the baked
        // block thresholds and the die crumbles away chunk by chunk
        var diss = dt < 0.9 ? 0.02 : Math.min(1, 0.02 + (dt - 0.9) / 0.5);
        die.mats.forEach(function (m) { m.alphaTest = diss; });
      });

      // glow pool: quantized quarter-step bloom (CRT), then cut
      var gp = Math.min(t / 0.4, 1);
      var q = Math.ceil(gp * 4) / 4;
      var gs = 24 + 40 * q;
      fx.glow.scale.set(gs * 1.1, gs * 0.42, 1);
      fx.glowMat.opacity = t < 1.3 ? 0.34 * q : Math.max(0, 0.34 * (1 - (t - 1.3) / 0.4));

      fx.renderer.render(fx.scene, fx.camera);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ─── Public sequence ─────────────────────────────────────────
  window.JJ_DARUMA = {
    isBusy: function () { return busy; },
    /* Runs the open/loot sequence, invoking done() as the light peaks so
       the record retraction starts behind it. The doll snaps shut, then
       rattles — shaking the dice for the next roll while records shuffle. */
    play: function (done) {
      // No reduced-motion bail (user call): the split + dice loot sequence
      // runs regardless of the OS animation-effects setting, like the
      // other core-look animations.
      if (busy) return;
      busy = true;
      btn.classList.add('is-open');
      runFx();
      setTimeout(function () { if (done) done(); }, 700);
      setTimeout(function () {
        btn.classList.remove('is-open');
        btn.classList.add('is-shaking');
      }, 1100);
      setTimeout(function () {
        btn.classList.remove('is-shaking');
        busy = false;
      }, 1750);
    }
  };
})();
