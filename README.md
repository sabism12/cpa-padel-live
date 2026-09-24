<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1141b895-c0c8-4533-a99d-35d53b201b66

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Render

The `render.yaml` Blueprint builds the existing Vite client and Express server
with `npm ci && npm run build`, then starts the server with `npm start`. It also
mounts a 1 GB persistent disk at `/var/data` and sets `DATA_DIR=/var/data`, so
tournament scores, draw results, and settings survive service restarts and
deploys.

1. Push this project to a Git repository you can connect to Render.
2. In the Render Dashboard, choose **New** → **Blueprint** and connect that
   repository. Render will detect `render.yaml` and show the web service and
   persistent disk before creating them.
3. Confirm the Blueprint. Render builds the site and starts the server. The
   `/api/draw` health check should report healthy when the service is ready.
4. Open the service URL Render gives you. The public site is at `/`; the draw
   viewer and admin are at `/draw` and `/draw/admin`.

The Blueprint generates a private `SESSION_SECRET` for server-side admin
sessions. Tournament data is stored in `/var/data/tournament_state.json` on the
persistent disk. Keep the disk attached to the service; removing it deletes the
persisted tournament state. Render persistent disks require a paid web-service
plan, which is why this Blueprint uses the Starter plan.

Render also asks you to set `INITIAL_ADMIN_PASSWORD` privately. It is used only
if the persistent disk does not yet contain a tournament state file. Existing
saved settings and passwords are preserved on subsequent deploys.

For local development, no new setup is needed: the server continues to use
port 3000 and the existing `./data` directory unless `PORT` or `DATA_DIR` is
provided in the environment.
