// Tiệm Mì Cay: procedural sound effects and music, synthesised live with the Web Audio API.
//
// There are no audio files and no dependencies. Oscillators, gain envelopes, biquad filters and one
// shared noise buffer make every sound, and every melody and jingle here is an original composition
// written for this game. Where no AudioContext exists (Node, very old browsers) every method is a
// safe no-op.
//
//   const audio = createAudio();
//   addEventListener('pointerdown', () => audio.unlock(), { capture: true }); // first user gesture
//   audio.play('coin', { pitch: 2 });
//   audio.setMusic('service');
//
// Signal flow:  sfx voices  -> sfx bus   --\
//               music loops -> music bus --+--> master -> soft clipper (identity at normal levels) -> speakers

export const CUES = Object.freeze([
  'tap', 'bowl', 'broth', 'topping', 'chili', 'potStart', 'potReady', 'potBurn', 'serveGood', 'serveBad', 'coin',
  'tip', 'customerArrive', 'customerLeave', 'levelUp', 'goal', 'incident', 'success', 'fail', 'chime', 'pageTurn',
  // Kitchen and street details (src/fx.js effects, pets, the delivery ride): each lasts at most 0.6 s.
  'pop', 'splash', 'drip', 'plop', 'squeeze', 'sizzle', 'puff', 'whoosh', 'clink', 'slurp', 'heart', 'boing', 'swish',
  'hop', 'meow', 'woof', 'squeak', 'bell', 'honk', 'thud', 'fuel', 'flash', 'paper',
]);

const CUE_SET = new Set(CUES);
const MAX_PEAK = 0.25;      // loudest any single voice envelope may reach
const SILENT = 0.0001;      // envelopes start and end here; exponential ramps cannot reach 0
const MASTER_LEVEL = 1;
const DEFAULT_VOLUMES = { sfx: 0.9, music: 0.5 };
const CLIP_KNEE = 0.8;      // the output soft clipper is an exact identity below this level
const FADE = 1.2;           // music crossfade in seconds (linear ramps)
const VOLUME_TAU = 0.04;    // volume changes glide with setTargetAtTime, which continues from the live value
const RETIRE_AFTER = 0.05;  // a loop faded to 0 is disconnected just after its ramp ends
const TICK_MS = 25;         // lookahead scheduler period
const LOOKAHEAD = 0.12;     // seconds of music scheduled ahead of the audio clock
const MAX_SFX_VOICES = 40;  // concurrent one-shot voices before new cues are dropped
const RETRIGGER = 0.03;     // the same cue cannot restart within 30 ms
const NOISE_SECONDS = 2;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const midi = note => 440 * 2 ** ((note - 69) / 12);
const melody = rows => new Map(rows.map(([step, note, length]) => [step, { note, length }]));

// ---------------------------------------------------------------------------------------------
// Music. Both loops are 8 bars of eighth-note steps (64 steps) and were composed for this game.
// A full arrangement starts at most six voices per beat. During a crossfade the incoming loop
// plays only its bed ('intro') and the outgoing loop only its melody ('outro'), so the two
// together stay within the same budget.

// 'prep' (84 BPM, G major pentatonic): triangle pad chords, a round bass, music-box plucks and a
// light plucked melody. Chords are [bass note, pad notes] as MIDI numbers.
const PREP_CHORDS = [
  [43, [59, 62, 66]], // Gmaj7
  [40, [59, 62, 67]], // Em7
  [48, [59, 64, 67]], // Cmaj7
  [50, [57, 62, 64]], // Dsus2
  [47, [57, 62, 66]], // Bm7
  [40, [55, 59, 62]], // Em7
  [45, [55, 60, 64]], // Am7
  [50, [55, 60, 62]], // D7sus4
];
// [step, MIDI note, length in steps]
const PREP_MELODY = melody([
  [0, 71, 2], [2, 74, 2], [4, 76, 3], [7, 74, 1],
  [8, 71, 3], [12, 67, 2], [14, 69, 2],
  [16, 76, 2], [18, 74, 1], [19, 71, 1], [20, 74, 4],
  [24, 69, 5], [30, 67, 1], [31, 69, 1],
  [32, 74, 3], [35, 76, 1], [36, 74, 2], [38, 71, 2],
  [40, 67, 3], [44, 71, 2], [46, 69, 2],
  [48, 76, 3], [52, 74, 2], [54, 71, 2],
  [56, 69, 6],
]);

function prepStep(v, step, t, stepDur, pass, layer) {
  const bar = step >> 3, pos = step & 7, [root, pad] = PREP_CHORDS[bar], full = layer === 'full';
  if (layer !== 'outro') {
    if (pos === 0) {
      for (const note of pad) v.tone({ t, f: midi(note), type: 'triangle', peak: 0.04, a: 0.45, hold: stepDur * 8 - 0.45, d: 1.2 });
      v.tone({ t, f: midi(root), type: 'triangle', peak: 0.12, a: 0.012, d: 1.6 });
    } else if (pos === 4) {
      v.tone({ t, f: midi(root + 7), type: 'triangle', peak: 0.08, a: 0.012, d: 1.1 });
    } else if (full && (pos === 3 || pos === 6)) {
      v.tone({ t, f: midi(pad[pos === 3 ? 1 : 2] + 12), peak: 0.028, a: 0.004, d: 0.5 });
    }
  }
  // Every second pass the melody rests in bars 5-6 so the loop can breathe.
  const line = layer === 'intro' || (pass % 2 === 1 && (bar === 4 || bar === 5)) ? null : PREP_MELODY.get(step);
  if (line) {
    const f = midi(line.note);
    v.tone({ t, f, type: 'triangle', peak: 0.075, a: 0.012, hold: line.length * stepDur * 0.5, d: line.length * stepDur + 0.4 });
    if (full) v.tone({ t, f: f * 4, peak: 0.014, a: 0.002, d: 0.09 });
  }
}

// 'service' (108 BPM, C major pentatonic): soft sine-sweep kick, noise hats on the off-beats,
// short chord chops, a plucky filtered bass and a reedy lead.
const SERVICE_CHORDS = [
  [41, [57, 64]], // Fmaj7
  [43, [59, 62]], // G
  [40, [55, 62]], // Em7
  [45, [60, 67]], // Am7
  [41, [57, 64]], // Fmaj7
  [43, [59, 65]], // G7
  [48, [60, 64]], // C
  [43, [59, 62]], // G
];
const SERVICE_BASS = [0, null, null, 0, 7, null, 12, null]; // semitones above the root per eighth
const SERVICE_MELODY = melody([
  [0, 81, 2], [2, 79, 1], [3, 76, 1], [4, 79, 2], [6, 72, 1], [7, 74, 1],
  [8, 79, 3], [11, 76, 1], [12, 74, 2], [14, 76, 1], [15, 79, 1],
  [16, 76, 2], [18, 79, 2], [20, 81, 1], [21, 79, 1], [22, 76, 2],
  [24, 81, 3], [27, 79, 1], [28, 76, 2], [30, 72, 1], [31, 74, 1],
  [32, 81, 2], [34, 79, 1], [35, 76, 1], [36, 79, 2], [38, 72, 1], [39, 74, 1],
  [40, 79, 2], [42, 81, 1], [43, 79, 1], [44, 74, 4],
  [48, 76, 2], [50, 74, 1], [51, 72, 1], [52, 76, 2], [54, 79, 2],
  [56, 74, 4], [62, 76, 1], [63, 79, 1],
]);

function serviceStep(v, step, t, stepDur, pass, layer) {
  const bar = step >> 3, pos = step & 7, [root, chop] = SERVICE_CHORDS[bar];
  if (layer !== 'outro') {
    if (pos === 0 || pos === 4) v.tone({ t, f: 150, to: 48, glide: 0.12, peak: 0.2, a: 0.003, d: 0.22 });
    if (pos & 1) {
      const accent = (pos === 3 || pos === 7 ? 0.028 : 0.04) * (0.85 + Math.random() * 0.3);
      v.noise({ t, type: 'highpass', f: 7200, q: 0.8, peak: accent, a: 0.002, d: 0.045 });
    }
    if (layer === 'full' && (pos === 2 || pos === 6)) {
      for (const note of chop) v.tone({ t, f: midi(note), type: 'triangle', peak: 0.05, a: 0.004, d: 0.16 });
    }
    const bass = SERVICE_BASS[pos];
    if (bass !== null) {
      v.tone({ t, f: midi(root + bass), type: 'sawtooth', peak: 0.085, a: 0.004, d: pos === 0 ? 0.32 : 0.2, lp: { f: 1300, to: 240, glide: 0.16, q: 2 } });
    }
  }
  // Every second pass the lead sits out bars 3-4 and the groove carries on alone.
  const line = layer === 'intro' || (pass % 2 === 1 && (bar === 2 || bar === 3)) ? null : SERVICE_MELODY.get(step);
  if (line) v.tone({ t, f: midi(line.note), type: 'square', peak: 0.045, a: 0.008, hold: line.length * stepDur * 0.55, d: 0.14, lp: 2200 });
}

const SONGS = { // level: loop gain once faded in, so both moods sit at a similar loudness
  prep: { bpm: 84, swing: 0.1, steps: 64, level: 1, play: prepStep },
  service: { bpm: 108, swing: 0.06, steps: 64, level: 1.25, play: serviceStep },
};

// ---------------------------------------------------------------------------------------------
// One-shot cues: (voice kit, start time, pitch ratio). Frequencies are in Hz.

function bell(v, t, f, peak, d, ratio = 2.76) {
  v.tone({ t, f, peak, a: 0.002, d });
  v.tone({ t, f: f * ratio, peak: peak * 0.3, a: 0.002, d: d * 0.4 });
}

const SYNTHS = {
  // Soft wooden tick for buttons.
  tap(v, t, k) {
    v.tone({ t, f: 1250 * k, to: 820 * k, glide: 0.03, peak: 0.14, a: 0.002, d: 0.06 });
  },
  // Ceramic clink: inharmonic partials, a contact tick and a tiny bounce.
  bowl(v, t, k) {
    const f = 1870 * k;
    v.noise({ t, type: 'highpass', f: 4200 * k, q: 0.7, peak: 0.05, a: 0.001, d: 0.025 });
    v.tone({ t, f, peak: 0.1, a: 0.002, d: 0.38 });
    v.tone({ t, f: f * 2.71, peak: 0.045, a: 0.002, d: 0.16 });
    v.tone({ t, f: f * 4.97, peak: 0.02, a: 0.002, d: 0.07 });
    v.tone({ t: t + 0.075, f: f * 1.013, peak: 0.04, a: 0.002, d: 0.2 });
  },
  // Liquid pour: a band of noise that swells and rises as the bowl fills, plus a few bubbles.
  broth(v, t, k) {
    v.noise({ t, type: 'bandpass', f: 480 * k, to: 1150 * k, glide: 1, q: 1.1, peak: 0.18, a: 0.3, hold: 0.4, d: 0.4 });
    v.noise({ t, type: 'lowpass', f: 420 * k, q: 0.8, peak: 0.08, a: 0.25, hold: 0.45, d: 0.35 });
    for (const [dt, f] of [[0.28, 420], [0.55, 520], [0.83, 610]]) {
      v.tone({ t: t + dt + Math.random() * 0.05, f: f * k, to: f * 1.7 * k, glide: 0.04, peak: 0.035, a: 0.003, d: 0.05 });
    }
  },
  // Soft plop of a topping landing in the bowl.
  topping(v, t, k) {
    v.tone({ t, f: 420 * k, to: 180 * k, glide: 0.08, type: 'triangle', peak: 0.17, a: 0.003, d: 0.13 });
    v.noise({ t, type: 'lowpass', f: 750 * k, q: 0.6, peak: 0.05, a: 0.002, d: 0.05 });
    v.tone({ t: t + 0.035, f: 560 * k, to: 840 * k, glide: 0.05, peak: 0.035, a: 0.003, d: 0.06 });
  },
  // Squeeze-bottle squirt: a falling hiss, a small squeak and the sauce landing.
  chili(v, t, k) {
    v.noise({ t, type: 'bandpass', f: 2700 * k, to: 1300 * k, glide: 0.17, q: 2.5, peak: 0.16, a: 0.012, hold: 0.06, d: 0.1 });
    v.tone({ t: t + 0.015, f: 620 * k, to: 960 * k, glide: 0.1, type: 'triangle', peak: 0.03, a: 0.01, d: 0.09 });
    v.tone({ t: t + 0.16, f: 430 * k, to: 220 * k, glide: 0.06, peak: 0.07, a: 0.003, d: 0.08 });
  },
  // Burner whoomp, then bubbles that quicken as the pot heats up.
  potStart(v, t, k) {
    v.noise({ t, type: 'lowpass', f: 240 * k, to: 520 * k, glide: 0.5, q: 0.9, peak: 0.12, a: 0.16, hold: 0.18, d: 0.3 });
    [0.08, 0.19, 0.28, 0.36, 0.43, 0.49].forEach((dt, i) => {
      const f = (330 + 60 * i + Math.random() * 80) * k;
      v.tone({ t: t + dt, f, to: f * 1.7, glide: 0.035, peak: 0.08, a: 0.003, d: 0.05 });
    });
  },
  // Gentle two-note ding: the noodles are ready.
  potReady(v, t, k) {
    bell(v, t, 1046.5 * k, 0.12, 0.6, 2.01);
    bell(v, t + 0.17, 1318.51 * k, 0.11, 0.9, 2.01);
  },
  // Burnt pot: a low thud and a dark, crackling sizzle.
  potBurn(v, t, k) {
    v.tone({ t, f: 125 * k, to: 46 * k, glide: 0.18, peak: 0.2, a: 0.004, d: 0.26 });
    v.noise({ t, type: 'lowpass', f: 420 * k, q: 0.7, peak: 0.08, a: 0.003, d: 0.1 });
    v.noise({ t: t + 0.04, type: 'bandpass', f: 2000 * k, q: 0.6, peak: 0.075, a: 0.05, hold: 0.4, d: 0.35, flutter: 10 });
  },
  // Bright three-note rise with an octave shimmer.
  serveGood(v, t, k) {
    [587.33, 783.99, 987.77].forEach((f, i) => {
      const at = t + i * 0.075, last = i === 2;
      v.tone({ t: at, f: f * k, type: 'triangle', peak: 0.11, a: 0.004, d: last ? 0.45 : 0.2 });
      v.tone({ t: at, f: f * 2 * k, peak: 0.035, a: 0.003, d: last ? 0.3 : 0.12 });
    });
  },
  // Low two-note fall that sags a little.
  serveBad(v, t, k) {
    v.tone({ t, f: 220 * k, type: 'sawtooth', peak: 0.12, a: 0.008, d: 0.2, lp: 1000 * k });
    v.tone({ t: t + 0.17, f: 164.81 * k, to: 157 * k, glide: 0.3, type: 'sawtooth', peak: 0.12, a: 0.008, d: 0.36, lp: 900 * k });
  },
  // Cash-register ting: a drawer click, then a small bell struck twice.
  coin(v, t, k) {
    v.noise({ t, type: 'bandpass', f: 3400 * k, q: 1.8, peak: 0.05, a: 0.001, d: 0.03 });
    bell(v, t + 0.03, 2349.32 * k, 0.1, 0.5);
    v.tone({ t: t + 0.1, f: 2349.32 * k, peak: 0.045, a: 0.002, d: 0.4 });
  },
  // Sparkly tip: a quick high pentatonic run over a breath of air.
  tip(v, t, k) {
    [1318.51, 1567.98, 1760, 2093, 2637.02].forEach((f, i) => v.tone({ t: t + i * 0.045, f: f * k, peak: 0.07, a: 0.003, d: 0.22 + i * 0.04 }));
    v.noise({ t, type: 'highpass', f: 6500 * k, q: 0.7, peak: 0.03, a: 0.06, d: 0.3 });
  },
  // Small shop-door bell swinging three times.
  customerArrive(v, t, k) {
    for (const [dt, f, peak] of [[0, 1760, 0.09], [0.1, 1975.53, 0.07], [0.21, 1760, 0.045]]) bell(v, t + dt, f * k, peak, 0.4);
  },
  // Soft descending goodbye.
  customerLeave(v, t, k) {
    for (const [dt, f, peak, d] of [[0, 880, 0.1, 0.2], [0.12, 783.99, 0.09, 0.2], [0.24, 587.33, 0.08, 0.45]]) {
      v.tone({ t: t + dt, f: f * k, peak, a: 0.01, d });
    }
  },
  // Original six-note fanfare that blooms into a C major chord.
  levelUp(v, t, k) {
    for (const [dt, f, d] of [[0, 523.25, 0.12], [0.09, 783.99, 0.12], [0.18, 659.25, 0.12], [0.27, 880, 0.14], [0.4, 783.99, 0.1], [0.52, 1046.5, 0.8]]) {
      v.tone({ t: t + dt, f: f * k, type: 'triangle', peak: 0.12, a: 0.005, d });
    }
    v.tone({ t: t + 0.52, f: 659.25 * k, peak: 0.05, a: 0.02, d: 0.8 });
    v.tone({ t: t + 0.52, f: 783.99 * k, peak: 0.045, a: 0.02, d: 0.8 });
    v.noise({ t: t + 0.5, type: 'highpass', f: 7000 * k, q: 0.7, peak: 0.025, a: 0.05, d: 0.5 });
  },
  // Glassy two-note chime for a finished goal.
  goal(v, t, k) {
    bell(v, t, 783.99 * k, 0.1, 0.9, 3.01);
    bell(v, t + 0.14, 1174.66 * k, 0.1, 1.1, 3.01);
  },
  // Curious "hmm?": a raised-fourth motif that ends on a note leaning upwards.
  incident(v, t, k) {
    for (const [dt, f] of [[0, 523.25], [0.11, 739.99], [0.22, 659.25]]) v.tone({ t: t + dt, f: f * k, type: 'triangle', peak: 0.1, a: 0.005, d: 0.14 });
    v.tone({ t: t + 0.4, f: 932.33 * k, to: 987.77 * k, glide: 0.18, type: 'triangle', peak: 0.1, a: 0.01, hold: 0.12, d: 0.35 });
    v.tone({ t: t + 0.4, f: 1864.66 * k, to: 1975.53 * k, glide: 0.18, peak: 0.025, a: 0.01, d: 0.3 });
  },
  // Warm strummed major chord.
  success(v, t, k) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => v.tone({ t: t + i * 0.035, f: f * k, type: 'triangle', peak: 0.075, a: 0.004, d: 0.55 + i * 0.1 }));
    v.tone({ t: t + 0.16, f: 2093 * k, peak: 0.03, a: 0.004, d: 0.4 });
  },
  // Gentle "aww": three falling notes, the last one sagging.
  fail(v, t, k) {
    v.tone({ t, f: 329.63 * k, type: 'triangle', peak: 0.11, a: 0.01, d: 0.16, lp: 1300 * k });
    v.tone({ t: t + 0.16, f: 261.63 * k, type: 'triangle', peak: 0.11, a: 0.01, d: 0.16, lp: 1300 * k });
    v.tone({ t: t + 0.34, f: 220 * k, to: 207.65 * k, glide: 0.5, type: 'triangle', peak: 0.12, a: 0.012, hold: 0.08, d: 0.5, lp: 1000 * k });
  },
  // Wind chimes: pentatonic tubes struck in a random order.
  chime(v, t, k) {
    const tubes = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];
    for (let i = tubes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tubes[i], tubes[j]] = [tubes[j], tubes[i]];
    }
    let at = t;
    tubes.forEach((f, i) => {
      bell(v, at, f * k, 0.05 - i * 0.004, 1.5);
      at += 0.09 + Math.random() * 0.12;
    });
  },
  // Paper swish, then a light flap as the page settles.
  pageTurn(v, t, k) {
    v.noise({ t, type: 'bandpass', f: 1300 * k, to: 4200 * k, glide: 0.18, q: 0.9, peak: 0.15, a: 0.07, hold: 0.03, d: 0.12 });
    v.noise({ t: t + 0.18, type: 'highpass', f: 2600 * k, q: 0.7, peak: 0.05, a: 0.004, d: 0.05 });
  },

  // ---- Kitchen and street details. Short (at most 0.6 s) and quiet, so several can overlap during a busy service.
  // Bright bubble pop: the noodles reached the ideal zone.
  pop(v, t, k) {
    v.tone({ t, f: 520 * k, to: 1560 * k, glide: 0.035, peak: 0.13, a: 0.002, d: 0.07 });
    v.tone({ t: t + 0.012, f: 2350 * k, peak: 0.035, a: 0.001, d: 0.035 });
    v.noise({ t, type: 'highpass', f: 3800 * k, q: 0.8, peak: 0.03, a: 0.001, d: 0.02 });
  },
  // Noodles land in the broth: a falling wash of water, a soft plunk and a few droplets.
  splash(v, t, k) {
    v.noise({ t, type: 'bandpass', f: 1900 * k, to: 520 * k, glide: 0.22, q: 0.9, peak: 0.14, a: 0.006, d: 0.26 });
    v.tone({ t, f: 300 * k, to: 140 * k, glide: 0.09, type: 'triangle', peak: 0.1, a: 0.003, d: 0.12 });
    for (const [dt, f] of [[0.06, 760], [0.11, 980], [0.17, 640], [0.24, 1150]]) v.tone({ t: t + dt, f: f * k, to: f * 1.8 * k, glide: 0.03, peak: 0.035, a: 0.002, d: 0.045 });
  },
  // Three droplets, each a tiny rising blip.
  drip(v, t, k) {
    for (const [dt, f, peak] of [[0, 980, 0.08], [0.09, 1240, 0.06], [0.2, 860, 0.045]]) v.tone({ t: t + dt, f: f * k, to: f * 1.9 * k, glide: 0.025, peak, a: 0.002, d: 0.05 });
  },
  // A topping lands in the bowl: a round falling plop with a little bubble after it.
  plop(v, t, k) {
    v.tone({ t, f: 360 * k, to: 150 * k, glide: 0.07, peak: 0.15, a: 0.003, d: 0.11 });
    v.noise({ t, type: 'lowpass', f: 600 * k, q: 0.7, peak: 0.04, a: 0.002, d: 0.04 });
    v.tone({ t: t + 0.05, f: 680 * k, to: 1020 * k, glide: 0.04, peak: 0.03, a: 0.003, d: 0.05 });
  },
  // Wet squelch of the chili bottle: a narrow, fluttering noise band and a squeak of air.
  squeeze(v, t, k) {
    v.noise({ t, type: 'bandpass', f: 1100 * k, to: 620 * k, glide: 0.16, q: 2.2, peak: 0.18, a: 0.02, hold: 0.05, d: 0.09, flutter: 4 });
    v.tone({ t: t + 0.01, f: 300 * k, to: 520 * k, glide: 0.08, type: 'triangle', peak: 0.04, a: 0.01, d: 0.1 });
    v.tone({ t: t + 0.15, f: 380 * k, to: 190 * k, glide: 0.05, peak: 0.08, a: 0.003, d: 0.07 });
  },
  // Crackling sizzle for the hottest chili and for fire.
  sizzle(v, t, k) {
    v.noise({ t, type: 'highpass', f: 3600 * k, q: 0.7, peak: 0.08, a: 0.03, hold: 0.24, d: 0.24, flutter: 14 });
    v.noise({ t, type: 'bandpass', f: 1400 * k, q: 0.9, peak: 0.04, a: 0.04, hold: 0.18, d: 0.22, flutter: 6 });
    v.tone({ t, f: 180 * k, to: 120 * k, glide: 0.3, type: 'triangle', peak: 0.04, a: 0.05, d: 0.3 });
  },
  // Steam puffs from a pot that starts boiling.
  puff(v, t, k) {
    v.noise({ t, type: 'bandpass', f: 1300 * k, to: 480 * k, glide: 0.2, q: 0.6, peak: 0.19, a: 0.035, d: 0.22 });
    v.noise({ t, type: 'lowpass', f: 420 * k, q: 0.7, peak: 0.1, a: 0.02, d: 0.16 });
  },
  // A bowl flies to the guest: a rising band of air.
  whoosh(v, t, k) {
    v.noise({ t, type: 'bandpass', f: 420 * k, to: 2400 * k, glide: 0.22, q: 1.1, peak: 0.19, a: 0.12, d: 0.2 });
    v.noise({ t: t + 0.04, type: 'highpass', f: 2800 * k, q: 0.7, peak: 0.04, a: 0.08, d: 0.14 });
  },
  // Two quick chopstick ticks on the bowl's rim.
  clink(v, t, k) {
    for (const [dt, f, peak] of [[0, 2650, 0.08], [0.075, 2980, 0.065]]) {
      v.tone({ t: t + dt, f: f * k, peak, a: 0.001, d: 0.09 });
      v.tone({ t: t + dt, f: f * 2.73 * k, peak: peak * 0.35, a: 0.001, d: 0.04 });
      v.noise({ t: t + dt, type: 'highpass', f: 5200 * k, q: 0.8, peak: 0.025, a: 0.001, d: 0.012 });
    }
  },
  // A short happy noodle slurp: a resonant noise sweep upwards, then a quicker second one.
  slurp(v, t, k) {
    v.noise({ t, type: 'bandpass', f: 520 * k, to: 2300 * k, glide: 0.24, q: 2, peak: 0.2, a: 0.04, hold: 0.12, d: 0.08, flutter: 3 });
    v.noise({ t: t + 0.3, type: 'bandpass', f: 800 * k, to: 2900 * k, glide: 0.12, q: 2, peak: 0.15, a: 0.025, hold: 0.04, d: 0.07 });
  },
  // Soft sparkle chime for hearts.
  heart(v, t, k) {
    bell(v, t, 1567.98 * k, 0.07, 0.36, 3.01);
    bell(v, t + 0.07, 2093 * k, 0.06, 0.42, 3.01);
    v.noise({ t, type: 'highpass', f: 7000 * k, q: 0.7, peak: 0.02, a: 0.04, d: 0.18 });
  },
  // A springy boing for a combo going up.
  boing(v, t, k) {
    v.tone({ t, f: 240 * k, to: 560 * k, glide: 0.08, type: 'triangle', peak: 0.12, a: 0.004, d: 0.2 });
    v.tone({ t: t + 0.08, f: 560 * k, to: 420 * k, glide: 0.12, peak: 0.06, a: 0.004, d: 0.2 });
    v.tone({ t: t + 0.17, f: 470 * k, to: 520 * k, glide: 0.08, peak: 0.03, a: 0.004, d: 0.14 });
  },
  // The mop wiping the floor: there and back.
  swish(v, t, k) {
    v.noise({ t, type: 'bandpass', f: 650 * k, to: 1900 * k, glide: 0.14, q: 0.8, peak: 0.18, a: 0.05, d: 0.11 });
    v.noise({ t: t + 0.17, type: 'bandpass', f: 1900 * k, to: 760 * k, glide: 0.14, q: 0.8, peak: 0.13, a: 0.05, d: 0.12 });
  },
  // A pet hops: a short rising blip.
  hop(v, t, k) {
    v.tone({ t, f: 480 * k, to: 1150 * k, glide: 0.07, peak: 0.1, a: 0.003, d: 0.09 });
    v.tone({ t: t + 0.06, f: 1150 * k, to: 1300 * k, glide: 0.03, type: 'triangle', peak: 0.03, a: 0.002, d: 0.05 });
  },
  // A tiny cat chirp: a filtered reedy rise and fall ("mrr-ew").
  meow(v, t, k) {
    v.tone({ t, f: 620 * k, to: 1040 * k, glide: 0.11, type: 'sawtooth', peak: 0.055, a: 0.02, hold: 0.05, d: 0.1, lp: { f: 2200 * k, to: 1500 * k, glide: 0.2, q: 3 } });
    v.tone({ t: t + 0.15, f: 1040 * k, to: 680 * k, glide: 0.16, type: 'sawtooth', peak: 0.045, a: 0.01, hold: 0.03, d: 0.14, lp: { f: 1800 * k, to: 1100 * k, glide: 0.18, q: 2.5 } });
  },
  // A tiny puppy yip.
  woof(v, t, k) {
    v.tone({ t, f: 480 * k, to: 900 * k, glide: 0.035, type: 'sawtooth', peak: 0.08, a: 0.005, d: 0.08, lp: { f: 1900 * k, to: 900 * k, glide: 0.08, q: 2 } });
    v.tone({ t: t + 0.04, f: 900 * k, to: 560 * k, glide: 0.06, type: 'square', peak: 0.04, a: 0.004, d: 0.07, lp: 1400 * k });
    v.noise({ t, type: 'bandpass', f: 1100 * k, q: 1.4, peak: 0.03, a: 0.003, d: 0.05 });
  },
  // A hamster's (or the alley rat's) squeak, up then down.
  squeak(v, t, k) {
    v.tone({ t, f: 1900 * k, to: 2700 * k, glide: 0.05, type: 'square', peak: 0.06, a: 0.004, d: 0.06, lp: 4200 * k });
    v.tone({ t: t + 0.08, f: 2600 * k, to: 2050 * k, glide: 0.06, type: 'square', peak: 0.05, a: 0.004, d: 0.06, lp: 4000 * k });
  },
  // Bicycle bell, ding-ding (struck with the bell() helper above).
  bell(v, t, k) {
    for (const dt of [0, 0.16]) {
      bell(v, t + dt, 2380 * k, 0.085, 0.32, 2.37);
      v.tone({ t: t + dt, f: 3150 * k, peak: 0.025, a: 0.002, d: 0.18 });
    }
  },
  // A soft scooter horn, beep-beep, two reedy notes a third apart.
  honk(v, t, k) {
    for (const dt of [0, 0.17]) for (const f of [415.3, 523.25]) v.tone({ t: t + dt, f: f * k, type: 'square', peak: 0.04, a: 0.01, hold: 0.07, d: 0.05, lp: 1500 * k });
  },
  // A bump on the delivery ride: a low thud.
  thud(v, t, k) {
    v.tone({ t, f: 150 * k, to: 52 * k, glide: 0.12, peak: 0.2, a: 0.003, d: 0.18 });
    v.noise({ t, type: 'lowpass', f: 320 * k, q: 0.8, peak: 0.09, a: 0.002, d: 0.08 });
    v.noise({ t: t + 0.01, type: 'bandpass', f: 900 * k, q: 1, peak: 0.03, a: 0.002, d: 0.05 });
  },
  // Fuel picked up: a quick rising arpeggio over a sliding hum.
  fuel(v, t, k) {
    [659.25, 880, 1318.51].forEach((f, i) => v.tone({ t: t + i * 0.055, f: f * k, type: 'triangle', peak: 0.08, a: 0.003, d: i === 2 ? 0.22 : 0.09 }));
    v.tone({ t, f: 330 * k, to: 660 * k, glide: 0.16, peak: 0.04, a: 0.01, d: 0.16 });
  },
  // Camera shutter: two clicks.
  flash(v, t, k) {
    v.noise({ t, type: 'highpass', f: 2600 * k, q: 0.8, peak: 0.12, a: 0.001, d: 0.022 });
    v.tone({ t, f: 1300 * k, to: 700 * k, glide: 0.02, type: 'square', peak: 0.03, a: 0.001, d: 0.025, lp: 3000 * k });
    v.noise({ t: t + 0.065, type: 'highpass', f: 2200 * k, q: 0.8, peak: 0.09, a: 0.001, d: 0.03 });
  },
  // A page flipped: a papery swish and a tap.
  paper(v, t, k) {
    v.noise({ t, type: 'bandpass', f: 2400 * k, to: 1100 * k, glide: 0.12, q: 0.7, peak: 0.17, a: 0.03, d: 0.09 });
    v.noise({ t: t + 0.12, type: 'highpass', f: 3200 * k, q: 0.7, peak: 0.06, a: 0.003, d: 0.04 });
  },
};

// ---------------------------------------------------------------------------------------------
// Voices

// Click-free envelope: silent -> linear attack -> optional hold -> exponential release to silence.
function envelope(param, t, peak, a, hold, d, flutter = 0) {
  const top = clamp(peak, 0.001, MAX_PEAK), attack = Math.max(a, 0.002), sustain = Math.max(hold, 0);
  const release = Math.max(d, 0.01), held = t + attack + sustain;
  param.setValueAtTime(SILENT, t);
  param.linearRampToValueAtTime(top, t + attack);
  for (let i = 1; i <= flutter; i++) param.setValueAtTime(top * (0.35 + 0.65 * Math.random()), t + attack + (sustain * i) / (flutter + 1));
  if (sustain > 0) param.setValueAtTime(top, held);
  param.exponentialRampToValueAtTime(SILENT, held + release);
  return held + release;
}

// Builds short self-stopping voices that feed `out`; `onVoice` hears each voice's end time.
function voiceKit(ctx, out, noise, onVoice) {
  const nyquist = (Number(ctx.sampleRate) || 44100) / 2;
  const hz = f => clamp(f, 20, nyquist * 0.9);
  const finish = (source, nodes, end) => {
    source.onended = () => {
      for (const node of nodes) {
        try { node.disconnect(); } catch { /* already disconnected */ }
      }
    };
    source.stop(end + 0.02);
    onVoice?.(end + 0.02);
    return end;
  };
  return {
    tone({ t, f, type = 'sine', peak = 0.1, a = 0.005, hold = 0, d = 0.2, to = 0, glide = 0.05, lp = null }) {
      const osc = ctx.createOscillator(), gain = ctx.createGain(), nodes = [osc, gain];
      gain.gain.value = 0; // silent until the envelope's first event, even between sample frames
      osc.type = type;
      osc.frequency.setValueAtTime(hz(f), t);
      if (to) osc.frequency.exponentialRampToValueAtTime(hz(to), t + glide);
      let head = osc;
      if (lp) {
        const spec = typeof lp === 'number' ? { f: lp } : lp, filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(hz(spec.f), t);
        if (spec.to) filter.frequency.exponentialRampToValueAtTime(hz(spec.to), t + (spec.glide || 0.1));
        filter.Q.setValueAtTime(spec.q ?? 0.7, t);
        head.connect(filter);
        head = filter;
        nodes.push(filter);
      }
      head.connect(gain);
      gain.connect(out);
      const end = envelope(gain.gain, t, peak, a, hold, d);
      osc.start(t);
      return finish(osc, nodes, end);
    },
    noise({ t, type = 'bandpass', f = 1000, q = 1, to = 0, glide = 0.1, peak = 0.08, a = 0.005, hold = 0, d = 0.1, flutter = 0 }) {
      const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      gain.gain.value = 0; // a buffer can emit a sample a frame before the envelope starts: keep it muted
      source.buffer = noise;
      filter.type = type;
      filter.frequency.setValueAtTime(hz(f), t);
      if (to) filter.frequency.exponentialRampToValueAtTime(hz(to), t + glide);
      filter.Q.setValueAtTime(q, t);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      const end = envelope(gain.gain, t, peak, a, hold, d, flutter);
      const length = Number(noise?.duration) || NOISE_SECONDS, span = end + 0.02 - t;
      if (span >= length) source.loop = true;
      source.start(t, span < length ? Math.random() * (length - span) : 0); // random offset: no two bursts alike
      return finish(source, [source, filter, gain], end);
    },
  };
}

// Output safety net against pile-ups: a memoryless soft clipper that is an exact identity below
// CLIP_KNEE and bends smoothly towards 1.0 above it. Unlike a compressor it has no attack/release
// state, so normal-level sound passes untouched. The shaper is fed at half level so its curve can
// cover inputs up to 2.0 before the WaveShaper's hard clamp. Skipped when the context lacks one.
function softClip(ctx, input) {
  if (typeof ctx.createWaveShaper !== 'function') return input;
  const pre = ctx.createGain(), shaper = ctx.createWaveShaper(), size = 2049, curve = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 4 - 2, level = Math.abs(x);
    const shaped = level <= CLIP_KNEE ? level : CLIP_KNEE + (1 - CLIP_KNEE) * Math.tanh((level - CLIP_KNEE) / (1 - CLIP_KNEE));
    curve[i] = Math.sign(x) * shaped;
  }
  pre.gain.value = 0.5;
  shaper.curve = curve;
  input.connect(pre);
  pre.connect(shaper);
  return shaper;
}

// The one noise buffer every hat, pour, sizzle and swish reads from.
function makeNoise(ctx) {
  const rate = Number(ctx.sampleRate) || 44100, length = Math.floor(rate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, length, rate), data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// Loop levels are tracked here rather than read back from AudioParam.value (unreliable across
// browsers), and every fade restarts from an explicit setValueAtTime. cancelAndHoldAtTime is avoided
// on purpose: Chromium mis-holds after a finished ramp and the next ramp jumps.
function levelAt({ from, to, t0, t1 }, t) {
  return t >= t1 ? to : t <= t0 ? from : from + ((to - from) * (t - t0)) / (t1 - t0);
}
function fadeLoop(loop, to, now) {
  const from = levelAt(loop.level, now), gain = loop.out.gain;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(from, now);
  gain.linearRampToValueAtTime(to, now + FADE);
  loop.level = { from, to, t0: now, t1: now + FADE };
}

function advance(loop, steps) {
  const total = loop.step + steps;
  loop.nextTime += steps * loop.stepDur;
  loop.pass += Math.floor(total / loop.song.steps);
  loop.step = total % loop.song.steps;
}

// ---------------------------------------------------------------------------------------------

/**
 * Create the game's audio engine. Nothing is created until unlock() runs inside a user gesture.
 * @returns {{ unlock(): boolean, play(cue: string, options?: { pitch?: number }): boolean,
 *   setMusic(mood: 'prep'|'service'|null): void, setVolumes(levels: { sfx?: number, music?: number }): void,
 *   setEnabled(flags: { sfx?: boolean, music?: boolean }): void, dispose(): void }}
 */
export function createAudio({ AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext } = {}) {
  const supported = typeof AudioContextClass === 'function';
  const doc = supported && typeof globalThis.document?.addEventListener === 'function' ? globalThis.document : null;
  const volumes = { ...DEFAULT_VOLUMES }, enabled = { sfx: true, music: true }, lastPlayed = new Map();
  let ctx = null, sfxBus = null, musicBus = null, noise = null, sfx = null;
  let mood = null, loops = [], timer = null, voiceEnds = [], hidden = Boolean(doc?.hidden), disposed = false;

  function onVisibility() {
    if (Boolean(doc.hidden) === hidden) return;
    hidden = Boolean(doc.hidden);
    try { if (hidden) syncTimer(); else resumeMusic(); } catch { /* audio must never break the game */ }
  }
  doc?.addEventListener('visibilitychange', onVisibility);

  function build() {
    try {
      ctx = new AudioContextClass();
      const master = ctx.createGain();
      sfxBus = ctx.createGain();
      musicBus = ctx.createGain();
      master.gain.value = MASTER_LEVEL;
      sfxBus.gain.value = enabled.sfx ? volumes.sfx : 0;
      musicBus.gain.value = enabled.music ? volumes.music : 0;
      sfxBus.connect(master);
      musicBus.connect(master);
      // No compressor on purpose: Chromium's starts out clamped and squashes the first sounds after
      // unlock. Voice peaks (<= 0.25) and bus levels leave the headroom; softClip only catches pile-ups.
      softClip(ctx, master).connect(ctx.destination);
      noise = makeNoise(ctx);
      sfx = voiceKit(ctx, sfxBus, noise, end => voiceEnds.push(end));
      return true;
    } catch {
      try { Promise.resolve(ctx?.close?.()).catch(() => {}); } catch { /* ignore */ }
      ctx = sfx = null;
      return false;
    }
  }

  function applyBuses() {
    const now = ctx.currentTime;
    sfxBus.gain.setTargetAtTime(enabled.sfx ? volumes.sfx : 0, now, VOLUME_TAU);
    musicBus.gain.setTargetAtTime(enabled.music ? volumes.music : 0, now, VOLUME_TAU);
  }

  // --- music scheduling ---
  function syncTimer() {
    const run = Boolean(ctx) && !disposed && enabled.music && !hidden && loops.length > 0;
    if (run && timer === null) {
      timer = setInterval(tick, TICK_MS);
      timer?.unref?.(); // never keep a Node process alive
      tick();
    } else if (!run && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  function tick() {
    if (!ctx || disposed) return;
    const now = ctx.currentTime, horizon = now + LOOKAHEAD;
    for (const loop of loops) {
      // After a stall (busy main thread, throttled timer) skip the missed steps instead of bursting them.
      if (loop.nextTime < now - 0.2) advance(loop, Math.ceil((now - loop.nextTime) / loop.stepDur));
      while (loop.nextTime < horizon && (loop.endAt === null || loop.nextTime < loop.endAt)) {
        const swing = loop.step % 2 ? loop.song.swing * loop.stepDur : 0;
        const layer = loop.endAt !== null ? 'outro' : loop.nextTime < loop.introUntil ? 'intro' : 'full';
        try { loop.song.play(loop.kit, loop.step, loop.nextTime + swing, loop.stepDur, loop.pass, layer); } catch { /* skip one step */ }
        advance(loop, 1);
      }
    }
    const faded = loops.filter(loop => loop.endAt !== null && now >= loop.endAt + RETIRE_AFTER);
    if (faded.length) {
      faded.forEach(retire);
      syncTimer();
    }
  }

  function startLoop(name, now, introUntil) {
    const song = SONGS[name], out = ctx.createGain();
    out.connect(musicBus);
    const loop = { mood: name, song, out, kit: voiceKit(ctx, out, noise, null), step: 0, pass: 0, stepDur: 30 / song.bpm,
      nextTime: now + 0.06, endAt: null, introUntil, level: { from: 0, to: 0, t0: now, t1: now } };
    fadeLoop(loop, song.level, now);
    return loop;
  }

  function retire(loop) {
    loops = loops.filter(other => other !== loop);
    try { loop.out.disconnect(); } catch { /* already disconnected */ }
  }

  // Keep, revive or start the loop for `mood` and fade every other loop out. While another loop is
  // still audible the incoming one plays only its bed, so the overlap stays within the voice budget.
  function crossfade() {
    const now = ctx.currentTime;
    const overlap = loops.some(loop => loop.mood !== mood && (loop.endAt === null || loop.endAt > now));
    let keep = null;
    for (const loop of loops) {
      if (!keep && loop.mood === mood) {
        keep = loop;
        if (loop.endAt !== null) {
          loop.endAt = null;
          loop.introUntil = overlap ? now + FADE : 0;
          fadeLoop(loop, loop.song.level, now);
        }
      } else if (loop.endAt === null) {
        loop.endAt = now + FADE;
        fadeLoop(loop, 0, now);
      }
    }
    if (mood && !keep) loops.push(startLoop(mood, now, overlap ? now + FADE : 0));
    syncTimer();
  }

  // Restart scheduling after the page was hidden, music was disabled or the context was unlocked.
  function resumeMusic(dropOtherMoods = false) {
    if (!ctx || disposed) return;
    if (!enabled.music || hidden) return syncTimer();
    const now = ctx.currentTime, paused = timer === null;
    for (const loop of [...loops]) {
      if ((loop.endAt !== null && loop.endAt + RETIRE_AFTER <= now) || (dropOtherMoods && loop.mood !== mood)) retire(loop);
      else if (paused) { // pick the phrase up again from the start of its bar
        loop.step -= loop.step % 8;
        loop.nextTime = now + 0.06;
      }
    }
    crossfade();
  }

  // --- public API ---
  function unlock() {
    if (disposed || !supported) return false;
    try {
      if (!ctx && !build()) return false;
      if (ctx.state === 'closed') return false;
      if (ctx.state !== 'running' && typeof ctx.resume === 'function') Promise.resolve(ctx.resume()).catch(() => {});
      resumeMusic();
      return true;
    } catch {
      return false;
    }
  }

  function play(cue, options) {
    if (disposed || !ctx || !sfx || !enabled.sfx || !(volumes.sfx > 0) || !CUE_SET.has(cue) || ctx.state === 'closed') return false;
    try {
      const now = ctx.currentTime;
      if (now - (lastPlayed.get(cue) ?? -Infinity) < RETRIGGER) return false;
      voiceEnds = voiceEnds.filter(end => end > now);
      if (voiceEnds.length >= MAX_SFX_VOICES) return false;
      const pitch = Number(options?.pitch), semitones = Number.isFinite(pitch) ? clamp(pitch, -24, 24) : 0;
      lastPlayed.set(cue, now);
      SYNTHS[cue](sfx, now + 0.01, 2 ** (semitones / 12));
      return true;
    } catch {
      return false;
    }
  }

  function setMusic(next) {
    if (disposed) return;
    mood = next === 'prep' || next === 'service' ? next : null;
    try { if (ctx && enabled.music) crossfade(); } catch { /* ignore */ }
  }

  function setVolumes(levels) {
    if (disposed) return;
    const { sfx: sfxLevel, music } = levels || {};
    if (typeof sfxLevel === 'number' && Number.isFinite(sfxLevel)) volumes.sfx = clamp(sfxLevel, 0, 1);
    if (typeof music === 'number' && Number.isFinite(music)) volumes.music = clamp(music, 0, 1);
    try { if (ctx) applyBuses(); } catch { /* ignore */ }
  }

  function setEnabled(flags) {
    if (disposed) return;
    const { sfx: sfxOn, music } = flags || {};
    if (typeof sfxOn === 'boolean') enabled.sfx = sfxOn;
    const musicChanged = typeof music === 'boolean' && music !== enabled.music;
    if (musicChanged) enabled.music = music;
    if (!ctx) return;
    try {
      applyBuses();
      if (musicChanged) {
        if (enabled.music) resumeMusic(true);
        else syncTimer(); // stop scheduling at once; the bus fade silences what is already queued
      }
    } catch { /* ignore */ }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (timer !== null) clearInterval(timer);
    timer = null;
    doc?.removeEventListener?.('visibilitychange', onVisibility);
    for (const loop of loops) {
      try { loop.out.disconnect(); } catch { /* ignore */ }
    }
    loops = [];
    voiceEnds = [];
    const closing = ctx;
    ctx = sfx = sfxBus = musicBus = noise = null;
    try { if (closing) Promise.resolve(closing.close?.()).catch(() => {}); } catch { /* ignore */ }
  }

  return Object.freeze({ unlock, play, setMusic, setVolumes, setEnabled, dispose });
}
