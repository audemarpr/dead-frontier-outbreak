// Layer action poses onto the current stride. Restore the mixer pose before the
// next update, including joints whose animation values stay constant for a frame.
export function makePoseLayer(T, model, clips, actor, equipped) {
  const joints = new Map();
  model.traverse(bone => {
    if (bone.isBone) joints.set(bone.name, {
      bone, q: new T.Quaternion(), p: new T.Vector3(),
      startQ: new T.Quaternion(), startP: new T.Vector3()
    });
  });
  const entries = [...joints.values()];
  const samples = new Map();
  const q = new T.Quaternion(), p = new T.Vector3(), turnQ = new T.Quaternion();
  const axis = new T.Vector3(0, 1, 0);
  let carryBlend = 0;
  let active = null, time = 0, saved = false, turn = 0, lastYaw = actor.g.rotation.y;

  function tracks(clip) {
    if (!samples.has(clip)) {
      const list = [];
      for (const track of clip.tracks) {
        const [name, property] = track.name.split('.');
        const joint = joints.get(name);
        if (joint && (property === 'quaternion' || property === 'position')) {
          list.push({name, property, joint, lower: /^(root|pelvis|thigh|calf|foot|ball)/.test(name), sample: track.createInterpolant()});
        }
      }
      samples.set(clip, list);
    }
    return samples.get(clip);
  }
  const carry = equipped && clips.has('Pistol_Aim_Down') ? tracks(clips.get('Pistol_Aim_Down')).filter(t =>
    t.property === 'quaternion' && /^(clavicle|upperarm|lowerarm|hand)_r$/.test(t.name)
  ).map(t => ({...t, target: new T.Quaternion().fromArray(t.sample.evaluate(0))})) : [];

  const floorJoints = ['Head','spine_03','pelvis','hand_l','hand_r','foot_l','foot_r'].map(name=>joints.get(name)?.bone).filter(Boolean);
  const restHeight = model.position.y;
  function restore() {
    if (!saved) return;
    for (const j of entries) { j.bone.quaternion.copy(j.q); j.bone.position.copy(j.p); }
    saved = false;
  }
  return {
    restore,
    isActing() { return active !== null; },
    start(key, clip) {
      if (!clip || active?.key === 'death') return false;
      if (key === 'hit' && active && active.key !== 'hit') return false;
      if (key === 'hit' && active?.key === 'hit' && time < .12) return false;
      if (active?.key === 'reload' && !['death','shoot','attack'].includes(key)) return false;
      for (const j of entries) {
        j.startQ.copy(j.bone.quaternion);
        j.startP.copy(j.bone.position);
      }
      active = {key, clip, tracks: tracks(clip)};
      time = 0;
      return true;
    },
    reset() { restore(); model.position.y=restHeight; active = null; time = turn = carryBlend = 0; lastYaw = actor.g.rotation.y; },
    apply(speed, dt) {
      const yaw = actor.g.rotation.y;
      const dy = Math.atan2(Math.sin(yaw-lastYaw), Math.cos(yaw-lastYaw));
      lastYaw = yaw;
      const moving = T.MathUtils.smoothstep(speed, .1, 1.4);
      const carryTarget = active ? 0 : 1;
      carryBlend += (carryTarget-carryBlend)*(1-Math.exp(-12*dt));
      turn = T.MathUtils.lerp(turn, T.MathUtils.clamp(dy / Math.max(dt,.001), -5, 5)*moving, 1-Math.exp(-7*dt));
      // Always preserve the sampled pose before procedural rig offsets.

      for (const j of entries) { j.q.copy(j.bone.quaternion); j.p.copy(j.bone.position); }
      saved = true;
      // A carried pistol stays closer to the body. Keep the captured shoulder
      // swing and let the support arm counterbalance the legs.
      for (const t of carry) {
        const weight = t.name === 'clavicle_r' ? .10 : t.name === 'upperarm_r' ? .32 : t.name === 'lowerarm_r' ? .52 : .43;
        t.joint.bone.quaternion.slerp(t.target, weight * (.85-.60*moving) * carryBlend);
      }
      if (Math.abs(turn)>.002) {
        for (const name of ['spine_01','spine_02','clavicle_l','clavicle_r','hand_l','hand_r']) {
          const j=joints.get(name);
          if (j) j.bone.quaternion.multiply(turnQ.setFromAxisAngle(axis,turn*(name.startsWith('spine')?.012:name.startsWith('hand')?-.016:-.009)*(active?.key==='death'?0:1)));
        }
      }
      if (!active) return;
      time += dt;
      const {key, clip} = active;
      const death = key === 'death';
      const enter = T.MathUtils.smoothstep(time, 0, Math.min(clip.duration*.25,key==='shoot'?.055:key==='reload'?.18:.14));
      const release = key==='shoot'?.12:key==='hit'?.24:key==='scratch'||key==='attack'?.26:.22;
      const leave = death ? 1 : T.MathUtils.smoothstep(clip.duration-time,0,Math.min(release,clip.duration*.35));
      const sampleTime = Math.min(time,clip.duration);
      for (const t of active.tracks) {
        const mask = death || !t.lower ? 1 : (1-moving)*(key==='hit'?.65:1);
        if (mask<=0) continue;
        const weight = leave * mask;
        const value = t.sample.evaluate(sampleTime);
        if (t.property === 'quaternion') {
          const out=t.joint.bone.quaternion;
          out.slerp(q.fromArray(value),weight);
          if (enter<1) out.slerp(t.joint.startQ,(1-enter)*mask);
        } else {
          const out=t.joint.bone.position;
          out.lerp(p.fromArray(value),weight);
          if (enter<1) out.lerp(t.joint.startP,(1-enter)*mask);
        }
      }
      if (death && time>clip.duration*.60) {
        model.position.y=restHeight;
        model.updateWorldMatrix(true,true);
        let lowest=Infinity;
        for (const bone of floorJoints) {
          const radius=bone.name==='Head'?.10:bone.name.startsWith('spine')?.13:.055;
          lowest=Math.min(lowest,bone.matrixWorld.elements[13]-radius);
        }
        model.position.y += T.MathUtils.clamp(-lowest,-.18,.18)*T.MathUtils.smoothstep(time,clip.duration*.60,clip.duration);
      }
      if (!death && time>=clip.duration) active=null;
    }
  };
}
