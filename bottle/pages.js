// @ts-check

/** @param {string} s */
function escape(s) {
	return String(s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c] || c)
}

const STYLE = `
:root { color-scheme: light dark; --fg: #1d1d1f; --bg: #fafafa; --muted: #666; --card: #fff; --border: #ddd; --accent: #5865f2; --bad: #b3261e; }
@media (prefers-color-scheme: dark) { :root { --fg: #eee; --bg: #17171a; --muted: #aaa; --card: #222227; --border: #3a3a40; --bad: #f2b8b5; } }
body { font: 15px/1.5 system-ui, sans-serif; color: var(--fg); background: var(--bg); margin: 0; padding: 24px 16px; }
main { max-width: 760px; margin: 0 auto; }
h1 { font-size: 1.5em; margin: 0 0 4px; }
h2 { font-size: 1.1em; margin: 28px 0 8px; }
.sub { color: var(--muted); margin: 0 0 20px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin: 12px 0; }
label { display: block; font-weight: 600; margin: 14px 0 2px; }
.hint { color: var(--muted); font-size: 0.9em; margin: 0 0 4px; }
input { width: 100%; box-sizing: border-box; padding: 8px; font: inherit; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--fg); }
button, .button { display: inline-block; padding: 8px 16px; font: inherit; border: 0; border-radius: 6px; background: var(--accent); color: #fff; cursor: pointer; text-decoration: none; margin-top: 16px; }
button.secondary { background: transparent; color: var(--fg); border: 1px solid var(--border); }
pre { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px; overflow: auto; font-size: 12.5px; max-height: 420px; white-space: pre-wrap; word-break: break-all; }
code { font-size: 0.92em; }
.problems { border-color: var(--bad); }
.problems li { color: var(--bad); }
.state { font-weight: 600; }
form.inline { display: inline; }
ol li { margin: 4px 0; }
`

/**
 * @param {string} title
 * @param {string} body
 */
function layout(title, body) {
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`
}

/**
 * @param {string} title
 * @param {string} html trusted HTML
 */
function message(title, html) {
	return layout(title, `<h1>${escape(title)}</h1><p>${html}</p>`)
}

/**
 * @param {{bridgeOrigin: string, values: Partial<Record<string, string>>, problems: string[]}} opts
 */
function setupForm({bridgeOrigin, values, problems}) {
	const v = (/** @type {string} */ k) => escape(values[k] || "")
	return layout("Set up Out Of Your Element", `
<h1>Set up Out Of Your Element</h1>
<p class="sub">A Matrix ↔ Discord bridge. This page replaces OOYE's interactive <code>npm run setup</code>.</p>
${problems.length ? `<div class="card problems"><strong>Fix these and submit again:</strong><ul>${problems.map(p => `<li>${escape(p)}</li>`).join("")}</ul></div>` : ""}
<div class="card">
<strong>Before you start, on <a href="https://discord.com/developers/applications" target="_blank">Discord's developer portal</a>:</strong>
<ol>
<li>Create an application (or pick one). On <b>Bot</b>, reset and copy the token, and enable all three <b>Privileged Gateway Intents</b>.</li>
<li>On <b>General Information</b>, add to the description: <code>Powered by **Out Of Your Element** https://gitdab.com/cadence/out-of-your-element</code> (OOYE's license terms ask for this credit).</li>
<li>On <b>OAuth2</b>, copy the client secret and add the redirect <code>${escape(bridgeOrigin)}/oauth</code></li>
</ol>
</div>
<form method="post" action="/_bottle/setup" class="card">
<label for="server_name">Homeserver name</label>
<p class="hint">The part after the <code>:</code> in your Matrix user IDs, e.g. <code>example.com</code>.</p>
<input id="server_name" name="server_name" required value="${v("serverName")}" placeholder="example.com">
<label for="server_origin">Homeserver URL</label>
<p class="hint">Where the client-server API lives, e.g. <code>https://matrix.example.com</code>.</p>
<input id="server_origin" name="server_origin" required value="${v("serverOrigin")}" placeholder="https://matrix.example.com">
<label for="admin_contact">Your Matrix ID</label>
<p class="hint">Shown as the bridge operator's contact on the bridge's privacy policy page.</p>
<input id="admin_contact" name="admin_contact" required value="${v("adminContact")}" placeholder="@you:example.com">
<label for="discord_token">Discord bot token</label>
<input id="discord_token" name="discord_token" type="password" required autocomplete="off" value="${v("discordToken")}">
<label for="discord_client_secret">Discord client secret</label>
<input id="discord_client_secret" name="discord_client_secret" type="password" required autocomplete="off" value="${v("discordClientSecret")}">
<label for="web_password">Password to add the bot to servers (optional)</label>
<p class="hint">The bridge's own pages are already behind your Cloud in a Bottle login, so you can leave this empty.
To keep strangers from adding the bot by building an invite link themselves, also turn off <b>Public Bot</b> on the Discord Bot page.</p>
<input id="web_password" name="web_password" autocomplete="off" value="${v("webPassword")}">
<p class="hint">The bridge will be reachable at <code>${escape(bridgeOrigin)}</code>.</p>
<button type="submit">Check and save</button>
</form>`)
}

/**
 * @param {import("./supervisor").Supervisor} supervisor
 * @param {{hsRegistration: string | null, adminContact: string | null, botMxid: string | null, problems: string[]}} opts
 *   problems are from the admin contact form
 */
function status(supervisor, {hsRegistration, adminContact, botMxid, problems}) {
	const state = supervisor.state
	// Registrations written before the setup form asked for this don't have it.
	const adminContactForm = adminContact ? "" : `<form method="post" action="/_bottle/admin-contact" class="card${problems.length ? " problems" : ""}">
<strong>Add your Matrix ID.</strong> The bridge lists it as the operator's contact, and some of its pages (like the one after
"log in with Matrix") don't work without it. Saving restarts the bridge.
${problems.length ? `<ul>${problems.map(p => `<li>${escape(p)}</li>`).join("")}</ul>` : ""}
<input name="admin_contact" required placeholder="@you:example.com" aria-label="Your Matrix ID">
<button type="submit">Save</button>
</form>`
	const linkingSteps = `
<h2>Linking Discord and Matrix</h2>
<div class="card">
<ol>
<li>On <a href="/">the bridge's home page</a>, add the bot to your Discord server, then log in with Matrix. The bridge sends
the login link as a DM from <code>${escape(botMxid || "the bridge bot")}</code>, so you need a Matrix client
signed in as yourself.</li>
<li><b>Easy mode</b> creates a Matrix space and rooms for you. <b>Self-service</b> links a space and rooms you already have.
For that, in your Matrix client:
<ul>
<li>invite the bot to the space and give it power level 100 (admin) there;</li>
<li>give it power level 100 in each room you'll link, too (it joins them itself when you link).</li>
</ul></li>
<li>Right after linking, check the Matrix privacy level on the server's page. New links start at <b>invite</b>, and the
bridge applies the level to the space and linked rooms the next time it syncs them, so a public space would become
invite-only. Pick <b>directory</b> to keep it public. The bridge also sets the space's name and avatar from the Discord server.</li>
</ol>
</div>`
	const reg = hsRegistration ? `<pre id="reg">${escape(hsRegistration)}</pre>
<button type="button" class="secondary" onclick="navigator.clipboard.writeText(document.getElementById('reg').textContent)">Copy</button>` : ""
	const synapseSteps = `
<ol>
<li>Save this as a file the homeserver can read, e.g. <code>/data/ooye-registration.yaml</code> on its volume. (JSON is valid YAML.)
On fly.io, one way is <code>fly ssh console -a &lt;app&gt;</code> and writing the file onto the mounted volume.</li>
<li>Reference it in <code>homeserver.yaml</code>:<pre>app_service_config_files:
  - /data/ooye-registration.yaml</pre></li>
<li>Restart Synapse (on fly.io, <code>fly apps restart &lt;app&gt;</code>). Synapse only reads appservice registrations at startup.</li>
</ol>`
	let body
	if (state === "registering") {
		body = `<div class="card"><p class="state">Waiting for your homeserver to load the bridge's registration…</p>
<p>Give this registration to Synapse. Setup continues by itself once Synapse can reach the bridge.</p>${synapseSteps}${reg}</div>`
	} else if (state === "failed") {
		body = `<div class="card problems"><p class="state">Setup failed. The log below says why.</p>
<form class="inline" method="post" action="/_bottle/retry"><button>Retry</button></form>
<form class="inline" method="post" action="/_bottle/reset" onsubmit="return confirm('Discard this registration and the bridge database, and fill in the setup form again?')"><button class="secondary">Start over</button></form>
</div><h2>Homeserver registration</h2><div class="card">${synapseSteps}${reg}</div>`
	} else {
		body = `<div class="card"><p class="state">The bridge is running.</p>
<p>Open <a href="/">the bridge's home page</a> to add the bot to a Discord server, link channels to rooms, and invite yourself.</p>
<a class="button" href="/">Open the bridge</a></div>
${linkingSteps}
<details class="card"><summary>Homeserver registration</summary>${synapseSteps}${reg}</details>`
	}
	return layout("Out Of Your Element", `
<h1>Out Of Your Element</h1>
<p class="sub">Matrix ↔ Discord bridge · state: <span class="state">${escape(state)}</span></p>
${adminContactForm}
${body}
<h2>Log</h2>
<pre id="log">${escape(supervisor.logs.join("\n"))}</pre>
<script>
const initialState = ${JSON.stringify(state)}
const log = document.getElementById("log")
log.scrollTop = log.scrollHeight
setInterval(async () => {
	try {
		const health = await fetch("/health").then(r => r.json())
		if (health.state !== initialState) return location.reload()
		const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 4
		log.textContent = await fetch("/_bottle/logs").then(r => r.text())
		if (atBottom) log.scrollTop = log.scrollHeight
	} catch (e) {}
}, 3000)
</script>`)
}

module.exports = {escape, message, setupForm, status}
