import * as THREE from 'three';

function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

export class ViewManager {
  constructor(camera, controls, followables) {
    this.camera = camera;
    this.controls = controls;
    this.followables = followables;
    this.mode = 'orbit';
    this.followKey = null;
    this._follow = null;
    this.tween = null;
    this._tmp = new THREE.Vector3();
    this._delta = new THREE.Vector3();
  }

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

    if (this.mode === 'follow' && this._follow) {
      // Shift the view by the character's frame-to-frame movement (keeps it framed) WITHOUT
      // snapping the target onto it — so a Shift+middle pan offset is preserved.
      this._follow.obj.getWorldPosition(this._tmp);
      if (!this._lastFollowPos) this._lastFollowPos = this._tmp.clone();
      this._delta.subVectors(this._tmp, this._lastFollowPos);
      this.camera.position.add(this._delta);
      this.controls.target.add(this._delta);
      this._lastFollowPos.copy(this._tmp);
    }
  }
}
