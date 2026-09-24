# CPA Padel Production Checklist

## Repository and secrets

- [ ] GitHub repository is private
- [ ] No secrets committed
- [ ] `.env` and `.env.*` are ignored (except the safe `.env.example` template)
- [ ] `SESSION_SECRET` is set privately in Render
- [ ] `INITIAL_ADMIN_PASSWORD` is set privately before first seed on a new disk
- [ ] Administrator password confirmed/changed before the real tournament

## Render service

- [ ] `npm run build` works
- [ ] `npm start` works
- [ ] Render uses `NODE_ENV=production`
- [ ] Render supplies `PORT`; server binds to `0.0.0.0`
- [ ] Persistent disk configured
- [ ] Persistent disk mounted at `/var/data`
- [ ] `DATA_DIR=/var/data`
- [ ] One application instance (no autoscaling/multiple workers)
- [ ] `/health` returns HTTP 200

## Website and tournament

- [ ] `/` works
- [ ] Existing CPA Padel pages, navigation, scoring, and APIs tested
- [ ] `/draw` works without spectator login
- [ ] `/draw/admin` requires administrator login
- [ ] Spectator realtime updates work
- [ ] Refresh/reconnect restores current draw state
- [ ] Undo works
- [ ] Reset works
- [ ] 20-pair draw tested
- [ ] Each group has exactly 4 pairs
- [ ] No pair appears twice or disappears
- [ ] A complete draw rejects further spins
- [ ] Unauthenticated users cannot call admin write APIs
- [ ] Public draw snapshot contains no secret draw plan or admin data
- [ ] Server restart preserves tournament and draw state on the disk
- [ ] Approximately 100 spectator SSE connections tested or reviewed
