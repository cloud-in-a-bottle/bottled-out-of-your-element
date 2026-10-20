// @ts-check

const config = require("./config")
const {Supervisor} = require("./supervisor")
const {createServer} = require("./web")

// OOYE resolves registration.yaml against the working directory when its modules load, including the one
// registration.js borrows the template from.
process.chdir(config.dataDir)

const supervisor = new Supervisor()
const server = createServer(supervisor)

server.listen(config.listenPort, () => {
	console.log(`[bottle] listening on :${config.listenPort}`)
	supervisor.start()
})

for (const signal of /** @type {const} */ (["SIGTERM", "SIGINT"])) {
	process.once(signal, async () => {
		server.close()
		await supervisor.shutdown()
		process.exit(0)
	})
}
