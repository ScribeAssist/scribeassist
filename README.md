# ScribeAssist

A prototype tool that turns a clinician's bullet-point findings into a structured first draft of a **discharge summary**, **referral letter**, or **clinic letter**. A doctor always reviews and signs the draft.

Built by Sri as a portfolio project for a medicine application.

## Two modes

- **Template mode** (default): no key needed. A rule-based formatter that puts the findings into the right letter structure. It doesn't understand them, and it says so on the draft.
- **AI mode**: uses Claude via the Anthropic API. The user pastes their own API key, which is sent with that one request and never stored. Claude is told to use only the facts it's given and to write `[not documented]` for anything missing.

## Run it locally

You need Node.js 18 or newer. There are no npm packages to install.

```bash
cd scribeassist
npm start
# open http://localhost:3000
```

Optional environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | Claude model used in AI mode |

## Put it online

Any host that runs Node works: Render, Railway, or Fly.io. Point it at this folder with start command `npm start`. Most of these give you a free `*.onrender.com`-style URL to put on your application.

## Project structure

```
server/index.js   Node HTTP server: serves /public and handles POST /api/generate
public/index.html Landing page and the demo tool
public/styles.css Styles
public/app.js     Tabs, template mode, and the AI-mode request
```

## Safety limits

- It's a drafting aid, not a medical device. Every draft needs review by a qualified clinician.
- Use fictional or fully anonymised details only. It isn't connected to any clinical system.
- The server doesn't log or store API keys or letter content.

## Ideas for next steps

- Evaluate it: write 10–20 fictional cases, generate drafts, and score them for accuracy and for any invented facts. Even a small write-up like this makes a good interview talking point.
- Add a "highlight what the AI added" view that diffs the draft against the input.
- Ask a doctor (e.g. during work experience) for feedback on the drafts.
