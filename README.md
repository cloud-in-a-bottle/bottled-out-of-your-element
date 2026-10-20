# bottled-out-of-your-element

[Out Of Your Element](https://gitdab.com/cadence/out-of-your-element) (OOYE), the Matrix ↔ Discord bridge, packaged
as a Cloud in a Bottle app. It bridges a Discord server to a Matrix homeserver you already run elsewhere (it doesn't
need to be in the same bottle, or in a bottle at all).

OOYE itself is used unmodified: the image clones a pinned release (`OOYE_VERSION` in the `Dockerfile`). This repo
adds a small Node supervisor (`bottle/`) that stands in for OOYE's interactive `npm run setup`, runs the bridge, and
proxies to it.

This is an unofficial container setup. OOYE's author [doesn't support Docker installs](https://gitdab.com/cadence/out-of-your-element/src/branch/main/docs/docker.md),
so report problems here, not upstream.

## setting it up

1. Deploy the app: `oh app deploy https://github.com/cloud-in-a-bottle/bottled-out-of-your-element --wait`.
2. Open it. You get a setup page asking for:
   - your homeserver's name (the part after `:` in user IDs) and its client-server URL;
   - a Discord bot token and client secret. The page lists what to change on Discord's developer portal (privileged
     intents, an OAuth redirect to `https://<this app>/oauth`, a credit to OOYE in the bot's description), and
     checks each one before saving, as `npm run setup` does.
3. The page then shows the appservice registration. Save it where Synapse can read it, add it to `homeserver.yaml`,
   and restart Synapse:
   ```yaml
   app_service_config_files:
     - /data/ooye-registration.yaml
   ```
   The registration shown leaves out OOYE's own settings (including the Discord token); Synapse doesn't need them.
4. Once Synapse loads it, setup carries on by itself: OOYE pings the homeserver, registers its bot user, uploads its
   emojis and sets its profile, and then the bridge starts. Open the app's home page to add the bot to a Discord
   server and link channels.

If setup fails, the status page (`/_bottle/`) shows the log and offers *retry* or *start over*.

## how it fits together

- The supervisor (`bottle/main.js`) listens on 8080: `/health`, the setup/status pages under `/_bottle/`, and a
  proxy to OOYE's web server and appservice listener on 6693 for everything else.
- OOYE runs with the app data dir as its working directory, so `registration.yaml` and `ooye.db` live there.
- States: *unconfigured* (setup form) → *registering* (OOYE's `scripts/setup.js`, which waits for the homeserver)
  → *running* (`start.js`, restarted with backoff if it exits). A `.bottle-setup-done` marker records that setup
  finished.

## public paths

The homeserver and Discord have to reach the bridge without your login, so these paths are public:

- `/_matrix/app/`: homeserver → bridge transactions. OOYE rejects any request without the `hs_token`.
- `/download/`: OOYE's media proxy. Matrix media needs auth, so Discord fetches Matrix uploads, stickers and
  avatars through here.
- `/time/`: timestamp links in bridged messages.

Everything else, including the bridge's web UI (adding the bot, guild settings, linking channels) and `/_bottle/`,
stays behind the owner login, so only you can use the web UI.

## development

```bash
just setup   # test dependencies (uv)
just test    # build the image and test it behind the real OpenHost router (needs podman)
just run     # run the image locally on :8080, with data in ./dev-data
```

## license

The packaging in this repo is MIT. OOYE is AGPL-3.0-or-later; the image downloads and runs it unmodified, and its
source is at the link above.
