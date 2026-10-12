/* ============================================================
   ROTA 45 — live location settings
   Prototype: settings live in this browser's localStorage, so they
   only change what this device shows. In production they belong on
   the server, next to the GPS history.
   ============================================================ */

var KEY = 'r45-live-v1';
var DEFAULTS = {enabled:true, delayMin:0};

/* delays the manager can pick, in minutes */
export var DELAYS = [0, 5, 15, 30, 60];

/* position history, oldest first. Until a GPS feeds it, it holds the test position. */
var HISTORY = [{at:0, lng:-9.133111, lat:38.760731, heading:0.6}];

export function getLive(){
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch (e){}
  return Object.assign({}, DEFAULTS, saved);
}

export function setLive(patch){
  var next = Object.assign(getLive(), patch);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e){}
  window.dispatchEvent(new CustomEvent('r45-live'));
  return next;
}

export function subscribeLive(fn){
  window.addEventListener('storage', function(e){ if (e.key === KEY) fn(); });
  window.addEventListener('r45-live', fn);
}

/* where the van really is: only for arrival estimates, never drawn on a map */
export function currentPosition(){
  return HISTORY[HISTORY.length - 1];
}

/* what visitors may see: nothing when the location is off, otherwise the
   last position at least `delayMin` minutes old */
export function publicPosition(){
  var live = getLive();
  if (!live.enabled) return null;
  var cutoff = Date.now() - live.delayMin * 60000, fix = null;
  for (var i = 0; i < HISTORY.length; i++) if (HISTORY[i].at <= cutoff) fix = HISTORY[i];
  return fix ? Object.assign({delayMin:live.delayMin}, fix) : null;
}
