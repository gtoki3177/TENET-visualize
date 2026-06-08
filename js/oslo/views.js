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
    this._desiredPos = new THREE.Vector3();
    this._curOff = new THREE.Vector3();
    this._desOffN = new THREE.Vector3();
    this._smoothOffset = new THREE.Vector3();
    this._useFixedOffset = false;
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

  // Smoothly hand the camera to a followable, easing toward its LIVE position (works even while
  // the target moves during a scrub). preserveAngle=true keeps the user's current viewing
  // angle/distance and only TRANSLATES the view onto the new self (used for phase switches);
  // false eases to the followable's preset framing (used for explicit view picks).
  followSmooth(key, preserveAngle = false, dur = 0.4) {
    const f = this.followables[key];
    if (!f) return;
    this.followKey = key;
    this.tween = null;
    this.controls.enabled = true;
    this._follow = f;
    this.mode = 'converge';
    this._convergeTau = dur / 3;        // exponential time-constant (~mostly there by `dur`)
    this._convergeElapsed = 0;
    this._lastFollowPos = null;
    this._useFixedOffset = preserveAngle;
    if (preserveAngle) this._smoothOffset.subVectors(this.camera.position, this.controls.target);
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

    if (this.mode === 'converge' && this._follow) {
      this._convergeElapsed += dt;
      this._follow.obj.getWorldPosition(this._tmp);          // live entity pos (desired centre)
      const alpha = 1 - Math.exp(-dt / this._convergeTau);
      this.controls.target.lerp(this._tmp, alpha);           // ease orbit centre onto the entity
      if (this._useFixedOffset) {
        // Rigid translation: keep the captured offset → same angle & distance, just re-centred.
        this.camera.position.copy(this.controls.target).add(this._smoothOffset);
      } else {
        // Ease offset direction + distance toward the preset framing (constant-ish distance
        // orbit, so a mirror-side switch doesn't punch through the centre).
        const desOff = this._follow.offset;
        const desMag = desOff.length() || 1;
        this._curOff.subVectors(this.camera.position, this.controls.target);
        const curMag = this._curOff.length() || desMag;
        this._desOffN.copy(desOff).divideScalar(desMag);
        this._curOff.divideScalar(curMag).lerp(this._desOffN, alpha).normalize();
        const mag = curMag + (desMag - curMag) * alpha;
        this.camera.position.copy(this.controls.target).addScaledVector(this._curOff, mag);
      }
      this.camera.lookAt(this.controls.target);
      if (this.controls.target.distanceTo(this._tmp) < 0.3 || this._convergeElapsed > this._convergeTau * 8) {
        this.mode = 'follow';
        this._follow.obj.getWorldPosition(this._tmp);
        this._lastFollowPos = this._tmp.clone();
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
