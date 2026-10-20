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
   - your Matrix ID, which the bridge shows as the operator's contact on its privacy policy page. OOYE (as of v3.7)
     also only serves the page that "log in with Matrix" lands on when this is set, which `npm run setup` never does.
     Installs set up before this field existed get a form for it on the status page;
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
   server and link channels (below).

If setup fails, the status page (`/_bottle/`) shows the log and offers *retry* or *start over*.

While setup waits for the homeserver, the log shows why the ping isn't working yet:

- `Homeserver said: [401] Invalid access token passed`: the homeserver hasn't loaded the registration. Check the
  `app_service_config_files` entry and restart Synapse; it logs `Loaded application service` when it has.
- `Cannot reach homeserver: The operation was aborted due to timeout`: either the bridge can't reach the homeserver
  URL (is Synapse up? try `curl <homeserver URL>/_matrix/client/versions`), or Synapse can't reach the bridge's URL
  to answer the ping. Synapse logs its `POST .../_matrix/app/v1/ping` attempts.

## linking Discord and Matrix

This happens on the bridge's own pages (its home page, behind your login), and partly in a Matrix client. The
status page repeats these steps once the bridge is running.

1. Add the bot to your Discord server from the home page.
2. Log in with Matrix: enter your Matrix ID, and the bridge DMs you a one-time login link from its bot
   (`@_ooye_bot:<your server>`). You need a Matrix client signed in as yourself to read it. The link is kept in
   memory, so it stops working if the bridge restarts.
3. Pick a mode for the server:
   - *Easy mode* creates a Matrix space and a room per Discord channel (when the channel first gets a message).
   - *Self-service* links a space and rooms you already have. In your Matrix client, invite the bot to the space and
     give it power level 100 there, and give it power level 100 in each room you'll link (it joins them itself when
     you link). The bridge refuses to link otherwise. Then pick the space on the bridge's page and link channels to
     rooms.
4. Right after linking a space, check the Matrix privacy level on the server's page. New links start at *invite*,
   and the bridge applies the level to the space (and linked rooms) whenever it syncs them, for example when the
   level changes or the Discord server is edited. Linking an existing public space at *invite* would make it
   invite-only; *directory* keeps it public. Syncing also sets the space's name and avatar from the Discord server,
   and turns off guest access at *link* and *directory*. Linked rooms keep their own name, avatar and topic.

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
