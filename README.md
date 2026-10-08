# filltheform

A personal "brain" for an AI assistant that fills job application forms in my browser.
This repo holds my profile, approved answers and the rules; Claude in Chrome does the clicking.

## Flow
1. Open the application page in Chrome.
2. Start Claude Code in this folder with Chrome enabled (`claude --chrome`).
3. Say: "Fill this application using my profile."
4. Review what was filled and answer any questions Claude asks. Submit it yourself.

## One-time setup
1. `cp profile.example.json profile.json` and fill it in.
2. `cp qa-bank.example.md qa-bank.md` and add answers you've approved.
3. `cp questions-log.example.md questions-log.md`
4. Put resumes in `resumes/` and reference them in `profile.json`.
5. Connect Chrome - see `docs/connect-chrome.md`.

## Layout
| File | Purpose |
|------|---------|
| `CLAUDE.md` | Rules Claude follows (auto-loaded by Claude Code) |
| `profile.json` | My facts (gitignored) |
| `qa-bank.md` | Approved answers (gitignored) |
| `questions-log.md` | Every question seen (gitignored) |
| `resumes/` | Resume files (gitignored) |

## Roadmap
1. Prove the loop on one portal (Greenhouse/Lever).
2. Grow the Q&A bank from the questions log.
3. Multi-step portals (Workday), cover letters per JD.
4. Only if too slow: a deterministic Chrome extension that fills known fields and calls Claude for the rest.
