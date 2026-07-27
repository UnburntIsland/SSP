import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SAMPLE_RATE = 22050;
const OUTPUT_DIR = path.resolve("assets/audio");

function clamp(value, min = -1, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function midi(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function triangle(phase) {
  return (2 / Math.PI) * Math.asin(Math.sin(phase));
}

function square(phase) {
  return Math.sin(phase) >= 0 ? 1 : -1;
}

function makeNoise(seed = 1) {
  let state = seed >>> 0;
  return function () {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

function encodeWav(samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(Math.round(clamp(samples[i]) * 32767), 44 + i * 2);
  }
  return buffer;
}

function envelope(time, duration, attack = 0.015, release = 0.08) {
  if (time < 0 || time >= duration) return 0;
  const attackGain = Math.min(1, time / Math.max(attack, 0.001));
  const releaseGain = Math.min(1, (duration - time) / Math.max(release, 0.001));
  return Math.min(attackGain, releaseGain);
}

function renderEvents(duration, events, noiseGain = 0) {
  const samples = new Float32Array(Math.ceil(duration * SAMPLE_RATE));
  const noise = makeNoise(20260726);
  for (let i = 0; i < samples.length; i += 1) {
    const time = i / SAMPLE_RATE;
    let sample = noiseGain ? noise() * noiseGain : 0;
    for (const event of events) {
      const local = time - event.start;
      if (local < 0 || local >= event.duration) continue;
      const progress = local / event.duration;
      const frequency = event.frequency + ((event.endFrequency ?? event.frequency) - event.frequency) * progress;
      const phase = Math.PI * 2 * frequency * local;
      const wave = event.wave === "square" ? square(phase)
        : event.wave === "triangle" ? triangle(phase)
          : Math.sin(phase);
      sample += wave * (event.gain ?? 0.3) * envelope(
        local,
        event.duration,
        event.attack ?? 0.008,
        event.release ?? 0.07
      );
      if (event.noise) sample += noise() * event.noise * Math.pow(1 - progress, 2);
    }
    samples[i] = clamp(sample * 0.82);
  }
  return samples;
}

function renderMusic({ duration, bpm, melody, bass, bright = false }) {
  const beatDuration = 60 / bpm;
  const samples = new Float32Array(Math.ceil(duration * SAMPLE_RATE));
  const noise = makeNoise(bright ? 17 : 29);
  for (let i = 0; i < samples.length; i += 1) {
    const time = i / SAMPLE_RATE;
    const halfBeat = Math.floor(time / (beatDuration / 2));
    const beat = Math.floor(time / beatDuration);
    const melodyNote = melody[halfBeat % melody.length];
    const bassNote = bass[beat % bass.length];
    const localHalf = time % (beatDuration / 2);
    const localBeat = time % beatDuration;
    const melodyEnv = envelope(localHalf, beatDuration * 0.46, 0.012, beatDuration * 0.13);
    const bassEnv = envelope(localBeat, beatDuration * 0.82, 0.015, beatDuration * 0.22);
    const melodyPhase = Math.PI * 2 * midi(melodyNote) * time;
    const bassPhase = Math.PI * 2 * midi(bassNote) * time;
    let sample = triangle(melodyPhase) * melodyEnv * (bright ? 0.14 : 0.11);
    sample += square(melodyPhase * 0.5) * melodyEnv * 0.025;
    sample += triangle(bassPhase) * bassEnv * 0.13;

    const kick = Math.exp(-localBeat * 18) * Math.sin(Math.PI * 2 * (82 - localBeat * 45) * localBeat);
    sample += kick * (bright ? 0.10 : 0.065);
    if (beat % 2 === 1) {
      const hatLocal = localBeat;
      sample += noise() * Math.exp(-hatLocal * 42) * (bright ? 0.035 : 0.018);
    }
    samples[i] = clamp(sample * 0.86);
  }
  return samples;
}

const sfx = {
  "ui_click.wav": renderEvents(0.09, [
    { start: 0, duration: 0.065, frequency: 760, endFrequency: 1040, wave: "square", gain: 0.14, release: 0.04 }
  ]),
  "pickup.wav": renderEvents(0.22, [
    { start: 0, duration: 0.11, frequency: 740, endFrequency: 980, wave: "triangle", gain: 0.24 },
    { start: 0.08, duration: 0.12, frequency: 980, endFrequency: 1320, wave: "triangle", gain: 0.19 }
  ]),
  "levelup.wav": renderEvents(0.72, [60, 64, 67, 72].map((note, index) => ({
    start: index * 0.12,
    duration: 0.28,
    frequency: midi(note),
    wave: "triangle",
    gain: 0.23
  }))),
  "purify.wav": renderEvents(0.33, [
    { start: 0, duration: 0.27, frequency: 460, endFrequency: 1160, wave: "sine", gain: 0.20, noise: 0.035 },
    { start: 0.05, duration: 0.22, frequency: 920, endFrequency: 1380, wave: "triangle", gain: 0.13 }
  ]),
  "hurt.wav": renderEvents(0.25, [
    { start: 0, duration: 0.2, frequency: 190, endFrequency: 76, wave: "square", gain: 0.20, noise: 0.12 }
  ]),
  "quiz_correct.wav": renderEvents(0.55, [67, 71, 74].map((note, index) => ({
    start: index * 0.11,
    duration: 0.28,
    frequency: midi(note),
    wave: "triangle",
    gain: 0.22
  }))),
  "quiz_wrong.wav": renderEvents(0.48, [
    { start: 0, duration: 0.2, frequency: 330, endFrequency: 250, wave: "square", gain: 0.16 },
    { start: 0.18, duration: 0.25, frequency: 230, endFrequency: 150, wave: "square", gain: 0.15 }
  ]),
  "boss_intro.wav": renderEvents(1.1, [
    { start: 0, duration: 0.72, frequency: 74, endFrequency: 48, wave: "sine", gain: 0.38, noise: 0.05 },
    { start: 0.28, duration: 0.65, frequency: 148, endFrequency: 92, wave: "triangle", gain: 0.18 }
  ]),
  "victory.wav": renderEvents(1.65, [60, 64, 67, 72, 76].map((note, index) => ({
    start: index * 0.18,
    duration: index === 4 ? 0.7 : 0.34,
    frequency: midi(note),
    wave: index % 2 ? "triangle" : "square",
    gain: index === 4 ? 0.22 : 0.16
  })))
};

const music = {
  "bgm_lobby.wav": renderMusic({
    duration: 16,
    bpm: 90,
    melody: [72, 76, 79, 76, 74, 77, 81, 77, 72, 76, 79, 83, 74, 77, 79, 76],
    bass: [48, 48, 53, 53, 45, 45, 55, 55],
    bright: false
  }),
  "bgm_stage.wav": renderMusic({
    duration: 16,
    bpm: 120,
    melody: [69, 72, 76, 72, 71, 74, 78, 74, 67, 71, 74, 79, 66, 69, 73, 76],
    bass: [45, 45, 48, 48, 41, 41, 43, 43],
    bright: true
  })
};

await mkdir(OUTPUT_DIR, { recursive: true });
for (const [name, samples] of Object.entries({ ...sfx, ...music })) {
  await writeFile(path.join(OUTPUT_DIR, name), encodeWav(samples));
}

console.log(`Generated ${Object.keys(sfx).length} SFX and ${Object.keys(music).length} BGM tracks in ${OUTPUT_DIR}`);
