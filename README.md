# AI-BEAST OpenAI supervisor demo

A shareable supervisor and participant preview of the AI-BEAST advice task.

## Repository contents

```text
.
├── .env.example
├── .gitignore
├── .npmrc
├── README.md
├── SUPERVISOR_NOTES.md
├── package.json
├── package-lock.json
├── server.js
├── vercel.json
├── public/
│   └── index.html
└── scripts/
    └── check.mjs
```

Upload **all of these files and folders** to the root of one GitHub repository. Do not upload a real `.env` file or paste an API key into any file.

## Deploy on Vercel

1. In Vercel, choose **Add New → Project** and import this GitHub repository.
2. Leave the framework preset as **Other** or let Vercel detect the Express app.
3. Leave the root directory as the repository root.
4. Add the following environment variables in Vercel:

```text
OPENAI_API_KEY=your OpenAI API key
DEMO_ACCESS_CODE=your chosen private access code
OPENAI_TEXT_MODEL=gpt-5-mini
OPENAI_AUDIO_MODEL=gpt-4o-mini-tts
OPENAI_TTS_FALLBACK_MODEL=tts-1-hd
DEFAULT_VOICE=marin
```

`OPENAI_API_KEY` must be stored only in Vercel's environment-variable settings. `DEMO_ACCESS_CODE` is the password you will give supervisors.

5. Deploy. After deployment, use:

```text
https://your-project.vercel.app/supervisor
https://your-project.vercel.app/participant
```

Both links use the same access code. The supervisor page shows design controls and researcher information; the participant page hides those details.

## Local testing

Create a local `.env` file by copying `.env.example`, enter your own values, then run:

```bash
npm install
npm run check
npm start
```

Open `http://localhost:3000/supervisor`.

## Important

- Never commit `.env`, an API key, or a Vercel access token.
- The wording and voice use the OpenAI API, so live use can incur API charges.
- The advice number, accuracy condition, and affirmation/challenge condition remain experimenter-controlled.
- For confirmatory data collection, consider pre-generating and freezing approved audio clips so acoustic variation is controlled.
