# Start here (Option 4: Claude Code + Chrome)

## One-time (on your own computer)
1. Install Node.js (nodejs.org) if you don't have it.
2. Install Claude Code:  `npm install -g @anthropic-ai/claude-code`
3. Install the "Claude in Chrome" extension and sign in to the same Claude account.
4. Get this repo:
   ```
   git clone https://github.com/adityalt-lt/filltheform.git
   cd filltheform
   git checkout claude/stoic-maxwell-yip3tp
   ```
5. Start Claude with Chrome:  `claude --chrome`
6. Type:  `/onboard`   - Claude asks you questions and creates your profile files.
7. Copy your resume PDF into the `resumes/` folder.

## Every time you apply
1. Open the application page in Chrome.
2. In the terminal: `cd filltheform` then `claude --chrome`
3. Type:  `/fill`
4. Answer any questions. New answers are saved to `qa-bank.md` automatically.
5. Review the form and click Submit yourself.
