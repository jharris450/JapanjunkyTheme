/* Daruma reroll trigger — the doll that replaced the [Reroll] button.
   Hover states are pure CSS (pegs pop out of the face holes); this file
   owns the click sequence: split the doll open, loot-light + bone dice
   rise and vanish, THEN hand control back to bundle-stage's reroll.
   bundle-stage.js calls window.JJ_DARUMA.play(fn) from its click handler. */
(function () {
  'use strict';
  var btn = document.getElementById('jj-bundle-reroll');
  if (!btn || !btn.classList.contains('jj-daruma')) return;

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var busy = false;

  window.JJ_DARUMA = {
    isBusy: function () { return busy; },
    /* Runs the open/dice sequence, invoking done() as the dice fade so the
       record retraction starts right behind them. The doll snaps shut a
       beat later, then rattles — shaking the dice for the next roll while
       the records shuffle. */
    play: function (done) {
      if (reduceMotion) { if (done) done(); return; }
      if (busy) return;
      busy = true;
      btn.classList.add('is-open');
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
