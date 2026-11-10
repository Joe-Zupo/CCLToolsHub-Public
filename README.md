# Clipscript Studio

Clipscript Studio runs on your own computer. Script Writer interviews you and drafts short-form video scripts. Clip Studio finds and renders short clips from a long video.

It uses the ChatGPT plan you already have. You sign in with ChatGPT in your browser, and usage counts toward your plan. Your work stays in a folder on your computer, and the app only listens on `127.0.0.1`.

## What you need

- Node.js 24 or newer
- pnpm 11 (`npm install -g pnpm@11.19.0`)
- Git
- A ChatGPT Go, Plus or Pro plan
- An AssemblyAI key, only for Clip Studio. ChatGPT plan access has no transcription, so Clip Studio uses AssemblyAI for that step.

## Install

```bash
git clone https://github.com/Joe-Zupo/clipscript-studio.git
cd clipscript-studio
pnpm prepare-app
pnpm start
```

Open http://127.0.0.1:3006, go to Settings, and choose **Continue with ChatGPT**.

## Everyday commands

| Command       | What it does                              |
| ------------- | ----------------------------------------- |
| `pnpm start`  | Starts the studio in the background       |
| `pnpm stop`   | Stops it                                  |
| `pnpm status` | Shows whether it is running and connected |
| `pnpm update` | Pulls the newest code and rebuilds        |

Your scripts, videos and sign-in stay in `.studio-data` through updates. Back up that folder if you move computers.

## How ChatGPT access works

The app uses OpenAI's Sign in with ChatGPT with plan usage. Sign-in tokens are encrypted and stored only in `.studio-data`. They go only to OpenAI. The app cannot read your ChatGPT conversations or memories.

You can see each app's usage and set a weekly limit at https://chatgpt.com/settings/usage. To disconnect, use Settings in this app, or Settings, Security and login in ChatGPT.

Batch in Script Writer asks you to confirm before it drafts several scripts in a row.

## Development

```bash
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
```

The app is in `web/studio`. ChatGPT sign-in and model calls are in `web/studio/src/lib/chatgpt`.

The Script Room page is `web/studio/src/room/index.html`, and the agents' rules are in `web/studio/src/lib/script-writer/prompts.ts`.

Thirdy and Fel are AI, and the interface says so. Keep that, and keep real people's details out of the page and prompts.
