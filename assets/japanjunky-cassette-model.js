/**
 * japanjunky-cassette-model.js
 * Builds the Sony WM-F45 cassette Walkman as a THREE.Group.
 *
 * window.JJ_CassetteModel.build(THREE, assetUrl) -> {
 *   group, setOpen(t), setPlaying(b), update(dt)
 * }
 * assetUrl(name) resolves e.g. 'cassette-front.png' to a loadable URL.
 * Unlit MeshBasicMaterial + NearestFilter (flat retro; no lighting needed).
 * Depends on window.JJ_CassetteMath for the lid angle.
 */
(function () {
  'use strict';

  // model units: real cm / 10
  var W = 1.06, H = 1.40, D = 0.43;
  var YELLOW = 0xf2c200, BLACK = 0x141414, CYAN = 0x35e0e0;

  function build(THREE, assetUrl) {
    var Math2 = window.JJ_CassetteMath;
    var loader = new THREE.TextureLoader();

    function tex(name) {
      var t = loader.load(assetUrl(name));
      t.generateMipmaps = false;
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    }
    function photoMat(name, transparent) {
      return new THREE.MeshBasicMaterial({
        map: tex(name),
        transparent: !!transparent,
        alphaTest: transparent ? 0.5 : 0,
        side: THREE.DoubleSide
      });
    }
    function colorMat(c) { return new THREE.MeshBasicMaterial({ color: c }); }

    var group = new THREE.Group();

    // --- Body: deck on +z (revealed when lid opens), photos on other faces ---
    var bodyMats = [
      photoMat('cassette-right.png'),   // +x
      photoMat('cassette-left.png'),    // -x
      photoMat('cassette-top.png'),     // +y
      colorMat(YELLOW),                 // -y (bottom, unphotographed)
      photoMat('cassette-deck.png'),    // +z (interior deck)
      photoMat('cassette-back.png')     // -z
    ];
    var body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), bodyMats);
    group.add(body);

    // --- Cassette in the well (visible through the window) ---
    var cassette = new THREE.Group();
    var shell = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, H * 0.42, 0.04), colorMat(0x2a2a2a));
    cassette.add(shell);
    var reels = [];
    var reelGeo = new THREE.CylinderGeometry(W * 0.11, W * 0.11, 0.02, 16);
    for (var i = 0; i < 2; i++) {
      var reel = new THREE.Mesh(reelGeo, colorMat(0x111111));
      reel.rotation.x = Math.PI / 2;          // face +z
      reel.position.set((i === 0 ? -1 : 1) * W * 0.17, H * 0.06, 0.03);
      cassette.add(reel);
      reels.push(reel);
    }
    cassette.position.set(0, H * 0.12, D / 2 + 0.03); // upper area, just inside front
    group.add(cassette);

    // --- Lid: hinged at the RIGHT vertical edge, front photo with alpha window ---
    var hinge = new THREE.Group();
    hinge.position.set(W / 2, 0, D / 2);        // right edge, front plane
    var lidMats = [
      colorMat(YELLOW), colorMat(YELLOW), colorMat(YELLOW), colorMat(YELLOW),
      photoMat('cassette-front.png', true),     // +z outer (alpha window)
      photoMat('cassette-lid-inner.png')        // -z inner
    ];
    var lid = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.05), lidMats);
    lid.position.set(-W / 2, 0, 0.08);          // center sits left of the hinge
    hinge.add(lid);
    // translucent cyan pane in the window opening (child of the lid)
    var pane = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.66, H * 0.32),
      new THREE.MeshBasicMaterial({ color: 0x33ff33, transparent: true, opacity: 0.22 })
    );
    pane.position.set(0, H * 0.12, 0.03);
    lid.add(pane);
    group.add(hinge);

    var playing = false;

    function setOpen(t) {
      hinge.rotation.y = Math2 ? Math2.lidAngle(t) : 0; // hinge opens toward -? door swing
    }
    function setPlaying(b) { playing = !!b; }
    function update(dt) {
      if (playing) {
        for (var i = 0; i < reels.length; i++) reels[i].rotation.y += dt * 3.0;
      }
    }

    function dispose() {
      var geos = [];
      group.traverse(function (o) {
        if (!o.isMesh) return;
        if (o.geometry && geos.indexOf(o.geometry) === -1) geos.push(o.geometry);
        var mats = Array.isArray(o.material) ? o.material : [o.material];
        for (var i = 0; i < mats.length; i++) {
          var m = mats[i]; if (!m) continue;
          if (m.map) { try { m.map.dispose(); } catch (e) {} }
          try { m.dispose(); } catch (e) {}
        }
      });
      for (var g = 0; g < geos.length; g++) { try { geos[g].dispose(); } catch (e) {} }
    }

    setOpen(0);
    return { group: group, setOpen: setOpen, setPlaying: setPlaying, update: update, dispose: dispose };
  }

  window.JJ_CassetteModel = { build: build };
})();
