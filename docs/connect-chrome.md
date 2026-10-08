# Connecting Claude to your Chrome

Requirements: a paid Claude plan, Google Chrome, and a recent Claude Code.
(Check https://code.claude.com/docs for the current requirements; they change.)

1. **Install the extension**: add "Claude in Chrome" from the Chrome Web Store.
2. **Sign in** to the extension with the same Claude account you use for Claude Code.
3. **Update Claude Code**: `npm update -g @anthropic-ai/claude-code` (or `claude update`).
4. **Start it from this repo on your own computer**:
   ```
   cd filltheform
   claude --chrome
   ```
   (Or run `/chrome` inside a session to check status / enable it.)
5. Open a job application tab, then ask: "Fill this application using my profile."
6. Approve site permissions when Chrome/Claude prompts.

Alternative: the Claude desktop app has a built-in browser pane; same repo, same CLAUDE.md.

Note: a cloud session (like the one that scaffolded this) cannot reach your Chrome.
Clone the repo locally and run the steps above there.

## Troubleshooting
- Tools not showing: run `/chrome`, make sure the extension is signed in and enabled.
- Wrong account: sign out and back in on both sides.
- Page blocks automation: fill that part manually and tell Claude to continue.
