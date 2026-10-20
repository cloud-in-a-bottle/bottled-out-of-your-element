// @ts-check

const fs = require("fs")
const path = require("path")
const config = require("./config")

/**
 * @typedef {object} SetupAnswers
 * @property {string} serverName
 * @property {string} serverOrigin
 * @property {string} bridgeOrigin
 * @property {string} discordToken
 * @property {string} discordClientSecret
 * @property {string} webPassword
 * @property {string} adminContact
 */

/**
 * Builds the same registration OOYE's interactive `npm run setup` would, using upstream's own template so the token
 * format and namespaces stay in step with the OOYE version in the image.
 * @param {SetupAnswers} answers
 */
function writeRegistration(answers) {
	const {getTemplateRegistration} = require(path.join(config.ooyeDir, "src/matrix/read-registration"))
	const template = getTemplateRegistration(answers.serverName)
	const reg = {
		...template,
		url: answers.bridgeOrigin,
		socket: config.ooyePort,
		ooye: {
			...template.ooye,
			bridge_origin: answers.bridgeOrigin,
			server_origin: answers.serverOrigin,
			discord_token: answers.discordToken,
			discord_client_secret: answers.discordClientSecret,
			web_password: answers.webPassword,
			bridge_admin_contact: answers.adminContact
		}
	}
	save(reg)
}

/** @param {any} reg */
function save(reg) {
	fs.writeFileSync(config.registrationPath, JSON.stringify(reg, null, 2) + "\n", {mode: 0o600})
}

function readRegistration() {
	if (!fs.existsSync(config.registrationPath)) return null
	return JSON.parse(fs.readFileSync(config.registrationPath, "utf8"))
}

/**
 * The bridge operator's contact, shown on OOYE's privacy policy page. OOYE (as of v3.7) also only serves its `/ok`
 * page, where the Matrix login form lands, when this is set.
 */
function adminContact() {
	return readRegistration()?.ooye?.bridge_admin_contact || null
}

function botMxid() {
	const reg = readRegistration()
	return reg ? `@${reg.sender_localpart}:${reg.ooye.server_name}` : null
}

/**
 * Only call while OOYE isn't running: it rewrites registration.yaml itself at times.
 * @param {string} mxid
 */
function setAdminContact(mxid) {
	const reg = readRegistration()
	reg.ooye.bridge_admin_contact = mxid
	save(reg)
}

/**
 * The part of the registration the homeserver needs. OOYE keeps its Discord token and other settings in the same file
 * under `ooye`; Synapse ignores unknown keys, but there's no reason to copy the Discord credentials onto the homeserver.
 * JSON is valid YAML, so this can be saved as-is.
 */
function homeserverRegistration() {
	const reg = readRegistration()
	if (!reg) return null
	const {ooye, socket, ...rest} = reg
	return JSON.stringify(rest, null, 2) + "\n"
}

module.exports = {writeRegistration, readRegistration, adminContact, setAdminContact, botMxid, homeserverRegistration}
