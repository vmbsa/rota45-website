/* ============================================================
   ROTA 45 — live position map
   MapLibre (OpenFreeMap dark tiles) plus a three.js Sprinter built
   in code. Needs the maplibre-gl script loaded as a global and
   "three" mapped in the page's import map.
   ============================================================ */
import * as THREE from 'three';

/* zoomed out, the van keeps about this length on screen (smaller on narrow phone maps);
   zoomed in it is life size */
var VAN_PX = 64, VAN_PX_NARROW = 36, NARROW = 520;
var DEFAULT_VIEW = { zoom: 12.2, pitch: 50, bearing: 0 }; /* north up */
var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

function hasWebGL(){
  try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch (e){ return false; }
}

export function formatCoord(van){
  return Math.abs(van.lat).toFixed(5) + '° ' + (van.lat >= 0 ? 'N' : 'S') + ' <span>/</span> ' +
         Math.abs(van.lng).toFixed(5) + '° ' + (van.lng >= 0 ? 'E' : 'W');
}

/* opts: el, card, van {lng, lat, heading}, view?, coordEl?, zoomIn?, zoomOut?, home? */
export function mountLiveMap(opts){
  var view = Object.assign({}, DEFAULT_VIEW, opts.view);
  if (opts.coordEl) opts.coordEl.innerHTML = formatCoord(opts.van);
  if (!window.maplibregl || !hasWebGL()) return Promise.resolve(null);
  /* the livery is drawn with the site fonts, so wait for them */
  return Promise.all([
    document.fonts.load("italic 900 100px 'Exo 2'"),
    document.fonts.load("700 30px 'Roboto Mono'")
  ]).catch(function(){}).then(function(){ return start(opts, opts.van, view); });
}

function start(opts, VAN, VIEW){
  var el = opts.el, card = opts.card;
  var pt = document.documentElement.lang !== 'en';
  var map = new maplibregl.Map({
    container: el,
    style: 'https://tiles.openfreemap.org/styles/dark',
    center: [VAN.lng, VAN.lat], zoom: VIEW.zoom, pitch: VIEW.pitch, bearing: VIEW.bearing,
    minZoom: 3, maxZoom: 20, maxPitch: 70,
    /* Ctrl + scroll to zoom and two fingers to pan, so the page still scrolls normally */
    cooperativeGestures: true,
    locale: pt ? {
      'CooperativeGesturesHandler.WindowsHelpText': 'Use Ctrl + scroll para aproximar o mapa',
      'CooperativeGesturesHandler.MacHelpText': 'Use ⌘ + scroll para aproximar o mapa',
      'CooperativeGesturesHandler.MobileHelpText': 'Use dois dedos para mover o mapa'
    } : {},
    attributionControl: false, antialias: true, fadeDuration: 0
  });
  map.addControl(new maplibregl.AttributionControl({compact: true}), 'bottom-right');
  /* the dark style references a wood pattern it doesn't ship; a blank pixel keeps the console quiet */
  map.on('styleimagemissing', function(e){
    if (!map.hasImage(e.id)) map.addImage(e.id, {width:1, height:1, data:new Uint8Array(4)});
  });

  var visible = true;
  map.on('style.load', function(){
    restyle(map);
    map.addLayer(vanLayer(map, VAN, function(){ return visible; }, function(){
      return el.clientWidth < NARROW ? VAN_PX_NARROW : VAN_PX;
    }));
  });
  map.on('load', function(){
    var a = el.querySelector('.maplibregl-ctrl-attrib');
    if (a){ a.classList.remove('maplibregl-compact-show'); a.removeAttribute('open'); }
  });
  map.once('idle', function(){ card.classList.add('ready'); });

  /* the pulsing ring only animates while the card is on screen */
  if ('IntersectionObserver' in window){
    new IntersectionObserver(function(entries){
      visible = entries[0].isIntersecting;
      if (visible) map.triggerRepaint();
    }).observe(card);
  }

  if (opts.zoomIn) opts.zoomIn.addEventListener('click', function(){ map.zoomIn(); });
  if (opts.zoomOut) opts.zoomOut.addEventListener('click', function(){ map.zoomOut(); });
  if (opts.home) opts.home.addEventListener('click', function(){
    if (map._r45Overview){ map._r45Overview(); return; } /* a route is drawn: show all of it */
    map.flyTo({
      center:[VAN.lng, VAN.lat], zoom:VIEW.zoom, pitch:VIEW.pitch, bearing:VIEW.bearing,
      duration: still ? 0 : 1200
    });
  });
  return map;
}

/* route from the van to the destination: red line under the van, a chequered
   flag at the end, and the camera framing the whole trip */
export function drawRoute(map, line, dest){
  function go(){
    var data = {type:'Feature', properties:{}, geometry:{type:'LineString', coordinates:line}};
    if (map.getSource('r45-route')){
      map.getSource('r45-route').setData(data);
    } else {
      map.addSource('r45-route', {type:'geojson', data:data});
      var before = map.getLayer('van-3d') ? 'van-3d' : undefined;
      var layout = {'line-join':'round', 'line-cap':'round'};
      map.addLayer({id:'r45-route-glow', type:'line', source:'r45-route', layout:layout,
        paint:{'line-color':'#ff0019', 'line-width':12, 'line-opacity':0.25, 'line-blur':6}}, before);
      map.addLayer({id:'r45-route', type:'line', source:'r45-route', layout:layout,
        paint:{'line-color':'#ff0019', 'line-width':3.5}}, before);
    }

    if (!map._r45Flag){
      var el = document.createElement('div');
      el.className = 'lm-flag';
      map._r45Flag = new maplibregl.Marker({element:el, anchor:'bottom-left'});
    }
    map._r45Flag.setLngLat([dest.lng, dest.lat]).addTo(map);

    var bounds = new maplibregl.LngLatBounds();
    line.forEach(function(c){ bounds.extend(c); });
    map._r45Overview = function(){
      var cam = map.cameraForBounds(bounds, {padding:{top:90, bottom:110, left:120, right:100}, bearing:0});
      if (!cam) return;
      map.easeTo({center:cam.center, zoom:cam.zoom - 0.25, pitch:35, bearing:0, duration: still ? 0 : 1400});
    };
    map._r45Overview();
  }
  if (map.getLayer('van-3d')) go();
  else map.once('idle', go);
}

/* darker, cleaner basemap: only place names, visible streets, red motorways, low 3D blocks */
var KEEP_LABELS = ['place_other', 'place_suburb', 'place_village', 'place_town', 'place_city', 'place_city_large'];
function restyle(map){
  map.getStyle().layers.forEach(function(l){
    if (l.type === 'symbol' && KEEP_LABELS.indexOf(l.id) === -1) map.setLayoutProperty(l.id, 'visibility', 'none');
  });
  var paint = {
    'background':              ['background-color', '#0b0b0c'],
    'landuse_residential':     ['fill-color', '#111114'],
    'highway_minor':           ['line-color', '#26262c'],
    'highway_major_casing':    ['line-color', 'rgba(110,110,120,.5)'],
    'highway_major_inner':     ['line-color', '#2e2e35'],
    'highway_major_subtle':    ['line-color', '#2e2e35'],
    'highway_motorway_casing': ['line-color', 'rgba(255,0,25,.45)'],
    'highway_motorway_inner':  ['line-color', '#3a0b11'],
    'highway_motorway_subtle': ['line-color', '#3a0b11']
  };
  Object.keys(paint).forEach(function(id){
    if (map.getLayer(id)) map.setPaintProperty(id, paint[id][0], paint[id][1]);
  });
  if (map.getLayer('building')){
    map.setLayoutProperty('building', 'visibility', 'none');
    map.addLayer({
      id:'building-3d', type:'fill-extrusion', source:'openmaptiles', 'source-layer':'building', minzoom:14,
      paint:{
        'fill-extrusion-color':'#1e1e24',
        'fill-extrusion-height':['*', 0.35, ['coalesce', ['get', 'render_height'], 10]],
        'fill-extrusion-base':0,
        'fill-extrusion-opacity':0.92
      }
    });
  }
}

function vanLayer(map, VAN, isVisible, vanPx){
  var origin = maplibregl.MercatorCoordinate.fromLngLat([VAN.lng, VAN.lat], 0);
  var metre = origin.meterInMercatorCoordinateUnits();
  var cosLat = Math.cos(VAN.lat * Math.PI / 180);
  var yUp = new THREE.Matrix4().makeRotationX(Math.PI / 2);
  var camera, scene, renderer, ring, vw = 0, vh = 0, t0 = performance.now();

  /* model space is y-up metres; the map is z-up mercator with y pointing south */
  function modelMatrix(){
    var metresPerPx = 40075016.686 * cosLat / (512 * Math.pow(2, map.getZoom()));
    var s = metre * Math.max(1, vanPx() * metresPerPx / 5.93);
    return new THREE.Matrix4()
      .makeTranslation(origin.x, origin.y, origin.z)
      .scale(new THREE.Vector3(s, -s, s))
      .multiply(yUp);
  }

  return {
    id:'van-3d', type:'custom', renderingMode:'3d',
    onAdd: function(m, gl){
      camera = new THREE.Camera();
      scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x303038, 2.2));
      var key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(4, 10, 6);
      scene.add(key);
      var rim = new THREE.DirectionalLight(0xff2a3a, 1.2);
      rim.position.set(-6, 4, -5);
      scene.add(rim);

      var van = buildVan();
      van.rotation.y = VAN.heading;
      scene.add(van);

      ring = new THREE.Mesh(
        new THREE.RingGeometry(3.3, 3.6, 64),
        new THREE.MeshBasicMaterial({color:0xff0019, transparent:true, depthWrite:false})
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      scene.add(ring);

      renderer = new THREE.WebGLRenderer({canvas: m.getCanvas(), context: gl, antialias: true});
      renderer.autoClear = false;
    },
    render: function(gl, matrix){
      var c = map.getCanvas();
      if (c.width !== vw || c.height !== vh){ vw = c.width; vh = c.height; renderer.setViewport(0, 0, vw, vh); }
      camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(modelMatrix());
      var t = still ? 0.35 : ((performance.now() - t0) / 1800) % 1;
      ring.scale.setScalar(1 + t * 1.6);
      ring.material.opacity = 0.8 * (1 - t);
      renderer.resetState();
      renderer.render(scene, camera);
      if (!still && isVisible()) map.triggerRepaint();
    }
  };
}

/* ---------- the van: Mercedes-Benz Sprinter, high roof, long wheelbase ---------- */
function buildVan(){
  var g = new THREE.Group();
  var R = 2.95, H = 2.62, B = 0.42, BW = 1.9;   /* half length, roof, sill, body width */
  var FA = 2.05, RA = -2.25, WR = 0.36, ARCH = 0.44;
  var SIDE = BW / 2 + 0.06;                      /* outer face of the sides (with bevel) */

  function mat(o){ return new THREE.MeshStandardMaterial(o); }
  var silver = mat({color:0xc9ccd2, metalness:.35, roughness:.4});
  var dark   = mat({color:0x1a1b1f, roughness:.75});
  var glass  = mat({color:0x0b0d12, metalness:.5, roughness:.15, side:THREE.DoubleSide});
  var rubber = mat({color:0x0d0d0f, roughness:.95});
  var hub    = mat({color:0xa3a8b0, metalness:.7, roughness:.3});
  var well   = mat({color:0x050506, roughness:1, side:THREE.DoubleSide});
  var lamp   = mat({color:0xffffff, emissive:0xfff3dc, emissiveIntensity:1.6});
  var tail   = mat({color:0xff0019, emissive:0xff0019, emissiveIntensity:1.2});

  function add(geo, m, x, y, z){ var o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); g.add(o); return o; }
  function box(w, h, d, m, x, y, z){ return add(new THREE.BoxGeometry(w, h, d), m, x, y, z); }

  /* side profile (x forward, y up) with the wheel arches cut into the sill */
  var a0 = Math.asin((B - WR) / ARCH), half = Math.cos(a0) * ARCH;
  var p = new THREE.Shape();
  p.moveTo(-R, B);
  p.lineTo(-R, H - 0.1);
  p.quadraticCurveTo(-R, H, -R + 0.1, H);
  p.lineTo(1.05, H);
  p.quadraticCurveTo(1.4, H, 1.55, H - 0.32);
  p.lineTo(2.2, 1.42);
  p.quadraticCurveTo(2.35, 1.3, 2.75, 1.2);
  p.quadraticCurveTo(R, 1.12, R, 0.92);
  p.lineTo(R, B);
  p.lineTo(FA + half, B);
  p.absarc(FA, WR, ARCH, a0, Math.PI - a0, false);
  p.lineTo(RA + half, B);
  p.absarc(RA, WR, ARCH, a0, Math.PI - a0, false);
  p.lineTo(-R, B);
  var body = new THREE.ExtrudeGeometry(p, {
    depth:BW, bevelEnabled:true, bevelThickness:.06, bevelSize:.06, bevelSegments:3, curveSegments:16
  });
  body.translate(0, 0, -BW / 2);
  add(body, silver);

  /* windshield, lifted just off the sloped panel */
  var w1 = new THREE.Vector2(1.55, H - 0.32), w2 = new THREE.Vector2(2.2, 1.42);
  var d = w2.clone().sub(w1);
  var n = new THREE.Vector2(-d.y, d.x).normalize().multiplyScalar(0.075);
  var top = w1.clone().addScaledVector(d, 0.04).add(n), bot = w2.clone().addScaledVector(d, -0.06).add(n);
  var hw = BW / 2 - 0.05;
  var ws = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(top.x, top.y, -hw), new THREE.Vector3(bot.x, bot.y, -hw),
    new THREE.Vector3(bot.x, bot.y, hw), new THREE.Vector3(top.x, top.y, hw)
  ]);
  ws.setIndex([0, 1, 2, 0, 2, 3]);
  ws.computeVertexNormals();
  add(ws, glass);

  /* cab door windows */
  var sw = new THREE.Shape();
  sw.moveTo(1.25, 1.52); sw.lineTo(2.06, 1.52); sw.lineTo(1.54, 2.24); sw.lineTo(1.25, 2.24); sw.closePath();
  var swGeo = new THREE.ShapeGeometry(sw);
  add(swGeo, glass, 0, 0, SIDE + 0.005);
  add(swGeo, glass, 0, 0, -SIDE - 0.005);

  /* dark sill trim between the arches, bumpers, grille */
  var TW = SIDE * 2 + 0.02, open = ARCH - 0.06;
  [[-R - 0.06, RA - open], [RA + open, FA - open], [FA + open, R + 0.06]].forEach(function(s){
    box(s[1] - s[0], 0.32, TW, dark, (s[0] + s[1]) / 2, B + 0.1, 0);
  });
  box(0.16, 0.45, TW, dark, R + 0.02, B + 0.17, 0);
  box(0.16, 0.3, TW, dark, -R - 0.02, B + 0.1, 0);
  box(0.04, 0.26, 1.2, dark, R + 0.07, 0.78, 0);
  var star = add(new THREE.TorusGeometry(0.09, 0.015, 8, 24), hub, R + 0.1, 0.78, 0);
  star.rotation.y = Math.PI / 2;

  /* lights, mirrors, rear door split */
  [-1, 1].forEach(function(side){
    box(0.1, 0.12, 0.36, lamp, R - 0.02, 1.0, side * 0.7);
    box(0.06, 0.95, 0.12, tail, -R - 0.06, 1.35, side * (SIDE - 0.08));
    box(0.1, 0.3, 0.2, dark, 1.6, 1.78, side * (SIDE + 0.12));
  });
  box(0.01, H - B - 0.4, 0.02, dark, -R - 0.072, (H + B + 0.3) / 2, 0);

  /* wheels and wheel wells */
  var tyre = new THREE.CylinderGeometry(WR, WR, 0.26, 28); tyre.rotateX(Math.PI / 2);
  var cap = new THREE.CylinderGeometry(0.2, 0.2, 0.27, 20); cap.rotateX(Math.PI / 2);
  var liner = new THREE.CylinderGeometry(open, open, BW + 0.1, 24, 1, true, Math.PI / 2, Math.PI);
  liner.rotateX(Math.PI / 2);
  [FA, RA].forEach(function(x){
    add(liner, well, x, WR, 0);
    [-1, 1].forEach(function(side){
      var z = side * (SIDE - 0.14);
      add(tyre, rubber, x, WR, z);
      add(cap, hub, x, WR, z + side * 0.004);
    });
  });

  /* livery: the black pattern at the rear and ROTA45, as on the real van */
  function decal(tex, w, h){
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat({
      map:tex, transparent:true, roughness:.5, metalness:.2,
      polygonOffset:true, polygonOffsetFactor:-4
    }));
  }
  var right = decal(livery(true), 3.7, 1.7);
  right.position.set(-1.0, 1.62, SIDE + 0.004);
  g.add(right);
  var left = decal(livery(false), 3.7, 1.7);
  left.position.set(-1.0, 1.62, -SIDE - 0.004);
  left.rotation.y = Math.PI;
  g.add(left);
  var back = decal(rearLivery(), 1.6, 1.5);
  back.position.set(-R - 0.065, 1.62, 0);
  back.rotation.y = -Math.PI / 2;
  g.add(back);

  /* soft contact shadow */
  var sc = document.createElement('canvas');
  sc.width = sc.height = 128;
  var sx = sc.getContext('2d');
  var grd = sx.createRadialGradient(64, 64, 6, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,.8)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  sx.fillStyle = grd;
  sx.fillRect(0, 0, 128, 128);
  var shadow = add(new THREE.PlaneGeometry(7.6, 3.3),
    new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(sc), transparent:true, depthWrite:false}), 0, 0.015, 0);
  shadow.rotation.x = -Math.PI / 2;

  return g;
}

function canvasTex(c){
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* side livery; rearLeft says which end of the canvas is the back of the van */
function livery(rearLeft){
  var c = document.createElement('canvas');
  c.width = 1024; c.height = 470;
  var x = c.getContext('2d');
  for (var i = 0; i < 30; i++){
    for (var j = 0; j < 11; j++){
      var a = 0.9 - (i / 29) * 1.6;
      if (a <= 0.03) continue;
      var cx = (rearLeft ? i : 29 - i) * 35 + (j % 2 ? 17 : 0) + 12, cy = j * 42 + 20;
      x.fillStyle = 'rgba(14,14,16,' + a.toFixed(2) + ')';
      x.beginPath(); x.moveTo(cx, cy - 12); x.lineTo(cx + 12, cy + 10); x.lineTo(cx - 12, cy + 10); x.closePath();
      x.fill();
    }
  }
  x.font = "italic 900 170px 'Exo 2', Impact, sans-serif";
  var a1 = x.measureText('ROTA').width, a2 = x.measureText('45').width, total = a1 + 6 + a2;
  var sx = rearLeft ? c.width - 60 - total : 60;
  x.fillStyle = '#0b0b0c'; x.fillText('ROTA', sx, 300);
  x.fillStyle = '#ff0019'; x.fillText('45', sx + a1 + 6, 300);
  x.font = "700 30px 'Roboto Mono', monospace";
  x.fillStyle = '#0b0b0c';
  x.fillText('TRANSPORTES', sx + 10, 350);
  x.fillStyle = '#ff0019';
  x.beginPath(); x.moveTo(0, 424); x.lineTo(c.width, 410); x.lineTo(c.width, 436); x.lineTo(0, 450); x.closePath();
  x.fill();
  return canvasTex(c);
}

function rearLivery(){
  var c = document.createElement('canvas');
  c.width = 512; c.height = 480;
  var x = c.getContext('2d');
  x.textAlign = 'center';
  x.font = "italic 900 120px 'Exo 2', Impact, sans-serif";
  x.fillStyle = '#0b0b0c'; x.fillText('ROTA', 256, 190);
  x.font = "italic 900 220px 'Exo 2', Impact, sans-serif";
  x.fillStyle = '#ff0019'; x.fillText('45', 256, 380);
  return canvasTex(c);
}
