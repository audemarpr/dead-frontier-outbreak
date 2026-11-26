import {makePoseLayer} from './pose-layer.js?v=52';
import {clone} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js';

const looks = new Map();
let infectedCloth;
function wornFabric(T) {
  if (infectedCloth) return infectedCloth;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#c1bea2';
  ctx.fillRect(0, 0, 128, 128);
  let seed = 291;
  function random() { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }
  for (let i = 0; i < 170; i++) {
    ctx.fillStyle = i % 5 ? '#403e322c' : '#55312e99';
    ctx.beginPath();
    ctx.ellipse(random()*128, random()*128, 1+random()*3, 2+random()*8, random(), 0, Math.PI*2);
    ctx.fill();
  }
  infectedCloth = new T.CanvasTexture(canvas);
  infectedCloth.colorSpace = T.SRGBColorSpace;
  return infectedCloth;
}

let survivorFabric;
function cleanFabric(T) {
  if(survivorFabric)return survivorFabric;
  const c=document.createElement('canvas');c.width=c.height=128;
  const ctx=c.getContext('2d');ctx.fillStyle='#e5e3dc';ctx.fillRect(0,0,128,128);
  for(let i=0;i<128;i+=4){ctx.fillStyle='#0000000b';ctx.fillRect(i,0,1,128);ctx.fillRect(0,i,128,1);}
  let seed=91;for(let i=0;i<1200;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%128;seed=(Math.imul(seed,1664525)+1013904223)>>>0;ctx.fillStyle='#514b3b18';ctx.fillRect(x,(seed>>>8)%128,2,1);}
  survivorFabric=new T.CanvasTexture(c);survivorFabric.colorSpace=T.SRGBColorSpace;return survivorFabric;
}
const names = {
  idle: 'Idle_Loop', armed: 'Pistol_Idle_Loop', walk: 'Walk_Loop', run: 'Jog_Fwd_Loop',
  shoot: 'Pistol_Shoot', reload: 'Pistol_Reload', attack: 'Punch_Jab', death: 'Death01',
  infectedIdle: 'Zombie_Idle_Loop', infectedWalk: 'Zombie_Walk_Fwd_Loop', scratch: 'Zombie_Scratch'
};

export function bindActor(T, actor, asset, weapon, backpack) {
  const model = clone(asset.scene);
  const root = new T.Group();
  const armed = actor.color === 0x384c58;
  const isHostile = actor.g.userData.ranged === true;
  // The base character stores mesh positions in model space. Cloned bone matrices
  // are still uninitialized here, so measure the authored bind-pose geometry.
  const bounds = new T.Box3();
  model.traverse(node => {
    if (!node.isSkinnedMesh) return;
    node.geometry.computeBoundingBox();
    bounds.union(node.geometry.boundingBox);
  });
  model.scale.setScalar(1.85 / (bounds.max.y - bounds.min.y));
  model.position.y = -bounds.min.y * model.scale.y;
  root.add(model);
  model.traverse(node => {
    if (!node.isMesh) return;
    if (node.name === 'BuzzCut') node.visible = armed || (!actor.zombie && Math.round(actor.x) % 3 !== 0);
    node.castShadow = true;
    node.receiveShadow = true;
    const source = node.material;
    const variant=actor.zombie?Math.abs(Math.round(actor.x*7+actor.z*13))%4:0;
    const key = source.uuid + ':' + actor.color + ':' + (actor.zombie?'infected'+variant:'survivor');
    if (!looks.has(key)) {
      const material = source.clone();
      if (material.name === 'Shirt') {
        material.color.setHex(actor.color);
        if (actor.zombie) {material.map = wornFabric(T);material.color.multiplyScalar([.72,.85,.94,.63][variant]);material.roughness=.95;}
      }
      if (material.name === 'MI_Hair_1') {material.color.setHex(actor.zombie?0x49382e:armed?0x302a24:0x49382e);material.roughness=.85;}
      if (!actor.zombie && material.name === 'Shirt') {material.roughness=.92;material.color.multiplyScalar(.88);if(!material.map)material.map=cleanFabric(T);}
      if (actor.zombie && source.name.includes('Superhero')) {material.color.setHex([0x9baf88,0xa8a18a,0x929d89,0xb0a69b][variant]);material.roughness=.9;}
      looks.set(key, material);
    }
    node.material = looks.get(key);
  });
  const mixer = new T.AnimationMixer(model);
  const clips = new Map(asset.animations.map(clip => [clip.name, clip]));
  const actions = Object.fromEntries(Object.entries(names).map(([key, name]) => [key, mixer.clipAction(clips.get(name))]));
  let weaponSocket;
  const hand = model.getObjectByName('hand_r');
  if (hand && (armed || isHostile)) {
    // Calibrate the grip in the authored firing pose, then preserve its local bone transform.
    actions.shoot.play();
    mixer.update(0);
    root.updateMatrixWorld(true);
    const socket = new T.Group();
    weaponSocket = socket;
    socket.position.copy(hand.getWorldPosition(new T.Vector3()));
    const knuckle = model.getObjectByName('middle_01_r');
    if (knuckle) socket.position.lerp(knuckle.getWorldPosition(new T.Vector3()), .65);
    root.add(socket);
    hand.attach(socket);
    weapon.then(data => {
      if (!data) return;
      const pistol = data.g.scene.clone(true);
      const box = new T.Box3().setFromObject(pistol);
      const size = box.getSize(new T.Vector3());
      if (size.x > size.z) pistol.rotation.y = -Math.PI / 2;
      const length = Math.max(size.x, size.z, size.y);if(!Number.isFinite(length)||length<=0)return;
      pistol.scale.setScalar(.23 / length);
      box.setFromObject(pistol);
      const center = box.getCenter(new T.Vector3());
      pistol.position.set(-center.x, .035-center.y, .055-center.z);
      pistol.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
      socket.add(pistol);
    });
    actions.shoot.stop();
  }
  if (armed) {
    const spine = model.getObjectByName('spine_03');
    if (spine) {
      const mount = new T.Group();
      mount.position.set(0, 1.28, -.19);
      root.add(mount);
      root.updateMatrixWorld(true);
      spine.attach(mount);
      backpack.then(data => {
        if (!data) return;
        const pack = data.g.scene.clone(true);
        const box = new T.Box3().setFromObject(pack);
        const size = box.getSize(new T.Vector3());
        if(!Number.isFinite(size.y)||size.y<=0)return;pack.scale.setScalar(.46 / size.y);
        box.setFromObject(pack);
        pack.position.sub(box.getCenter(new T.Vector3()));
        pack.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});
        mount.add(pack);
      });
    }
  }
  for (const child of actor.g.children) child.visible = false;
  actor.g.add(root);
  actor.visual = root;
  const layer = makePoseLayer(T, model, clips, actor, armed || isHostile);
  const seedPhase = actor.phase / (Math.PI*2);
  let phase = armed ? 0 : seedPhase, gaitActive = false, dead = false;
  let alternate = false, hideWeapon = 0, visualSpeed = 0, acceleration = 0, lastSpeed = 0;
  const chest=model.getObjectByName('spine_02');
  const pelvis=model.getObjectByName('pelvis');
  const rollAxis=new T.Vector3(0,0,1), rollQ=new T.Quaternion();
  const twistAxis=new T.Vector3(0,1,0), twistQ=new T.Quaternion();
  const upperSpine=model.getObjectByName('spine_03');
  const leanAxis=new T.Vector3(1,0,0), leanQ=new T.Quaternion();
  const stance = armed || isHostile ? actions.armed : actions.idle;
  const captured = clips.has('CapturedWalk') && clips.has('CapturedJog') && clips.has('CapturedRun');
  const walk = captured ? mixer.clipAction(clips.get('CapturedWalk')) : actions.walk;
  const jog = captured ? mixer.clipAction(clips.get('CapturedJog')) : actions.run;
  const run = captured ? mixer.clipAction(clips.get('CapturedRun')) : null;
  const gaitActions = [stance, walk, jog, run].filter(Boolean);
  function stepGait(speed, dt, travelSpeed = speed) {
    const moving = T.MathUtils.smoothstep(speed, .02, .48);
    const jogBlend = T.MathUtils.smoothstep(speed, 1.55, 2.85);
    const runBlend = captured ? T.MathUtils.smoothstep(speed, 2.85, 4.3) : 0;
    // Each stride is the captured distance between successive same-foot contacts,
    // scaled to the survivor's leg length. The fast take starts on the other foot.
    const walkWeight = 1 - jogBlend, jogWeight = jogBlend - runBlend;
    const stride = captured ? 1.311*walkWeight + 2.055*jogWeight + 2.695*runBlend
                            : 1.36*walkWeight + 4.92*jogWeight;
    phase = (phase + Math.min(travelSpeed, 5.2) * dt / stride) % 1;
    if (!gaitActive) {

      for (const action of gaitActions) action.reset().play();
      walk.paused = jog.paused = true;
      if (run) run.paused = true;
      gaitActive = true;
      stance.time = seedPhase * stance.getClip().duration;
    }
    walk.time = phase * walk.getClip().duration;
    jog.time = ((phase + (captured ? 0 : .958)) % 1) * jog.getClip().duration;
    walk.setEffectiveWeight(moving * walkWeight);
    jog.setEffectiveWeight(moving * jogWeight);
    if (run) {
      run.time = ((phase + .5056) % 1) * run.getClip().duration;
      run.setEffectiveWeight(moving * runBlend);
    }
    stance.setEffectiveWeight(1 - moving);
  }
  let infectedReady = false;
  const shamble = clips.has('CapturedShamble') ? mixer.clipAction(clips.get('CapturedShamble')) : null;
  function infectedGait(speed, dt, travelSpeed = speed) {
    const idle=actions.infectedIdle, shuffle=actions.infectedWalk;
    if (!infectedReady) {
      idle.reset().play(); shuffle.reset().play(); shuffle.paused=true;
      idle.time=seedPhase*idle.getClip().duration;
      idle.timeScale=.94+seedPhase*.12;
      if (shamble) { shamble.reset().play(); shamble.paused=true; }
      infectedReady=true;
    }
    const weight=T.MathUtils.smoothstep(speed,.035,.68);
    const chase=shamble ? T.MathUtils.smoothstep(speed,.54+seedPhase*.12,1.62) : 1;
    phase=(phase+Math.min(2.5,travelSpeed)*dt/(.716*(1-chase)+1.22*chase))%1;
    if (shamble) {
      shamble.time=phase*shamble.getClip().duration;
      shamble.setEffectiveWeight(weight*(1-chase));
    }
    shuffle.time=phase*shuffle.getClip().duration;
    shuffle.setEffectiveWeight(weight*chase); idle.setEffectiveWeight(1-weight);
  }
  actor.rig = {
    act(key) {
      if (dead) return;
      const variations = key==='attack' || key==='scratch';
      const choice = key==='attack' && alternate ? 'Punch_Cross' :
        key==='scratch' && alternate ? 'Melee_Hook' : names[key] ||
        ({hit:'Hit_Chest',loot:'PickUp_Table',consume:'Consume',interact:'Interact'})[key];
      const clip=clips.get(choice) || clips.get(names[key]);
      if (!layer.start(key,clip)) return;
      if (variations) alternate=!alternate;
      dead=key==='death';
      hideWeapon=['consume','loot','interact','attack'].includes(key)?clip.duration:0;
    },
    reset() {
      layer.reset(); mixer.stopAllAction();
      phase=armed?0:seedPhase; gaitActive=infectedReady=dead=false; hideWeapon=0; visualSpeed=0; acceleration=lastSpeed=0;
      if (weaponSocket) weaponSocket.visible=true;
    },
    tick(speed, dt) {
      layer.restore();
      if (!dead) {
        // Smooth pose weights independently of gameplay movement; keep stride phase continuous.
        const target = Number.isFinite(speed) ? Math.max(0,speed) : 0;
        visualSpeed += (target-visualSpeed)*(1-Math.exp(-(target>visualSpeed?12:17)*dt));
        if (visualSpeed<.015 && target===0) visualSpeed=0;
        if (actor.zombie) infectedGait(visualSpeed,dt,target); else stepGait(visualSpeed,dt,target);
      }
      mixer.update(dt);
      layer.apply(visualSpeed,dt);
      if(!dead && !actor.zombie && visualSpeed>.15 && !layer.isActing()){
        const amount=T.MathUtils.smoothstep(visualSpeed,.15,1.5)*(1-.35*T.MathUtils.smoothstep(visualSpeed,2.5,4.5));
        const cycle=phase*Math.PI*2;
        const sway=Math.sin(cycle)*.025*amount;
        const twist=Math.cos(cycle)*.035*amount;
        if(pelvis)pelvis.quaternion.multiply(twistQ.setFromAxisAngle(twistAxis,twist));
        if(upperSpine)upperSpine.quaternion.multiply(twistQ.setFromAxisAngle(twistAxis,-twist*.85));
        if(pelvis)pelvis.quaternion.multiply(rollQ.setFromAxisAngle(rollAxis,sway));
        if(chest)chest.quaternion.multiply(rollQ.setFromAxisAngle(rollAxis,-sway*.8));
      }
      // Subtle acceleration-dependent body lean; apply only to freshly sampled gait poses.
      const change=T.MathUtils.clamp((visualSpeed-lastSpeed)/Math.max(dt,.001),-8,8);
      acceleration+=(change-acceleration)*(1-Math.exp(-8*dt));lastSpeed=visualSpeed;
      if(!dead && chest && visualSpeed>.15 && !layer.isActing()){chest.quaternion.multiply(leanQ.setFromAxisAngle(leanAxis,T.MathUtils.clamp(acceleration*.006,-.035,.035)));}
      hideWeapon=Math.max(0,hideWeapon-dt);
      if (weaponSocket) weaponSocket.visible=hideWeapon===0;
    }
  };
  actor.rig.tick(0, .1);
}
