/* ============================================================
   ROTA 45 — the detailed Sprinter, in Rota 45 colours
   Model: "Mercedes-Benz Sprinter" (https://skfb.ly/otCUM) by
   Savelliy 07, licensed under Creative Commons Attribution 4.0
   (http://creativecommons.org/licenses/by/4.0/).
   Part colours are baked into assets/models/sprinter.glb; the
   livery is projected onto the body as decals here.
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { livery, rearLivery } from './live-map.js';

export var CREDIT = '<a href="https://skfb.ly/otCUM" target="_blank" rel="noopener">“Mercedes-Benz Sprinter”</a>'
  + ' by Savelliy 07, <a href="http://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>';

var LENGTH = 5.93; /* metres, as the built-in van */

/* resolves to a Group: x forward, y up, wheels on y = 0, centred, life size */
export function loadSprinter(url){
  var loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return loader.loadAsync(url).then(function(gltf){
    var model = gltf.scene;
    model.rotation.y = Math.PI / 2; /* the file faces +z */
    model.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(model);
    model.scale.setScalar(LENGTH / (box.max.x - box.min.x));
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    var c = box.getCenter(new THREE.Vector3());
    model.position.set(-c.x, -box.min.y, -c.z);

    var group = new THREE.Group();
    group.add(model);
    group.updateMatrixWorld(true);
    addLivery(group);
    addShadow(group);
    return group;
  });
}

/* ROTA45 on both sides and on the rear doors, like the real van */
function addLivery(group){
  var paint = [];
  group.traverse(function(o){ if (o.isMesh && o.material && o.material.name === 'paint') paint.push(o); });
  if (!paint.length) return;
  var body = new THREE.Box3();
  paint.forEach(function(m){ body.expandByObject(m); });

  var rear = body.min.x, mid = rear + 1.98, y = body.min.y + (body.max.y - body.min.y) * 0.56;
  function decal(tex, pos, turn, size){
    var mat = new THREE.MeshStandardMaterial({
      map:tex, transparent:true, roughness:.45, metalness:.15, depthWrite:false,
      polygonOffset:true, polygonOffsetFactor:-4
    });
    paint.forEach(function(mesh){
      var geo = new DecalGeometry(mesh, pos, new THREE.Euler(0, turn, 0), size);
      if (geo.attributes.position.count) group.add(new THREE.Mesh(geo, mat));
    });
  }
  decal(livery(true),  new THREE.Vector3(mid, y, body.max.z), 0,            new THREE.Vector3(3.7, 1.7, 0.5));
  decal(livery(false), new THREE.Vector3(mid, y, body.min.z), Math.PI,      new THREE.Vector3(3.7, 1.7, 0.5));
  decal(rearLivery(),  new THREE.Vector3(rear, y, 0),         -Math.PI / 2, new THREE.Vector3(1.6, 1.5, 0.5));
}

/* soft contact shadow under the van */
function addShadow(group){
  var c = document.createElement('canvas');
  c.width = c.height = 128;
  var x = c.getContext('2d');
  var g = x.createRadialGradient(64, 64, 6, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,.8)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  var shadow = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 3.3),
    new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c), transparent:true, depthWrite:false}));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  group.add(shadow);
}
