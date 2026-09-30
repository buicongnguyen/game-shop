import test from 'node:test';
import assert from 'node:assert/strict';
import { CUES, createAudio } from '../src/audio.js';

const LISTED = ['tap', 'bowl', 'broth', 'topping', 'chili', 'potStart', 'potReady', 'potBurn', 'serveGood', 'serveBad', 'coin', 'tip',
  'customerArrive', 'customerLeave', 'levelUp', 'goal', 'incident', 'success', 'fail', 'chime', 'pageTurn'];

// Minimal Web Audio stand-in that records every node and automation call and rejects invalid values like browsers do.
class FakeParam {
  constructor(ctx, value) { this.ctx = ctx; this.value = value; this.events = []; }
  record(type, value, time, valid = true) {
    if (!valid || !Number.isFinite(value) || !Number.isFinite(time) || time < 0) {
      this.ctx.errors.push(`${type}(${value}, ${time})`);
      throw new RangeError(`invalid ${type}`);
    }
    this.events.push({ type, value, time });
  }
  setValueAtTime(value, time) { this.record('set', value, time); this.value = value; }
  linearRampToValueAtTime(value, time) { this.record('linear', value, time); }
  exponentialRampToValueAtTime(value, time) { this.record('exp', value, time, value > 0); }
  setTargetAtTime(value, time, constant) { this.record('target', value, time, constant > 0); }
  cancelScheduledValues(time) { this.events.push({ type: 'cancel', time }); }
}
class FakeNode {
  constructor(ctx, kind) { this.kind = kind; this.outputs = []; ctx.nodes.push(this); }
  connect(target) { this.outputs.push(target); return target; }
  disconnect() { this.outputs = []; }
}
class FakeSource extends FakeNode {
  start(when = 0) { this.startAt = when; }
  stop(when = 0) { this.stopAt = when; }
}
class FakeAudioContext {
  static last = null;
  constructor() {
    Object.assign(this, { nodes: [], errors: [], currentTime: 0, closed: false, destination: { kind: 'destination' } });
    FakeAudioContext.last = this;
  }
  createGain() { const node = new FakeNode(this, 'gain'); node.gain = new FakeParam(this, 1); return node; }
  createOscillator() { const node = new FakeSource(this, 'oscillator'); node.frequency = new FakeParam(this, 440); return node; }
  createBufferSource() { return new FakeSource(this, 'noise'); }
  createBiquadFilter() {
    const node = new FakeNode(this, 'filter');
    Object.assign(node, { frequency: new FakeParam(this, 350), Q: new FakeParam(this, 1) });
    return node;
  }
  createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length);
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: () => data };
  }
  resume() { return Promise.resolve(); }
  close() { this.closed = true; return Promise.resolve(); }
}

const isSource = node => node.kind === 'oscillator' || node.kind === 'noise';
function unlocked() {
  const audio = createAudio({ AudioContextClass: FakeAudioContext });
  assert.equal(audio.unlock(), true);
  return { audio, ctx: FakeAudioContext.last };
}
function playNodes(audio, ctx, cue, options) {
  const before = ctx.nodes.length, played = audio.play(cue, options);
  return { played, nodes: ctx.nodes.slice(before) };
}
function assertEnvelopes(nodes, label) {
  let peak = 0;
  for (const { gain } of nodes.filter(node => node.kind === 'gain')) {
    const values = gain.events.map(event => event.value);
    assert.ok(values.length >= 3, `${label}: attack and release are scheduled`);
    assert.ok(values[0] <= 0.001 && values.at(-1) <= 0.001, `${label}: starts and ends silent`);
    peak = Math.max(peak, ...values);
  }
  assert.ok(peak > 0.01 && peak <= 0.3, `${label}: peak ${peak} must stay within 0.3`);
}
// Replaces setInterval/clearInterval so the scheduler can be driven and inspected by hand.
function fakeTimers() {
  const real = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
  const active = new Map();
  let nextId = 1;
  globalThis.setInterval = (fn, ms) => { active.set(nextId, { fn, ms }); return nextId++; };
  globalThis.clearInterval = id => { active.delete(id); };
  return {
    active,
    advance(ctx, seconds) {
      for (let i = 0; i < Math.round(seconds / 0.025); i++) {
        ctx.currentTime += 0.025;
        for (const { fn } of [...active.values()]) fn();
      }
    },
    restore() { Object.assign(globalThis, real); },
  };
}

test('CUES lists every cue name exactly once and is frozen', () => {
  assert.equal(CUES.length, LISTED.length);
  for (const name of LISTED) assert.ok(CUES.includes(name), name);
  assert.equal(new Set(CUES).size, CUES.length);
  assert.ok(Object.isFrozen(CUES));
});

test('without an AudioContext (plain Node) every method is a safe no-op', t => {
  if (globalThis.AudioContext || globalThis.webkitAudioContext) return t.skip('this runtime has Web Audio');
  const timers = fakeTimers();
  try {
    const audio = createAudio();
    assert.deepEqual(Object.keys(audio).sort(), ['dispose', 'play', 'setEnabled', 'setMusic', 'setVolumes', 'unlock']);
    assert.equal(audio.unlock(), false);
    for (const cue of [...CUES, 'unknown', undefined]) assert.equal(audio.play(cue, { pitch: 3 }), false);
    audio.setVolumes({ sfx: 0.4, music: 2 });
    audio.setVolumes();
    audio.setEnabled({ sfx: false, music: true });
    audio.setEnabled();
    for (const mood of ['prep', 'service', null, 'party']) audio.setMusic(mood);
    assert.equal(timers.active.size, 0, 'no scheduler runs without a context');
    audio.dispose();
    audio.dispose();
    assert.equal(audio.play('coin'), false);
    assert.equal(createAudio({ AudioContextClass: null }).unlock(), false);
  } finally {
    timers.restore();
  }
});

test("play('serveGood') creates oscillators with envelopes that peak within 0.3", () => {
  const { audio, ctx } = unlocked();
  const { played, nodes } = playNodes(audio, ctx, 'serveGood');
  assert.equal(played, true);
  const oscillators = nodes.filter(node => node.kind === 'oscillator');
  assert.ok(oscillators.length >= 3);
  assertEnvelopes(nodes, 'serveGood');
  const lowestPerOnset = new Map();
  for (const osc of oscillators) {
    const f = osc.frequency.events[0].value;
    lowestPerOnset.set(osc.startAt, Math.min(f, lowestPerOnset.get(osc.startAt) ?? Infinity));
  }
  const notes = [...lowestPerOnset].sort((a, b) => a[0] - b[0]).map(([, f]) => f);
  assert.equal(notes.length, 3, 'three notes');
  assert.ok(notes[0] < notes[1] && notes[1] < notes[2], 'the notes rise');
  assert.deepEqual(ctx.errors, []);
  audio.dispose();
});

test('every cue schedules short, self-stopping voices; pitch shifts and unknown cues are safe', () => {
  const { audio, ctx } = unlocked();
  for (const cue of CUES) {
    ctx.currentTime += 5;
    const { played, nodes } = playNodes(audio, ctx, cue);
    assert.equal(played, true, cue);
    const sources = nodes.filter(isSource);
    assert.ok(sources.length > 0, `${cue} makes sound`);
    for (const source of sources) {
      assert.ok(source.startAt >= ctx.currentTime && source.stopAt > source.startAt, `${cue} starts and stops`);
      assert.ok(source.stopAt - ctx.currentTime < 3.5, `${cue} is short`);
    }
    assertEnvelopes(nodes, cue);
  }
  const tapHz = options => { ctx.currentTime += 1; return playNodes(audio, ctx, 'tap', options).nodes.find(isSource).frequency.events[0].value; };
  const base = tapHz();
  assert.ok(Math.abs(tapHz({ pitch: 12 }) / base - 2) < 1e-9, 'an octave up doubles the frequency');
  assert.equal(tapHz({ pitch: Number.NaN }), base);
  assert.equal(playNodes(audio, ctx, 'nope').nodes.length, 0);
  assert.equal(audio.play('constructor'), false);
  assert.deepEqual(ctx.errors, []);
  audio.dispose();
});

test('setEnabled({ sfx: false }) makes play() create nothing until it is enabled again', () => {
  const { audio, ctx } = unlocked();
  audio.setEnabled({ sfx: false });
  for (const cue of CUES) {
    const { played, nodes } = playNodes(audio, ctx, cue);
    assert.equal(played, false, cue);
    assert.equal(nodes.length, 0, cue);
  }
  ctx.currentTime += 1;
  audio.setEnabled({ sfx: true });
  const { played, nodes } = playNodes(audio, ctx, 'tap');
  assert.equal(played, true);
  assert.ok(nodes.length > 0);
  audio.dispose();
});

test("setMusic('service') runs a 25 ms lookahead scheduler within 6 voices per beat, and dispose() clears it", () => {
  const timers = fakeTimers();
  try {
    const audio = createAudio({ AudioContextClass: FakeAudioContext });
    audio.setMusic('service');
    assert.equal(timers.active.size, 0, 'nothing is scheduled before unlock');
    audio.unlock();
    const ctx = FakeAudioContext.last;
    assert.equal(timers.active.size, 1);
    assert.ok([...timers.active.values()][0].ms <= 30);
    const starts = [];
    for (let i = 0; i < 800; i++) { // 20 s of music in 25 ms ticks
      const before = ctx.nodes.length;
      timers.advance(ctx, 0.025);
      for (const node of ctx.nodes.slice(before).filter(isSource)) {
        const ahead = node.startAt - ctx.currentTime;
        assert.ok(ahead >= 0 && ahead <= 0.15, `scheduled ${ahead.toFixed(3)} s ahead`);
        starts.push(node.startAt);
      }
    }
    const beat = 60 / 108, first = Math.min(...starts), perBeat = new Map();
    for (const time of starts) {
      const index = Math.floor((time - first) / beat + 1e-6);
      perBeat.set(index, (perBeat.get(index) ?? 0) + 1);
    }
    assert.ok(perBeat.size >= 30, 'the loop keeps playing');
    assert.ok(Math.max(...perBeat.values()) <= 6, `at most 6 voices per beat, saw ${Math.max(...perBeat.values())}`);
    assert.ok(starts.length > 0 && ctx.nodes.some(node => node.kind === 'noise'), 'hats use noise bursts');
    assert.deepEqual(ctx.errors, []);

    audio.dispose();
    assert.equal(timers.active.size, 0, 'dispose clears the scheduler');
    assert.equal(ctx.closed, true, 'dispose closes the context');
    const count = ctx.nodes.length;
    audio.setMusic('prep');
    timers.advance(ctx, 1);
    assert.equal(ctx.nodes.length, count, 'nothing is scheduled after dispose');
    assert.equal(timers.active.size, 0);
  } finally {
    timers.restore();
  }
});

test('music scheduling pauses while the page is hidden, while music is disabled and after fading to null', () => {
  const timers = fakeTimers();
  const listeners = new Map();
  globalThis.document = {
    hidden: false,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); },
  };
  try {
    const audio = createAudio({ AudioContextClass: FakeAudioContext });
    audio.unlock();
    const ctx = FakeAudioContext.last;
    audio.setMusic('prep');
    assert.equal(timers.active.size, 1);
    const visibility = hidden => { globalThis.document.hidden = hidden; listeners.get('visibilitychange')(); };
    visibility(true);
    assert.equal(timers.active.size, 0, 'hidden page: no scheduling');
    visibility(false);
    assert.equal(timers.active.size, 1, 'visible again: scheduling resumes');
    audio.setEnabled({ music: false });
    assert.equal(timers.active.size, 0, 'music disabled: no scheduling');
    audio.setEnabled({ music: true });
    assert.equal(timers.active.size, 1);
    audio.setMusic(null);
    timers.advance(ctx, 2);
    assert.equal(timers.active.size, 0, 'mood null: the loop fades out, then scheduling stops');
    audio.dispose();
    assert.equal(listeners.size, 0, 'dispose removes the visibility listener');
    assert.deepEqual(ctx.errors, []);
  } finally {
    delete globalThis.document;
    timers.restore();
  }
});
