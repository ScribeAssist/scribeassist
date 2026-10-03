# ScribeAssist

A prototype tool that turns a clinician's bullet-point findings into a structured first draft of a discharge summary, referral letter or clinic letter. A doctor always reviews and signs the draft.

Built by Suriya as a portfolio project for a medicine application.

- **Template mode** works with no setup.
- **On-device AI** runs a small open model (WebLLM) inside the browser. It's free, needs no key, and nothing leaves the device. It downloads 1-2 GB the first time and needs WebGPU.
- **Claude mode** calls Claude straight from the browser using an API key the user types in. The key is not stored anywhere.

This is a static site (`index.html`, `styles.css`, `app.js`), hosted on GitHub Pages.

Not a medical device. Use fictional or anonymised details only.
