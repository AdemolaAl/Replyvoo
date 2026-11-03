'use strict';
// Generates the voice-guide narration MP3s with ElevenLabs and marks them as available.
// Run once on any machine with internet:  ELEVENLABS_API_KEY=xxx npm run make-voice
// Optional: ELEVENLABS_VOICE_ID (default: the voice in lines.json), ELEVENLABS_MODEL (default eleven_v4, which understands tags like [warmly] or [chuckles]),
//           --only=s1,d0  to regenerate a few lines,  --force  to overwrite existing files.
// Edit the text in public/audio/narration/lines.json, then run this again. Without the MP3s the app
// falls back to the browser's built-in voice, so nothing breaks if you skip this.
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'public', 'audio', 'narration');
const FILE = path.join(DIR, 'lines.json');
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.log('Set ELEVENLABS_API_KEY first (elevenlabs.io → Profile → API keys).'); process.exit(1); }
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const voice = process.env.ELEVENLABS_VOICE_ID || data.voice_id;
const model = process.env.ELEVENLABS_MODEL || 'eleven_v4';
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const force = process.argv.includes('--force');

(async () => {
  data.files = data.files || {};
  for (const [id, text] of Object.entries(data.lines)) {
    if (only.length && !only.includes(id)) continue;
    const out = path.join(DIR, id + '.mp3');
    if (fs.existsSync(out) && !force && !only.length) { data.files[id] = true; console.log('= ' + id + ' (exists)'); continue; }
    const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voice) + '?output_format=mp3_44100_128', {
      method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true } })
    });
    if (!res.ok) { console.error('✗ ' + id + ': ' + res.status + ' ' + (await res.text()).slice(0, 200)); process.exitCode = 1; continue; }
    fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    data.files[id] = true;
    console.log('✓ ' + id + '.mp3');
  }
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
  console.log('Done. Restart the app (or just reload the page) to hear the new voice.');
})();
