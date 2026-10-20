// @ts-check

const path = require("path")

/** @param {string} name */
function requireEnv(name) {
	const value = process.env[name]
	if (!value) throw new Error(`${name} must be set`)
	return value
}

const dataDir = requireEnv("BOTTLE_APP_DATA_DIR")

module.exports = {
	dataDir,
	ooyeDir: process.env.OOYE_DIR || "/app/ooye",
	listenPort: 8080,
	// OOYE's web server and appservice listener share this port (`socket` in registration.yaml).
	ooyePort: 6693,
	registrationPath: path.join(dataDir, "registration.yaml"),
	// Written once OOYE's own setup script has finished (homeserver ping OK, bot user registered, emojis uploaded).
	setupDonePath: path.join(dataDir, ".bottle-setup-done")
}
