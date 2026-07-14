# Cyber-Shield: Spark's Rescue 🚀

A 3D action-adventure web game for pilot **LŪKASS** — built with Three.js, no build step, no downloaded assets (all models are procedural, all audio is synthesized).

## Play locally

Any static file server works (ES modules need http://, not file://):

```bash
npx serve .
# or
python -m http.server 8000
```

Then open the printed URL (e.g. http://localhost:3000) in a browser.

**Play on your phone (same Wi-Fi):** find your PC's IP with `ipconfig` and open `http://<your-ip>:<port>` on the phone. Touch controls appear automatically.

## Controls

| Action | Keyboard / Mouse | Touch |
|---|---|---|
| Move | WASD / Arrows | left virtual joystick |
| Boost-jump (hold = higher) | Space | 🚀 |
| Sword | Left click / J | ⚔ |
| Shield (reflects shots) | Right click / K / Shift | 🛡 |
| Pause | Esc / P | ⏸ |

## Deploy

The game is 6 static files — deploy anywhere:
- **Netlify / Vercel / GitHub Pages / Cloudflare Pages:** drop the folder in, done. No build command, publish directory = root.
- Three.js loads from the jsDelivr CDN (pinned to 0.160.1).

## Files

| File | What it is |
|---|---|
| `index.html` | HUD, screens, touch controls, import map |
| `style.css` | Neon glassmorphism HUD styling |
| `models.js` | Procedural 3D models (Spark, bots, islands, boss…) |
| `audio.js` | Web Audio synth — SFX + procedural music |
| `game.js` | Engine: camera, physics, combat, AI, levels, save |
| `plan.md` | The original design document |
