// @ts-check

const http = require("http")
const config = require("./config")
const pages = require("./pages")
const registration = require("./registration")
const checks = require("./checks")

const MAX_FORM_BYTES = 16 * 1024

/** @param {http.IncomingMessage} req */
function publicOrigin(req) {
	const proto = req.headers["x-forwarded-proto"]
	const host = req.headers["x-forwarded-host"]
	if (typeof proto !== "string" || typeof host !== "string") {
		throw new Error("request has no X-Forwarded-Proto/X-Forwarded-Host; is it coming through the OpenHost router?")
	}
	return `${proto}://${host}`
}

/**
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {string} html
 */
function sendHtml(res, status, html) {
	res.writeHead(status, {"Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store"})
	res.end(html)
}

/**
 * @param {http.ServerResponse} res
 * @param {string} location
 */
function redirect(res, location) {
	res.writeHead(303, {Location: location})
	res.end()
}

/** @param {http.IncomingMessage} req */
async function readForm(req) {
	let body = ""
	for await (const chunk of req) {
		body += chunk
		if (body.length > MAX_FORM_BYTES) throw new Error("form too large")
	}
	return new URLSearchParams(body)
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function proxyToOoye(req, res) {
	const upstream = http.request({
		host: "127.0.0.1",
		port: config.ooyePort,
		method: req.method,
		path: req.url,
		headers: req.headers
	}, upstreamRes => {
		res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers)
		upstreamRes.pipe(res)
	})
	upstream.on("error", err => {
		if (res.headersSent) return res.destroy(err)
		sendHtml(res, 502, pages.message("Bridge unavailable", `The bridge isn't answering right now (${err.message}). Check <a href="/_bottle/">the status page</a>.`))
	})
	req.pipe(upstream)
}

/**
 * @param {import("./supervisor").Supervisor} supervisor
 * @param {string[]} problems from the admin contact form
 */
function statusPage(supervisor, problems) {
	return pages.status(supervisor, {
		hsRegistration: registration.homeserverRegistration(),
		adminContact: registration.adminContact(),
		botMxid: registration.botMxid(),
		problems
	})
}

/**
 * @param {import("./supervisor").Supervisor} supervisor
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} pathname
 */
async function handleBottle(supervisor, req, res, pathname) {
	// The router already gates /_bottle/ behind the owner login (it isn't in public_paths); this is a second check in
	// case the manifest ever changes.
	if (req.headers["x-openhost-is-owner"] !== "true") {
		return sendHtml(res, 403, pages.message("Forbidden", "Only the owner of this space can see this page."))
	}

	if (req.method === "GET" && pathname === "/_bottle/") {
		if (supervisor.state === "unconfigured") {
			return sendHtml(res, 200, pages.setupForm({bridgeOrigin: publicOrigin(req), values: {}, problems: []}))
		}
		return sendHtml(res, 200, statusPage(supervisor, []))
	}

	if (req.method === "POST" && pathname === "/_bottle/setup") {
		if (supervisor.state !== "unconfigured") return redirect(res, "/_bottle/")
		const form = await readForm(req)
		const bridgeOrigin = publicOrigin(req)
		const values = {
			serverName: (form.get("server_name") || "").trim(),
			serverOrigin: (form.get("server_origin") || "").trim().replace(/\/+$/, ""),
			discordToken: (form.get("discord_token") || "").trim(),
			discordClientSecret: (form.get("discord_client_secret") || "").trim(),
			webPassword: form.get("web_password") || "",
			adminContact: (form.get("admin_contact") || "").trim()
		}
		const problems = []
		problems.push(...checks.checkMxid(values.adminContact))
		if (!values.discordClientSecret) problems.push("The Discord client secret is required.")
		problems.push(...await checks.checkHomeserver(values.serverOrigin, values.serverName))
		problems.push(...(values.discordToken ? await checks.checkDiscord(values.discordToken, bridgeOrigin) : ["The Discord bot token is required."]))
		if (problems.length) {
			return sendHtml(res, 200, pages.setupForm({bridgeOrigin, values, problems}))
		}
		registration.writeRegistration({...values, bridgeOrigin})
		supervisor.configured()
		return redirect(res, "/_bottle/")
	}

	if (req.method === "POST" && pathname === "/_bottle/admin-contact") {
		if (supervisor.state === "unconfigured") return redirect(res, "/_bottle/")
		const mxid = ((await readForm(req)).get("admin_contact") || "").trim()
		const problems = checks.checkMxid(mxid)
		if (problems.length) {
			return sendHtml(res, 200, statusPage(supervisor, problems))
		}
		await supervisor.setAdminContact(mxid)
		return redirect(res, "/_bottle/")
	}

	if (req.method === "POST" && pathname === "/_bottle/retry") {
		supervisor.retrySetup()
		return redirect(res, "/_bottle/")
	}

	if (req.method === "POST" && pathname === "/_bottle/reset") {
		await supervisor.reset()
		return redirect(res, "/_bottle/")
	}

	if (req.method === "GET" && pathname === "/_bottle/logs") {
		res.writeHead(200, {"Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store"})
		return res.end(supervisor.logs.join("\n") + "\n")
	}

	return sendHtml(res, 404, pages.message("Not found", "No such page."))
}

/** @param {import("./supervisor").Supervisor} supervisor */
function createServer(supervisor) {
	return http.createServer(async (req, res) => {
		const pathname = new URL(req.url || "/", "http://localhost").pathname
		try {
			if (pathname === "/health") {
				res.writeHead(200, {"Content-Type": "application/json"})
				return res.end(JSON.stringify({status: "ok", state: supervisor.state}))
			}
			if (pathname === "/_bottle" || pathname.startsWith("/_bottle/")) {
				return await handleBottle(supervisor, req, res, pathname === "/_bottle" ? "/_bottle/" : pathname)
			}
			// Until the bridge is fully set up, its home page is the setup/status page. Other paths still reach OOYE
			// while setup.js is running: the homeserver's appservice ping has to get through.
			if (supervisor.state !== "running" && pathname === "/") return redirect(res, "/_bottle/")
			if (!supervisor.child) {
				return sendHtml(res, 503, pages.message("Bridge not running", `The bridge isn't running yet. See <a href="/_bottle/">the setup page</a>.`))
			}
			return proxyToOoye(req, res)
		} catch (e) {
			console.error(e)
			if (!res.headersSent) sendHtml(res, 500, pages.message("Error", pages.escape(e.message)))
			else res.destroy()
		}
	})
}

module.exports = {createServer}
