/* ============================================================
   ROTA 45 — trips (viagens)
   Local prototype: the data lives in this browser's localStorage,
   so a client link only works on the computer that created it.
   For production, swap read()/write() for a real database; the
   rest of the site only talks to the functions exported here.
   ============================================================ */

var KEY = 'r45-viagens-v2';
var memory = null; /* fallback when localStorage is blocked */

export var BUSINESS_PHONE = '+351 967 951 060';
export var BUSINESS_WA = '351967951060';

function read(){
  try {
    var s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.trips)) return s;
  } catch (e){}
  return memory;
}

function write(s){
  memory = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e){}
  window.dispatchEvent(new CustomEvent('r45-trips'));
}

function state(){
  var s = read();
  if (!s){ s = example(); write(s); }
  return s;
}

function token(){
  var abc = 'abcdefghjkmnpqrstuvwxyz23456789', out = '', bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (var i = 0; i < bytes.length; i++) out += abc[bytes[i] % abc.length];
  return out;
}

/* ---------- reading ---------- */

export function getTrips(){
  return state().trips.slice().sort(function(a, b){ return a.seq - b.seq; });
}

export function getTrip(id){
  return getTrips().find(function(t){ return t.id === id; }) || null;
}

export function current(trips){
  return trips.find(function(t){ return t.status === 'em_curso'; }) || null;
}

export function queue(trips){
  return trips.filter(function(t){ return t.status === 'agendada'; });
}

export function finished(trips){
  return trips.filter(function(t){ return t.status === 'concluida'; })
    .sort(function(a, b){ return b.finishedAt - a.finishedAt; });
}

/* trips still to deliver, in delivery order: the one on the road first */
export function onBoard(trips){
  var c = current(trips);
  return (c ? [c] : []).concat(queue(trips));
}

/* deliveries that happen before this one */
export function ahead(trips, trip){
  if (trip.status !== 'agendada') return 0;
  return onBoard(trips).filter(function(t){ return t.seq < trip.seq; }).length;
}

export function totals(trip){
  var n = 0, m3 = 0, kg = 0;
  trip.packages.forEach(function(p){
    n += p.qty;
    m3 += p.l * p.w * p.h * p.qty / 1e6;
    kg += (p.kg || 0) * p.qty;
  });
  return {n:n, m3:m3, kg:kg};
}

export function subscribe(fn){
  window.addEventListener('storage', function(e){ if (e.key === KEY) fn(); });
  window.addEventListener('r45-trips', fn);
}

/* ---------- links ---------- */

export function tripUrl(trip){
  return new URL('viagem.html#' + trip.id, location.href).href;
}

function waNumber(phone){
  var d = String(phone || '').replace(/\D/g, '');
  if (d.indexOf('00') === 0) d = d.slice(2);
  if (d.length === 9) d = '351' + d; /* a Portuguese number written without the country code */
  return d;
}

export function whatsappUrl(trip){
  var first = trip.client.split(' ')[0];
  var text = 'Olá ' + first + '! Pode acompanhar a sua entrega da Rota 45 aqui: ' + tripUrl(trip);
  return 'https://wa.me/' + waNumber(trip.phone) + '?text=' + encodeURIComponent(text);
}

/* ---------- changes ---------- */

export function startNext(){
  var s = state(), trips = s.trips;
  if (trips.some(function(t){ return t.status === 'em_curso'; })) return null;
  var next = trips.filter(function(t){ return t.status === 'agendada'; })
    .sort(function(a, b){ return a.seq - b.seq; })[0];
  if (!next) return null;
  next.status = 'em_curso';
  next.startedAt = Date.now();
  write(s);
  return next;
}

export function finishCurrent(){
  var s = state();
  var c = s.trips.find(function(t){ return t.status === 'em_curso'; });
  if (!c) return null;
  c.status = 'concluida';
  c.finishedAt = Date.now();
  write(s);
  return c;
}

export function addTrip(data){
  var s = state();
  var seq = s.trips.reduce(function(m, t){ return Math.max(m, t.seq); }, 0) + 1;
  var trip = {
    id: token(), seq: seq, status: 'agendada', createdAt: Date.now(),
    client: data.client, phone: data.phone || '', from: data.from || '', to: data.to || '',
    packages: data.packages || []
  };
  s.trips.push(trip);
  write(s);
  return trip;
}

export function removeTrip(id){
  var s = state();
  s.trips = s.trips.filter(function(t){ return !(t.id === id && t.status === 'agendada'); });
  write(s);
}

/* swap a scheduled trip with its neighbour in the queue (dir -1 up, +1 down) */
export function moveTrip(id, dir){
  var s = state();
  var q = s.trips.filter(function(t){ return t.status === 'agendada'; }).sort(function(a, b){ return a.seq - b.seq; });
  var i = q.findIndex(function(t){ return t.id === id; }), j = i + dir;
  if (i < 0 || j < 0 || j >= q.length) return;
  var tmp = q[i].seq; q[i].seq = q[j].seq; q[j].seq = tmp;
  write(s);
}

export function resetExample(){ write(example()); }

/* ---------- example data (no phone numbers, so nobody gets messaged by mistake) ---------- */

function P(desc, l, w, h, kg, qty, fragile){ return {desc:desc, l:l, w:w, h:h, kg:kg, qty:qty, fragile:!!fragile}; }

function example(){
  var now = Date.now(), min = 60000;
  /* fixed codes: the example links open the same trip on any device */
  var ids = ['jp7k2mqa', 'ac4n9xwe', 'mf8t3rzd', 'ir2v6hpq', 'rl9c4yst', 'cm5w8kbn', 'sm3h7gve'];
  var rows = [
    ['João Pereira', 'Porto', 'Lyon', [P('Máquina de lavar',60,60,85,70,1), P('Caixa',50,50,50,15,4)]],
    ['Ana Costa', 'Vila Franca de Xira', 'Genebra', [P('Palete',120,80,100,250,1)]],
    ['Maria Fernandes', 'Lisboa', 'Paris', [P('Caixa de roupa',60,40,40,12,6), P('Mala',75,50,30,20,2), P('Televisão',110,20,70,18,1,true)]],
    ['Inês Rocha', 'Lisboa', 'Paris', [P('Caixa',50,40,40,10,10), P('Sofá',200,90,80,60,1)]],
    ['Ricardo Lopes', 'Leiria', 'Paris', [P('Caixa',40,30,30,8,8), P('Bicicleta',170,20,100,15,1)]],
    ['Carlos Mendes', 'Coimbra', 'Bruxelas', [P('Palete',120,80,120,180,1), P('Caixa',60,40,50,20,6)]],
    ['Sofia Martins', 'Lisboa', 'Luxemburgo', [P('Arca',100,60,70,40,2), P('Saco',70,40,40,10,3), P('Espelho',120,10,80,12,1,true)]]
  ];
  return {
    example: true,
    trips: rows.map(function(r, i){
      var t = {
        id: ids[i], seq: i + 1, status: 'agendada', createdAt: now - (300 - i) * min, example: true,
        client: r[0], phone: '', from: r[1], to: r[2], packages: r[3]
      };
      if (i === 0){ t.status = 'concluida'; t.startedAt = now - 260 * min; t.finishedAt = now - 95 * min; }
      if (i === 1){ t.status = 'em_curso'; t.startedAt = now - 70 * min; }
      return t;
    })
  };
}
