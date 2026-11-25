import {GLTFLoader} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import {bindActor} from './actor-rig.js?v=31';
export async function createAssets(T){
 const loader=new GLTFLoader(),cache=new Map(),status={};let manifest={};try{let r=await fetch('./assets/manifest.json',{cache:'no-cache'});if(r.ok)manifest=await r.json()}catch{}
 function load(key){if(!cache.has(key)){let entry=manifest[key];status[key]=entry?.url?'loading':'not configured';cache.set(key,entry?.url?loader.loadAsync(entry.url).then(g=>{status[key]='loaded: '+g.animations.map(c=>c.name).join(', ');return {g,entry}}).catch(e=>{status[key]='load failed';console.warn('Model fallback',key,e);return null}):Promise.resolve(null))}return cache.get(key)}
 let crowdAsset;
 function crowdCharacter(base) {
   if (!crowdAsset) crowdAsset = load('crowd').then(low => {
     if (!low) return base;
     const materials = new Map();
     base.scene.traverse(node => { if (node.isMesh) materials.set(node.material.name, node.material); });
     low.g.scene.traverse(node => {
       if (node.isMesh && materials.has(node.material.name)) node.material = materials.get(node.material.name);
     });
     return {scene: low.g.scene, animations: base.animations};
   });
   return crowdAsset;
 }
 async function attach(actor) {
   const data = await load('character');
   if (!data || actor.visual || !actor.g.visible) return;
   let asset = data.g;
   if (actor.color === 0x384c58) {
     const sprint = await load('sprint');
     if (sprint) asset = {scene: data.g.scene, animations: [...data.g.animations, ...sprint.g.animations]};
   } else asset = await crowdCharacter(data.g);
   if (!actor.visual && actor.g.visible) bindActor(T, actor, asset, load('weapon'), load('backpack'));
 }
 function tick(actor, speed, dt) { actor.rig?.tick(speed, dt); }
 async function placeTree(parent,fallback,key,height){let data=await load(key);if(!data)return;let model=data.g.scene.clone(true),bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3());if(!Number.isFinite(size.y)||size.y<.01)return;model.scale.multiplyScalar(height/size.y);bounds.setFromObject(model);let center=bounds.getCenter(new T.Vector3());model.position.sub(new T.Vector3(center.x,bounds.min.y,center.z));model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;if(key==='warehouse'){const muted=node.material.clone();muted.color.lerp(new T.Color(0x5c6258),.48);muted.roughness=.84;node.material=muted}}});parent.add(model);for(let child of fallback)child.visible=false} return {attach,tick,placeTree,status}
}