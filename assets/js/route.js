/* ============================================================
   ROTA 45 — route and arrival estimate
   Prototype services, both free community servers with rate
   limits (fine for testing, not for production traffic):
   - Nominatim (OpenStreetMap) turns "Paris" into coordinates
   - OSRM's public demo server gives the driving route
   ============================================================ */

var GEO_KEY = 'r45-geo:';
var ROUTE_KEY = 'r45-route:';
var ROUTE_TTL = 10 * 60 * 1000;

/* a van is a little slower than OSRM's car profile, and stops for
   45 min after every 4 h 30 of driving */
var VAN_FACTOR = 1.1;
var DRIVE_STINT = 4.5 * 3600;
var BREAK = 45 * 60;

function cacheGet(store, key){
  try { return JSON.parse(store.getItem(key)); } catch (e){ return null; }
}
function cacheSet(store, key, value){
  try { store.setItem(key, JSON.stringify(value)); } catch (e){}
}

/* Nominatim asks for at most one request per second */
var geoQueue = Promise.resolve();
function politely(fn){
  var run = geoQueue.then(fn);
  geoQueue = run.catch(function(){}).then(function(){ return new Promise(function(r){ setTimeout(r, 1100); }); });
  return run;
}

export function geocode(place){
  var q = String(place || '').trim();
  if (!q) return Promise.resolve(null);
  var key = GEO_KEY + q.toLowerCase();
  var hit = cacheGet(localStorage, key);
  if (hit) return Promise.resolve(hit);
  return politely(function(){
    var url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=pt&featureType=settlement&q='
      + encodeURIComponent(q);
    return fetch(url).then(function(r){ return r.ok ? r.json() : []; });
  }).then(function(rows){
    if (!rows || !rows.length) return null;
    var out = {lng:+rows[0].lon, lat:+rows[0].lat, label:rows[0].display_name};
    cacheSet(localStorage, key, out);
    return out;
  }).catch(function(){ return null; });
}

export function route(from, to){
  var key = ROUTE_KEY + [from.lng, from.lat, to.lng, to.lat].map(function(n){ return n.toFixed(4); }).join(',');
  var hit = cacheGet(sessionStorage, key);
  if (hit && Date.now() - hit.at < ROUTE_TTL) return Promise.resolve(hit.route);
  var url = 'https://router.project-osrm.org/route/v1/driving/'
    + from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat + '?overview=full&geometries=geojson';
  return fetch(url)
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){
      if (!d || d.code !== 'Ok' || !d.routes || !d.routes.length) return null;
      var r = d.routes[0];
      var out = {distance:r.distance, duration:r.duration, line:r.geometry.coordinates};
      cacheSet(sessionStorage, key, {at:Date.now(), route:out});
      return out;
    })
    .catch(function(){ return null; });
}

export function estimate(r, now){
  var drive = r.duration * VAN_FACTOR;
  var breaks = drive > DRIVE_STINT ? Math.floor((drive - 1) / DRIVE_STINT) : 0;
  var total = drive + breaks * BREAK;
  return {drive:drive, breaks:breaks, total:total, arrive:new Date((now || Date.now()) + total * 1000)};
}

/* everything the pages need for one trip: destination, route and estimate */
export function tripEta(trip, van){
  return geocode(trip.to).then(function(dest){
    if (!dest) return null;
    return route(van, dest).then(function(r){
      return r ? {dest:dest, route:r, est:estimate(r)} : null;
    });
  });
}

/* ---------- formatting (pt-PT) ---------- */

function hhmm(d){ return d.toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'}); }

export function formatArrival(d){
  var today = new Date(); today.setHours(0, 0, 0, 0);
  var day = new Date(d); day.setHours(0, 0, 0, 0);
  var diff = Math.round((day - today) / 86400000);
  if (diff === 0) return 'hoje às ' + hhmm(d);
  if (diff === 1) return 'amanhã às ' + hhmm(d);
  return d.toLocaleDateString('pt-PT', {weekday:'short', day:'2-digit', month:'2-digit'}) + ' às ' + hhmm(d);
}

export function formatDuration(sec){
  var m = Math.max(1, Math.round(sec / 60));
  if (m < 60) return m + ' min';
  var h = Math.floor(m / 60), r = m % 60;
  return h + ' h' + (r ? ' ' + r + ' min' : '');
}

export function formatKm(metres){
  return Math.round(metres / 1000).toLocaleString('pt-PT') + ' km';
}
