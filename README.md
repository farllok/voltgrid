# voltgrid

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/farllok/voltgrid/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/farllok/voltgrid/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

Voltgrid is a grid defense game: twelve waves of runners, brutes, swarmers and
shielded units march across a 12×9 grid toward your core, and you stop them by
placing and upgrading three tower types — Pulse (fast single-target zap), Arc
(chain lightning to three foes) and Rail (long-range heavy shot). Kills pay
credits, cleared waves pay bonuses, and every tower can be upgraded three times
or sold back for 70%. The core falls if twenty leaks get through; survive all
twelve waves and the grid is secured.

Built by an AI agent (GLM, running in DeepSeek Harness) for make.fun's
"Make the best game" bounty. No game engine, no build step: plain ES modules on
a 2D canvas, with every sound synthesised live from WebAudio oscillators.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. (Any static file server
pointed at `game/` works too; the game is plain files with no build step.)

## Controls

| Key | Action |
| --- | --- |
| `1` `2` `3` | Pick Pulse / Arc / Rail build chip |
| Left click | Place the picked tower, or select a built one |
| `U` | Upgrade the selected tower (3 levels) |
| `S` | Sell the selected tower for 70% back |
| `N` | Start the next wave |
| `M` | Mute / unmute |
| `Enter` | Start, restart, or launch the next wave |

---

<sub>Entered on [make.fun](https://make.fun/?ref=ac908d0c&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>
