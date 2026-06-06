import * as THREE from 'three';

function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

export class ViewManager {
  constructor(camera, controls, followables) {
    this.camera = camera;
    this.controls = controls;
    this.followables = followables;
    this.mode = 'orbit';       // 'orbit' | 'follow'
    this.followKey = null;
    this._follow = null;       // active followable { obj, offset }
    this.tween = null;         // { fromP, toP, fromT, toT, t, dur, onDone }
    this._tmp = new THREE.Vector3();
    this._delta = new THREE.Vector3();
  }

  // Smoothly fly to a framing, then hand back to orbit controls
  flyTo(pos, target, dur = 1.3, onDone = null) {
    this.controls.enabled = false;
    this.tween = {
      fromP: this.camera.position.clone(),
      toP: pos.clone(),
      fromT: this.controls.target.clone(),
      toT: target.clone(),
      t: 0, dur, onDone,
    };
  }

  goGod(framing) {
    this.mode = 'orbit';
    this.followKey = null;
    this._follow = null;
    this.flyTo(framing.pos, framing.target, 1.2, () => { this.controls.enabled = true; });
  }

  goLocation(loc) {
    this.mode = 'orbit';
    this.followKey = null;
    this._follow = null;
    this.flyTo(loc.pos, loc.target, 1.2, () => { this.controls.enabled = true; });
  }

  // Start following a character: snap to an initial framing, then track its movement
  // while leaving OrbitControls ENABLED so the user can freely orbit + wheel-zoom.
  follow(key) {
    const f = this.followables[key];
    if (!f) return;
    this.followKey = key;
    this.tween = null;
    this.mode = 'follow';
    this._follow = f;
    this.controls.enabled = true;
    f.obj.getWorldPosition(this._tmp);
    this.controls.target.copy(this._tmp);
    this.camera.position.copy(this._tmp).add(f.offset);
    this.camera.lookAt(this._tmp);
    this._lastFollowPos = this._tmp.clone();
  }

  // Hand off to a different followable WITHOUT touching the camera, so the user's
  // current orbit + zoom carry over (used for the Neil self handoff; selves are
  // co-located at phase boundaries, so tracking recentres with ~no jump).
  followObject(f) {
    this.tween = null;
    this.mode = 'follow';
    this._follow = f;
    this.controls.enabled = true;
    this._lastFollowPos = null;
  }

  update(dt) {
    if (this.tween) {
      this.tween.t += dt / this.tween.dur;
      const k = easeInOut(Math.min(1, this.tween.t));
      this.camera.position.lerpVectors(this.tween.fromP, this.tween.toP, k);
      this.controls.target.lerpVectors(this.tween.fromT, this.tween.toT, k);
      this.camera.lookAt(this.controls.target);
      if (this.tween.t >= 1) {
        const done = this.tween.onDone;
        this.tween = null;
        if (done) done();
      }
      return;
    }

    // Follow: shift camera + orbit target by the character's frame-to-frame movement
    // so it stays centred. controls.update() (called by the main loop) then applies
    // the user's orbit/zoom around that moving target.
    if (this.mode === 'follow' && this._follow) {
      // Shift camera + target by the character's frame-to-frame movement (keeps it framed
      // and preserves the user's orbit/zoom AND any Shift+middle pan offset).
      this._follow.obj.getWorldPosition(this._tmp);
      if (!this._lastFollowPos) this._lastFollowPos = this._tmp.clone();
      this._delta.subVectors(this._tmp, this._lastFollowPos);
      this.camera.position.add(this._delta);
      this.controls.target.add(this._delta);
      this._lastFollowPos.copy(this._tmp);
    }
  }
}
