# Toolbox Media Players — Tranche 5: Audio Engine + Metafields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a format-matching product is dropped on the player, actually play its audio: a self-hosted clip through an "old speaker" distortion chain, else a YouTube link (clean) with a crackle bed, else generated static — sourced from two new product metafields.

**Architecture:** Two new product metafields (`custom.audio_url`, `custom.youtube_url`) flow through the grid JSON, the PDP data block, and the media-drag product object. A small UMD util (`japanjunky-audio-util.js`) provides the testable `parseYouTubeId` + `choosePath` logic. The audio engine (`japanjunky-player-audio.js`, `window.JJ_PlayerAudio`) owns a single Web Audio graph: file → distortion chain (highpass + lowpass + waveshaper + gain) → destination; static = looped noise through the same chain; YouTube = hidden IFrame player (clean) + a low Web-Audio crackle bed (we cannot process the YouTube stream itself). The player's accept path calls `JJ_PlayerAudio.play(...)`; despawn calls `.stop()`.

**Tech Stack:** Vanilla ES5-style JS (no build; UMD for the testable util), Web Audio API, YouTube IFrame Player API (lazy-loaded), Vitest (existing) for the util.

**Verified facts:**
- Grid JSON: `snippets/jj-product-json.liquid` assigns metafields (lines ~15-19) then emits a JSON object per variant (lines ~53-76) ending with `"addedAt"`. `window.JJ_PRODUCTS` feeds the grid.
- Grid card: `assets/japanjunky-product-grid.js` `createCard(p)` (line ~402) sets `card.setAttribute('data-format', p.format || '')` at line ~406.
- PDP: `sections/jj-product.liquid` builds `window.JJ_PRODUCT_DATA` (lines ~25-57) with `formatLabel`, `title`, etc.; `available` is the last key (no trailing comma).
- media-drag: `assets/japanjunky-media-drag.js` `getProductAt(target)` returns `{ format, title, srcEl }` for grid card and PDP; the product object reaches `JJ_Player.tryLoadProduct`.
- player: `assets/japanjunky-player.js` `tryLoadProduct` accept branch currently does `flashClass('jj-player--accept'); return 'accepted';` (audio stub). `despawn()` tears the player down. `tryLoadProduct` runs from the drop pointerup — a user gesture (lets us resume AudioContext / start YouTube).
- Scripts load at end of `layout/theme.liquid`, ending `...player.js`, `...media-format.js`, `...media-drag.js`.
- Vitest: `npm test`, `vitest.config.js` (Node env). UMD pattern established in `japanjunky-player-physics.js` / `japanjunky-media-format.js`.
- `html { zoom: 2.5 }` — irrelevant to audio (no DOM geometry here).

---

## File Structure

- **Create:** `assets/japanjunky-audio-util.js` — UMD: `parseYouTubeId(url)`, `choosePath({audioUrl,youtubeUrl})`. Testable; no Web Audio.
- **Create:** `tests/audio-util.test.js` — unit tests.
- **Create:** `assets/japanjunky-player-audio.js` — `window.JJ_PlayerAudio` Web Audio engine (file/static/distortion in Task 3; YouTube + crackle in Task 4).
- **Modify:** `snippets/jj-product-json.liquid` — emit `audioUrl` + `youtubeUrl`.
- **Modify:** `assets/japanjunky-product-grid.js` — stash audio data attrs on the card.
- **Modify:** `sections/jj-product.liquid` — add `audioUrl`/`youtubeUrl` to `JJ_PRODUCT_DATA`.
- **Modify:** `assets/japanjunky-media-drag.js` — carry `audioUrl`/`youtubeUrl` in the product object.
- **Modify:** `assets/japanjunky-player.js` — accept path plays audio; despawn stops it.
- **Modify:** `layout/theme.liquid` — load the two new scripts.

**Admin setup (done by the user, documented in Task 1):** create two product metafield definitions in namespace `custom`: `audio_url` (URL/single-line text — rights-cleared audio ONLY) and `youtube_url` (URL).

---

### Task 1: Metafields + data flow (no audio yet)

**Files:**
- Modify: `snippets/jj-product-json.liquid`
- Modify: `assets/japanjunky-product-grid.js`
- Modify: `sections/jj-product.liquid`
- Modify: `assets/japanjunky-media-drag.js`

- [ ] **Step 1: Emit the metafields in the grid JSON**

In `snippets/jj-product-json.liquid`, find the metafield assignment block (near `m_genre`) and add after it:

```liquid
      {%- assign m_audio = product.metafields.custom.audio_url | default: '' -%}
      {%- assign m_youtube = product.metafields.custom.youtube_url | default: '' -%}
```

Then find the end of the per-variant JSON object:

```liquid
        "addedAt": {{ product.created_at | date: '%s' | json }}
      }
```

and replace it with:

```liquid
        "addedAt": {{ product.created_at | date: '%s' | json }},
        "audioUrl": {{ m_audio | json }},
        "youtubeUrl": {{ m_youtube | json }}
      }
```

- [ ] **Step 2: Stash audio data on the grid card**

In `assets/japanjunky-product-grid.js`, in `createCard`, find:

```javascript
    card.setAttribute('data-format', p.format || '');
```

Add immediately after it:

```javascript
    if (p.audioUrl) card.setAttribute('data-audio-url', p.audioUrl);
    if (p.youtubeUrl) card.setAttribute('data-youtube-url', p.youtubeUrl);
```

- [ ] **Step 3: Add the fields to the PDP data**

In `sections/jj-product.liquid`, find the `formatLabel:` line in the `window.JJ_PRODUCT_DATA` object:

```liquid
    formatLabel: {{ p.metafields.custom.format | default: '' | json }},
```

Add immediately after it:

```liquid
    audioUrl: {{ p.metafields.custom.audio_url | default: '' | json }},
    youtubeUrl: {{ p.metafields.custom.youtube_url | default: '' | json }},
```

- [ ] **Step 4: Carry the fields in the dragged product object**

In `assets/japanjunky-media-drag.js`, in `getProductAt`, replace the grid-card return with:

```javascript
    var card = target.closest('.jj-grid__card');
    if (card) {
      var t = card.querySelector('.jj-grid__card-title');
      return {
        format: normFmt(card.getAttribute('data-format')),
        title: t ? t.textContent : '',
        audioUrl: card.getAttribute('data-audio-url') || '',
        youtubeUrl: card.getAttribute('data-youtube-url') || '',
        srcEl: card
      };
    }
```

and replace the PDP return with:

```javascript
    var info = target.closest('#jj-pdp-info');
    if (info && window.JJ_PRODUCT_DATA) {
      return {
        format: normFmt(window.JJ_PRODUCT_DATA.formatLabel),
        title: window.JJ_PRODUCT_DATA.title || '',
        audioUrl: window.JJ_PRODUCT_DATA.audioUrl || '',
        youtubeUrl: window.JJ_PRODUCT_DATA.youtubeUrl || '',
        srcEl: info
      };
    }
```

- [ ] **Step 5: Manual data-flow check**

In a browser preview console (after creating the two metafields in admin and setting `audio_url` and/or `youtube_url` on at least one product):

```js
window.JJ_PRODUCTS.find(function (p) { return p.audioUrl || p.youtubeUrl; });
// → an object with audioUrl/youtubeUrl populated
document.querySelector('.jj-grid__card[data-audio-url], .jj-grid__card[data-youtube-url]');
// → the matching card element carries the attribute
```

Expected: the fields propagate. (Nothing plays yet — that is Tasks 3–4.)

- [ ] **Step 6: Commit**

```bash
git add snippets/jj-product-json.liquid assets/japanjunky-product-grid.js sections/jj-product.liquid assets/japanjunky-media-drag.js
git commit -m "feat(toolbox): plumb audio_url/youtube_url metafields to drag product (tranche 5)"
```

> **Admin note (record in the PR / hand to the user):** Create two product metafield definitions under namespace `custom`: `audio_url` (type URL or single-line text — use ONLY rights-cleared audio: your own/public-domain/CC/licensed) and `youtube_url` (type URL). Products with neither will play static; products with both prefer the self-hosted file.

---

### Task 2: Audio util (TDD)

**Files:**
- Create: `tests/audio-util.test.js`
- Create: `assets/japanjunky-audio-util.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/audio-util.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import AU from '../assets/japanjunky-audio-util.js';

describe('parseYouTubeId', () => {
  it('parses watch?v= URLs', () => {
    expect(AU.parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('parses watch URLs with extra params', () => {
    expect(AU.parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s')).toBe('dQw4w9WgXcQ');
  });
  it('parses youtu.be short URLs', () => {
    expect(AU.parseYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('parses youtu.be with params', () => {
    expect(AU.parseYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=1')).toBe('dQw4w9WgXcQ');
  });
  it('parses /embed/ URLs', () => {
    expect(AU.parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('returns empty for non-YouTube / empty / null', () => {
    expect(AU.parseYouTubeId('https://example.com/song.mp3')).toBe('');
    expect(AU.parseYouTubeId('')).toBe('');
    expect(AU.parseYouTubeId(null)).toBe('');
    expect(AU.parseYouTubeId(undefined)).toBe('');
  });
});

describe('choosePath', () => {
  it('prefers a self-hosted file', () => {
    expect(AU.choosePath({ audioUrl: 'a.mp3', youtubeUrl: 'https://youtu.be/x' })).toBe('file');
    expect(AU.choosePath({ audioUrl: 'a.mp3' })).toBe('file');
  });
  it('falls back to youtube when only a youtube link exists', () => {
    expect(AU.choosePath({ youtubeUrl: 'https://youtu.be/x' })).toBe('youtube');
  });
  it('falls back to static when neither exists', () => {
    expect(AU.choosePath({})).toBe('static');
    expect(AU.choosePath({ audioUrl: '', youtubeUrl: '' })).toBe('static');
    expect(AU.choosePath(null)).toBe('static');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../assets/japanjunky-audio-util.js`.

- [ ] **Step 3: Implement the util**

Create `assets/japanjunky-audio-util.js`:

```javascript
/**
 * japanjunky-audio-util.js
 * Pure helpers for the player audio engine. UMD: window.JJ_AudioUtil as a
 * classic <script>, module.exports under Vitest. No Web Audio / DOM.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.JJ_AudioUtil = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Extract a YouTube video id from watch?v=, youtu.be/, or /embed/ URLs.
  function parseYouTubeId(url) {
    var s = (url == null ? '' : String(url));
    if (!s) return '';
    var m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    m = s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    m = s.match(/\/embed\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    return '';
  }

  // Decide which playback path to use for a product.
  function choosePath(opts) {
    if (opts && opts.audioUrl) return 'file';
    if (opts && opts.youtubeUrl) return 'youtube';
    return 'static';
  }

  return { parseYouTubeId: parseYouTubeId, choosePath: choosePath };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — audio-util tests + all existing tests green.

- [ ] **Step 5: Commit**

```bash
git add tests/audio-util.test.js assets/japanjunky-audio-util.js
git commit -m "feat(toolbox): audio util (youtube id + path choice) with tests (tranche 5)"
```

---

### Task 3: Audio engine — file + static + distortion

**Files:**
- Create: `assets/japanjunky-player-audio.js`
- Modify: `assets/japanjunky-player.js`
- Modify: `layout/theme.liquid`

- [ ] **Step 1: Create the audio engine (file/static/distortion/stop)**

Create `assets/japanjunky-player-audio.js`:

```javascript
/**
 * japanjunky-player-audio.js
 * Web Audio engine for the toolbox player. Tranche 5 (this file): self-hosted
 * file playback through an "old speaker" distortion chain, generated static
 * fallback, and stop(). The YouTube path is added next.
 *
 * Exposes window.JJ_PlayerAudio = { play(opts), stop() }.
 * opts = { format, audioUrl, youtubeUrl }. Depends on window.JJ_AudioUtil.
 */
(function () {
  'use strict';

  var ctx = null;
  var active = null; // { stop: function } teardown for whatever is playing

  function getCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { ctx = null; }
    }
    // Autoplay policy: resume must follow a user gesture (the drop is one).
    if (ctx && ctx.state === 'suspended' && ctx.resume) {
      try { ctx.resume(); } catch (e) {}
    }
    return ctx;
  }

  // Soft-clip curve for the waveshaper (the "driven small speaker" colour).
  function makeCurve(amount) {
    var n = 1024;
    var curve = new Float32Array(n);
    var k = amount || 50;
    for (var i = 0; i < n; i++) {
      var x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  // Bandpass (telephone-ish) + soft clip + trim. Returns { input, output }.
  function buildChain(c) {
    var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 420;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    var shaper = c.createWaveShaper(); shaper.curve = makeCurve(50); shaper.oversample = '2x';
    var g = c.createGain(); g.gain.value = 0.9;
    hp.connect(lp); lp.connect(shaper); shaper.connect(g);
    return { input: hp, output: g };
  }

  function noiseBuffer(c, seconds) {
    var len = Math.floor(c.sampleRate * seconds);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function playStatic(c) {
    var chain = buildChain(c);
    var trim = c.createGain(); trim.gain.value = 0.18; // static is quieter
    chain.output.connect(trim); trim.connect(c.destination);
    var src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 2);
    src.loop = true;
    src.connect(chain.input);
    src.start();
    active = {
      stop: function () {
        try { src.stop(); } catch (e) {}
        try { trim.disconnect(); } catch (e) {}
        try { chain.output.disconnect(); } catch (e) {}
      }
    };
  }

  function playFile(c, url) {
    var chain = buildChain(c);
    chain.output.connect(c.destination);
    var src = null;
    var stopped = false;
    active = {
      stop: function () {
        stopped = true;
        try { if (src) src.stop(); } catch (e) {}
        try { chain.output.disconnect(); } catch (e) {}
      }
    };
    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.arrayBuffer(); })
      .then(function (b) { return c.decodeAudioData(b); })
      .then(function (buf) {
        if (stopped) return;
        src = c.createBufferSource();
        src.buffer = buf;
        src.connect(chain.input);
        src.start();
      })
      .catch(function () {
        if (stopped) return;
        try { chain.output.disconnect(); } catch (e) {}
        playStatic(c); // broken/CORS-blocked link → static
      });
  }

  function stop() {
    if (active) {
      try { active.stop(); } catch (e) {}
      active = null;
    }
  }

  function play(opts) {
    var c = getCtx();
    if (!c) return; // no Web Audio support — silently no-op
    stop();
    var Util = window.JJ_AudioUtil;
    var path = Util ? Util.choosePath(opts) : 'static';
    if (path === 'file') {
      playFile(c, opts.audioUrl);
    } else {
      // 'youtube' is added in the next task; until then it falls to static.
      playStatic(c);
    }
  }

  window.JJ_PlayerAudio = { play: play, stop: stop };
})();
```

- [ ] **Step 2: Wire the player to the audio engine**

In `assets/japanjunky-player.js`, in `tryLoadProduct`, replace the accept branch:

```javascript
    flashClass('jj-player--accept');
    return 'accepted';
```

with:

```javascript
    flashClass('jj-player--accept');
    if (window.JJ_PlayerAudio) {
      window.JJ_PlayerAudio.play({
        format: fmt,
        audioUrl: product.audioUrl,
        youtubeUrl: product.youtubeUrl
      });
    }
    return 'accepted';
```

And in `despawn`, after `stopLoop();`, add:

```javascript
    if (window.JJ_PlayerAudio) window.JJ_PlayerAudio.stop();
```

- [ ] **Step 3: Load the scripts**

In `layout/theme.liquid`, find:

```liquid
  <script src="{{ 'japanjunky-media-drag.js' | asset_url }}" defer></script>
```

Add immediately after it:

```liquid
  <script src="{{ 'japanjunky-audio-util.js' | asset_url }}" defer></script>
  <script src="{{ 'japanjunky-player-audio.js' | asset_url }}" defer></script>
```

- [ ] **Step 4: Manual verification**

In a browser preview (set `custom.audio_url` on a record product to a CORS-accessible clip, e.g. a Shopify Files URL):
1. Spawn a record player; drag that record product onto it → distorted (band-limited, soft-clipped) audio plays.
2. Drag a record product that has NO audio_url and NO youtube_url → static plays.
3. Set `audio_url` to a deliberately broken URL → static plays (fetch/decoded failure falls through).
4. Despawn the player (or spawn a different tool) → audio stops.
5. Dropping a second product replaces the audio (no overlap).

- [ ] **Step 5: Commit**

```bash
git add assets/japanjunky-player-audio.js assets/japanjunky-player.js layout/theme.liquid
git commit -m "feat(toolbox): audio engine — file playback + distortion + static (tranche 5)"
```

---

### Task 4: YouTube path + crackle bed

**Files:**
- Modify: `assets/japanjunky-player-audio.js`

- [ ] **Step 1: Add YouTube playback + crackle to the engine**

In `assets/japanjunky-player-audio.js`, add these helpers immediately before the `function stop()` declaration:

```javascript
  // --- YouTube IFrame API (lazy) ---
  var ytReady = false;
  var ytQueue = [];

  function ensureYouTube(cb) {
    if (ytReady && window.YT && window.YT.Player) { cb(); return; }
    ytQueue.push(cb);
    if (window.JJ_YT_LOADING) return;
    window.JJ_YT_LOADING = true;

    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof prev === 'function') { try { prev(); } catch (e) {} }
      ytReady = true;
      var q = ytQueue; ytQueue = [];
      for (var i = 0; i < q.length; i++) { try { q[i](); } catch (e) {} }
    };

    // Hidden host element for the iframe.
    if (!document.getElementById('jj-yt-host')) {
      var host = document.createElement('div');
      host.id = 'jj-yt-host';
      host.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;opacity:0;pointer-events:none;';
      document.body.appendChild(host);
    }

    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }

  // A low, looping "old speaker" crackle/hum bed for the YouTube path, where we
  // cannot process the clean stream directly.
  function startCrackle(c) {
    var chain = buildChain(c);
    var trim = c.createGain(); trim.gain.value = 0.06; // subtle under the song
    chain.output.connect(trim); trim.connect(c.destination);
    var src = c.createBufferSource();
    src.buffer = noiseBuffer(c, 3);
    src.loop = true;
    src.connect(chain.input);
    src.start();
    return function () {
      try { src.stop(); } catch (e) {}
      try { trim.disconnect(); } catch (e) {}
      try { chain.output.disconnect(); } catch (e) {}
    };
  }

  function playYouTube(c, url) {
    var Util = window.JJ_AudioUtil;
    var id = Util ? Util.parseYouTubeId(url) : '';
    if (!id) { playStatic(c); return; } // unparseable link → static

    var stopCrackle = startCrackle(c);
    var player = null;
    var stopped = false;
    active = {
      stop: function () {
        stopped = true;
        try { stopCrackle(); } catch (e) {}
        try { if (player && player.stopVideo) player.stopVideo(); } catch (e) {}
        try { if (player && player.destroy) player.destroy(); } catch (e) {}
      }
    };

    ensureYouTube(function () {
      if (stopped) return;
      player = new window.YT.Player('jj-yt-host', {
        videoId: id,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1 },
        events: {
          onReady: function (e) {
            if (stopped) { try { e.target.stopVideo(); } catch (err) {} return; }
            try { e.target.playVideo(); } catch (err) {}
          }
        }
      });
    });
  }
```

- [ ] **Step 2: Route the youtube path in `play`**

In `assets/japanjunky-player-audio.js`, in the `play` function, replace:

```javascript
    if (path === 'file') {
      playFile(c, opts.audioUrl);
    } else {
      // 'youtube' is added in the next task; until then it falls to static.
      playStatic(c);
    }
```

with:

```javascript
    if (path === 'file') {
      playFile(c, opts.audioUrl);
    } else if (path === 'youtube') {
      playYouTube(c, opts.youtubeUrl);
    } else {
      playStatic(c);
    }
```

- [ ] **Step 3: Manual verification**

In a browser preview (set `custom.youtube_url` on a product that has NO `audio_url`):
1. Spawn the matching player; drop the product → the YouTube track plays (clean) with a subtle crackle bed under it.
2. Drop a different product / despawn → the YouTube video and the crackle both stop (no audio keeps playing, no leftover iframe sound).
3. A product with an unparseable youtube_url → static.
4. Re-drop after a YouTube play → previous YouTube stops, new audio starts.

> **Known limitation:** browser autoplay policies may require the user to have interacted with the page; the drop gesture normally satisfies this, but some browsers still gate iframe video autoplay. If a track doesn't start, that's the browser's policy, not a bug.

- [ ] **Step 4: Commit**

```bash
git add assets/japanjunky-player-audio.js
git commit -m "feat(toolbox): youtube playback + crackle bed (tranche 5)"
```

---

### Task 5: Full regression

**Files:** none (verification only)

- [ ] **Step 1: Run the unit suite**

Run: `npm test`
Expected: audio-util + media-format + physics + sanity all pass.

- [ ] **Step 2: Browser checklist**

With the two metafields created and a few products configured (one with `audio_url`, one with only `youtube_url`, one with neither), confirm:
1. Drop a format-matching product with `audio_url` → distorted file audio.
2. Drop a matching product with only `youtube_url` → clean YouTube + crackle bed.
3. Drop a matching product with neither → static.
4. Broken `audio_url` (bad URL / CORS) → static.
5. Mismatched format → reject (no audio), as in Tranche 4.
6. Dropping a new product stops the previous audio and starts the new one (no overlap).
7. Despawning the player (or spawning a different tool) stops audio.
8. Tranches 1–4 still work (fan, spawn/throw/persist, drag/ghost/gate).

- [ ] **Step 3: Record the result**

If all pass, Tranche 5 is complete. If any fail, fix inline (the distortion constants in `buildChain`, or the YouTube id regex, are the usual culprits) and re-verify.

---

## Self-Review

**Spec coverage (Tranche 5 scope):**
- Component #6 audio engine, hybrid + format-gated: file→distortion (Task 3), youtube→clean+crackle (Task 4), static fallback (Task 3); format gate already enforced by `tryLoadProduct` before audio is called (Tranche 4). ✓
- "Distortion chain (lowpass + waveshaper + …)": highpass+lowpass+waveshaper+gain (Task 3). Bitcrush/AudioWorklet from the spec is intentionally omitted — the filter+shaper chain delivers the old-speaker character without a worklet file; can be added later if desired. Noted deviation. ✓ (reduced)
- "Cannot process the YouTube stream → crackle overlay sells old-speaker": crackle bed (Task 4). ✓
- Component #7 metafields `custom.audio_url` + `custom.youtube_url` through grid JSON + PDP + drag object: Task 1. ✓
- Error handling: fetch/decode failure → static; unsupported AudioContext → no-op; unparseable YouTube id → static; resume on gesture. ✓
- Path-selection + YouTube-id parsing unit-tested. ✓
- Legal posture (file only for rights-cleared) documented in Task 1 admin note. ✓

**Placeholder scan:** No TBD/TODO; all code/commands complete. Bitcrush omission is a documented design choice, not a stub. ✓

**Type/name consistency:**
- `window.JJ_AudioUtil.parseYouTubeId` / `.choosePath` defined in Task 2, consumed in Task 3/4 (`play`, `playYouTube`). ✓
- `window.JJ_PlayerAudio.play(opts)` / `.stop()` defined in Task 3, consumed by player (Task 3) and extended in Task 4. ✓
- `opts` shape `{format, audioUrl, youtubeUrl}` produced by `tryLoadProduct` (Task 3) from the product object whose `audioUrl`/`youtubeUrl` come from Task 1. ✓
- `buildChain` returns `{input, output}` used identically by `playFile`, `playStatic`, `startCrackle`. ✓
- `active = { stop }` teardown contract consistent across file/static/youtube paths; `stop()` calls `active.stop()`. ✓

**Decisions to flag to the user:** bitcrush omitted (filters+waveshaper used instead); YouTube autoplay is subject to browser policy; self-hosted `audio_url` must be CORS-accessible (Shopify Files are) or it falls back to static; use rights-cleared audio only for `audio_url`.
```
