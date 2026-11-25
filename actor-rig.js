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
    const key = source.uuid + ':' + actor.color;
    if (!looks.has(key)) {
      const material = source.clone();
      if (material.name === 'Shirt') {
        material.color.setHex(actor.color);
        if (actor.zombie) material.map = wornFabric(T);
      }
      if (material.name === 'MI_Hair_1') material.color.setHex(0x49382e);
      if (actor.zombie && source.name.includes('Superhero')) material.color.setHex(0x9baf88);
      looks.set(key, material);
    }
    node.material = looks.get(key);
  });
  const mixer = new T.AnimationMixer(model);
  const clips = new Map(asset.animations.map(clip => [clip.name, clip]));
  const actions = Object.fromEntries(Object.entries(names).map(([key, name]) => [key, mixer.clipAction(clips.get(name))]));
  const hand = model.getObjectByName('hand_r');
  if (hand && (armed || isHostile)) {
    // Calibrate the grip in the authored firing pose, then preserve its local bone transform.
    actions.shoot.play();
    mixer.update(0);
    root.updateMatrixWorld(true);
    const socket = new T.Group();
    socket.position.copy(hand.getWorldPosition(new T.Vector3()));
    root.add(socket);
    hand.attach(socket);
    weapon.then(data => {
      if (!data) return;
      const pistol = data.g.scene.clone(true);
      const box = new T.Box3().setFromObject(pistol);
      const size = box.getSize(new T.Vector3());
      if (size.x > size.z) pistol.rotation.y = -Math.PI / 2;
      const length = Math.max(size.x, size.z, size.y);
      pistol.scale.setScalar(.23 / length);
      box.setFromObject(pistol);
      const center = box.getCenter(new T.Vector3());
      pistol.position.set(-center.x, .035-center.y, .055-center.z);
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
        pack.scale.setScalar(.46 / size.y);
        box.setFromObject(pack);
        pack.position.sub(box.getCenter(new T.Vector3()));
        mount.add(pack);
      });
    }
  }
  for (const child of actor.g.children) child.visible = false;
  actor.g.add(root);
  actor.visual = root;
  let current, locked = false, dead = false;
  function play(action, once = false) {
    if (current === action && !once) return;
    if (current !== action) current?.fadeOut(.10);
    current = action;
    action.reset().setLoop(once ? T.LoopOnce : T.LoopRepeat, once ? 1 : Infinity);
    action.clampWhenFinished = once;
    action.fadeIn(.10).play();
  }
  mixer.addEventListener('finished', event => {
    if (event.action === current && !dead) locked = false;
  });
  // Forward reach of the left foot occurs at phases 0 and .958 in the two clips.
  // Advance a shared step cycle by ground distance. The source foot sweeps give
  // approximately 1.36 m per walking cycle and 4.92 m per running cycle.
  let phase = 0, gaitActive = false;
  const stance = actions.armed;
  const sprint = clips.has('Sprint_Loop') ? mixer.clipAction(clips.get('Sprint_Loop')) : null;
  const gaitActions = [stance, actions.walk, actions.run, sprint].filter(Boolean);
  function stepGait(speed, dt) {
    const blend = T.MathUtils.smoothstep(speed, 1.45, 3.9);
    const moving = T.MathUtils.smoothstep(speed, .02, .48);
    const sprintWeight = sprint ? .52 * T.MathUtils.smoothstep(speed, 3.3, 4.8) : 0;
    const stride = 1.36 * (1 - blend) + 4.92 * (blend - sprintWeight) + 1.66 * sprintWeight;
    phase = (phase + Math.min(speed, 5.2) * dt / stride) % 1;
    if (!gaitActive) {
      if (current) current.fadeOut(.12);
      for (const action of gaitActions) action.reset().play();
      actions.walk.paused = actions.run.paused = true;
      if (sprint) sprint.paused = true;
      gaitActive = true;
      current = null;
    }
    actions.walk.time = phase * actions.walk.getClip().duration;
    actions.run.time = ((phase + .958) % 1) * actions.run.getClip().duration;
    actions.walk.setEffectiveWeight(moving * (1 - blend));
    actions.run.setEffectiveWeight(moving * (blend - sprintWeight));
    if (sprint) {
      sprint.time = ((phase + .85) % 1) * sprint.getClip().duration;
      sprint.setEffectiveWeight(moving * sprintWeight);
    }
    stance.setEffectiveWeight(1 - moving);
  }
  actor.rig = {
    act(key) {
      if (dead) return;
      dead = key === 'death';
      locked = true;
      if (gaitActive) {
        for (const action of gaitActions) action.fadeOut(.1);
        gaitActive = false;
      }
      play(actions[key], true);
    },
    reset() { mixer.stopAllAction(); current = null; gaitActive = false; phase = 0; dead = locked = false; },
    tick(speed, dt) {
      if (armed && !locked) stepGait(speed, dt);
      else if (!locked) {
        const key = actor.zombie ? (speed > .1 ? 'infectedWalk' : 'infectedIdle')
          : speed > 3.7 ? 'run' : speed > .1 ? 'walk' : armed || isHostile ? 'armed' : 'idle';
        play(actions[key]);
      }
      mixer.update(dt);
    }
  };
  actor.rig.tick(0, .1);
}
