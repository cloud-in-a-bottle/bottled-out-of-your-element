// @ts-check

const fs = require("fs")
const path = require("path")
const {spawn} = require("child_process")
const config = require("./config")

const MAX_LOG_LINES = 500
const MAX_RESTART_DELAY_MS = 60000

/**
 * - unconfigured: no registration.yaml yet; the owner fills in the setup form.
 * - registering: OOYE's scripts/setup.js is running. It waits until the homeserver has loaded the registration (by
 *   pinging the appservice through it), then registers the bot user, uploads emojis and sets profiles.
 * - running: the bridge (start.js) is running, and restarted with backoff if it exits.
 * - failed: setup.js exited with an error; the owner can retry or start over.
 * @typedef {"unconfigured" | "registering" | "running" | "failed"} State
 */

class Supervisor {
	constructor() {
		/** @type {State} */
		this.state = "unconfigured"
		/** @type {string[]} */
		this.logs = []
		/** @type {import("child_process").ChildProcess | null} */
		this.child = null
		this.restartDelayMs = 1000
		this.stopping = false
	}

	start() {
		if (!fs.existsSync(config.registrationPath)) {
			this.state = "unconfigured"
		} else if (!fs.existsSync(config.setupDonePath)) {
			this.runSetup()
		} else {
			this.runBridge()
		}
	}

	/** @param {string} line */
	log(line) {
		process.stdout.write(line + "\n")
		this.logs.push(line)
		if (this.logs.length > MAX_LOG_LINES) this.logs.splice(0, this.logs.length - MAX_LOG_LINES)
	}

	/**
	 * @param {string} script path relative to the OOYE checkout
	 * @param {(code: number | null, signal: NodeJS.Signals | null) => void} onExit
	 */
	spawnOoye(script, onExit) {
		this.log(`[bottle] starting ${script}`)
		// cwd is the data dir: OOYE keeps registration.yaml and ooye.db in its working directory. stdin is a pipe that
		// stays open, not a TTY, so OOYE doesn't start its REPL.
		const child = spawn(process.execPath, ["--enable-source-maps", path.join(config.ooyeDir, script)], {
			cwd: config.dataDir,
			stdio: ["pipe", "pipe", "pipe"],
			env: {...process.env, FORCE_COLOR: "0"}
		})
		for (const stream of [child.stdout, child.stderr]) {
			let buffered = ""
			stream.setEncoding("utf8")
			stream.on("data", chunk => {
				buffered += chunk
				const lines = buffered.split("\n")
				buffered = lines.pop() || ""
				for (const line of lines) this.log(line)
			})
		}
		child.on("exit", (code, signal) => {
			this.log(`[bottle] ${script} exited (code ${code}, signal ${signal})`)
			this.child = null
			if (!this.stopping) onExit(code, signal)
		})
		this.child = child
	}

	runSetup() {
		this.state = "registering"
		this.spawnOoye("scripts/setup.js", code => {
			if (code === 0) {
				fs.writeFileSync(config.setupDonePath, new Date().toISOString() + "\n")
				this.runBridge()
			} else {
				this.state = "failed"
			}
		})
	}

	runBridge() {
		this.state = "running"
		const startedAt = Date.now()
		this.spawnOoye("start.js", () => {
			// A run that stayed up for a while resets the backoff; a crash loop backs off up to a minute.
			if (Date.now() - startedAt > MAX_RESTART_DELAY_MS) this.restartDelayMs = 1000
			this.log(`[bottle] restarting the bridge in ${this.restartDelayMs / 1000}s`)
			setTimeout(() => this.runBridge(), this.restartDelayMs)
			this.restartDelayMs = Math.min(this.restartDelayMs * 2, MAX_RESTART_DELAY_MS)
		})
	}

	/** Called after the setup form has written registration.yaml. */
	configured() {
		if (this.state !== "unconfigured") throw new Error(`can't configure in state ${this.state}`)
		this.runSetup()
	}

	retrySetup() {
		if (this.state !== "failed") throw new Error(`can't retry in state ${this.state}`)
		this.runSetup()
	}

	/** Discards the registration (and any bridge database) so the setup form can be filled in again. */
	async reset() {
		if (this.state === "running") throw new Error("can't start over while the bridge is running")
		await this.stopChild()
		for (const file of [config.registrationPath, config.setupDonePath, "ooye.db", "ooye.db-wal", "ooye.db-shm"]) {
			fs.rmSync(path.resolve(config.dataDir, file), {force: true})
		}
		this.logs = []
		this.state = "unconfigured"
	}

	async stopChild() {
		const child = this.child
		if (!child) return
		this.stopping = true
		const exited = new Promise(resolve => child.once("exit", resolve))
		child.kill("SIGTERM")
		const timer = setTimeout(() => child.kill("SIGKILL"), 10000)
		await exited
		clearTimeout(timer)
		this.stopping = false
	}

	async shutdown() {
		this.log("[bottle] shutting down")
		this.stopping = true
		await this.stopChild()
	}
}

module.exports = {Supervisor}
