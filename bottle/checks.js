// @ts-check

// The same checks OOYE's interactive setup makes before it will write a registration. That script skips all of them
// when registration.yaml already exists, so the setup form has to make them instead.

// Privileged gateway intents: presence, guild members, message content. Either all full or all "limited" (the
// variant Discord shows for unverified bots) is accepted, matching scripts/setup.js.
const INTENTS_FULL = (1 << 12) | (1 << 14) | (1 << 18)
const INTENTS_LIMITED = (1 << 13) | (1 << 15) | (1 << 19)
const INTENTS_MASK = INTENTS_FULL | INTENTS_LIMITED

/**
 * @param {string} url
 * @param {RequestInit} [init]
 */
async function fetchJson(url, init) {
	const res = await fetch(url, {...init, signal: AbortSignal.timeout(15000)})
	const text = await res.text()
	let json = null
	try {
		json = JSON.parse(text)
	} catch (e) {}
	return {status: res.status, json}
}

/**
 * @param {string} serverOrigin
 * @param {string} serverName
 * @returns {Promise<string[]>} problems, empty if fine
 */
async function checkHomeserver(serverOrigin, serverName) {
	if (!serverOrigin.match(/^https?:\/\//)) return ["Homeserver URL must start with http:// or https://"]
	if (serverOrigin.endsWith("/")) return ["Homeserver URL must not end with a slash"]
	if (!serverName.match(/^[a-z0-9][.a-z0-9-]+[a-z]$/)) return ["Homeserver name doesn't look like a domain name"]
	try {
		var versions = await fetchJson(`${serverOrigin}/_matrix/client/versions`)
	} catch (e) {
		return [`Couldn't reach ${serverOrigin}: ${e.message}`]
	}
	if (versions.status !== 200 || !Array.isArray(versions.json?.versions)) {
		return [`There is no Matrix server at ${serverOrigin} (/_matrix/client/versions returned ${versions.status})`]
	}
	if (!versions.json.versions.includes("v1.11")) {
		return [`OOYE needs Matrix version v1.11, but ${serverOrigin} doesn't support it`]
	}
	return []
}

/**
 * @param {string} token
 * @param {string} bridgeOrigin
 * @returns {Promise<string[]>} problems, empty if fine
 */
async function checkDiscord(token, bridgeOrigin) {
	try {
		var res = await fetchJson("https://discord.com/api/v10/applications/@me", {headers: {Authorization: `Bot ${token}`}})
	} catch (e) {
		return [`Couldn't reach Discord: ${e.message}`]
	}
	if (res.status !== 200 || !res.json) return [`Discord rejected the bot token (HTTP ${res.status})`]
	const app = res.json
	const appPage = `https://discord.com/developers/applications/${app.id}`
	const problems = []
	const intents = app.flags & INTENTS_MASK
	if (intents !== INTENTS_FULL && intents !== INTENTS_LIMITED) {
		problems.push(`On the Bot page (${appPage}/bot), enable all three Privileged Gateway Intents.`)
	}
	if (!app.description?.match(/out.of.your.element/i)) {
		problems.push(
			`OOYE's license terms ask that the bot credit it. On the General Information page (${appPage}/information), ` +
			`add something like "Powered by **Out Of Your Element** https://gitdab.com/cadence/out-of-your-element" to the description.`
		)
	}
	const redirect = `${bridgeOrigin}/oauth`
	if (!app.redirect_uris?.includes(redirect)) {
		problems.push(`On the OAuth2 page (${appPage}/oauth2), add this redirect: ${redirect}`)
	}
	return problems
}

module.exports = {checkHomeserver, checkDiscord}
