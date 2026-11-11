import { InstanceBase, runEntrypoint, InstanceStatus, SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { Server } from 'node-osc'
import { SequenceActiveState, SimpleCache } from './cache.js'
import { ConsoleStatus } from './status.js'
import { GetPresets } from './presets.js'

const AUTOSTART_EVERY_MS = 30_000
const WATCHDOG_EVERY_MS = 1_000

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()
	private oscServer: Server | null = null
	seqCache = new SimpleCache<SequenceActiveState[]>()
	consoleStatus = new ConsoleStatus()
	private watchdog: NodeJS.Timeout | null = null
	private defsTimer: NodeJS.Timeout | null = null
	private lastAutoStart = 0
	private offlineReported = false
	private listening = false

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		this.seqCache = new SimpleCache<SequenceActiveState[]>()
		this.consoleStatus.reset()
		this.updateStatus(InstanceStatus.Connecting)
		this.updateActions()
		this.updateFeedbacks()
		this.updateVariableDefinitions()
		this.setPresetDefinitions(GetPresets(this.label))
		await this.initOSC(config)
		this.startWatchdog()
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.stopWatchdog()
		if (this.defsTimer) clearTimeout(this.defsTimer)
		this.defsTimer = null
		if (this.oscServer) {
			try {
				await this.oscServer.close()
			} catch (e) {
				this.log('debug', `OSC close failed: ${e instanceof Error ? e.message : String(e)}`)
			}
			this.oscServer = null
		}
		this.seqCache.clear()
		this.log('debug', 'Module destroyed')
	}

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
	async initOSC(config: ModuleConfig) {
		if (this.oscServer) {
			await this.oscServer.close()
			this.oscServer = null
		}

		this.listening = false
		this.oscServer = new Server(Number(config.feedbackPort), '0.0.0.0', () => {
			this.listening = true
			this.log('info', `OSC server listening on port ${config.feedbackPort}`)
			if (this.config.usePlugin) {
				this.updateStatus(InstanceStatus.Connecting, 'Waiting for CompanionFeedback plugin heartbeat')
				this.requestRefresh()
			} else {
				this.updateStatus(InstanceStatus.Ok)
			}
		})

		this.oscServer.on('message', (msg: any[]) => {
			// node-osc liefert: [ '/adresse', arg1, arg2, ... ]
			const address = msg[0] as string
			const args = msg.slice(1)

			this.handleOSCMessage(address, args)
		})

		this.oscServer.on('error', (err: Error) => {
			this.listening = false
			this.log('error', `OSC error: ${err.message}`)
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
		})
	}

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
	handleOSCMessage(address: string, args: any[]) {
		if (this.config.usePlugin) {
			const path = ConsoleStatus.matchAddress(address, this.config.pluginRoot || 'ma3', this.config.outputPrefix || '')
			if (path) {
				this.handlePluginMessage(path, args)
				return
			}
		}

		const uncleanedGma3Address = address.slice(0, address.lastIndexOf('.'))
		const gma3ObjectNumber = address.slice(address.lastIndexOf('.') + 1)
		this.log('debug', `OSC received: ${uncleanedGma3Address} + ${gma3ObjectNumber}}`)

		let gma3Address

		if (uncleanedGma3Address.includes('/')) {
			this.log('debug', `OSC address contains prefix: ${uncleanedGma3Address}`)
			const splitter = uncleanedGma3Address.split('/') // "/test/14.14..."
			const prefix = splitter[1]
			gma3Address = splitter[2]

			//only check prefix if anything is set in the config
			if (this.config.outputPrefix && prefix !== this.config.outputPrefix) {
				this.log('debug', `OSC message with invalid prefix received: ${prefix} (expected: ${this.config.outputPrefix})`)
				return
			}
		}

		switch (gma3Address) {
			case '14.14.1.6': {
				const buttonName = args[0]
				const infos = args[2]

				let state
				if (buttonName.includes('Fader')) {
					state = Number(infos) > 0 ? 1 : 0
				} else {
					state = args[1]
				}

				const seqNumber = Number(gma3ObjectNumber)

				let sequences = this.seqCache.get('sequence_state') as SequenceActiveState[]
				if (!sequences) {
					sequences = []
				}

				const existingIndex = sequences.findIndex((seq) => seq.seqNumber === seqNumber)
				const prevState = existingIndex >= 0 ? sequences[existingIndex] : null
				const hasChanged = !prevState || prevState.state !== state

				if (!hasChanged) {
					break
				}

				if (existingIndex >= 0) {
					sequences[existingIndex] = { seqNumber, state }
				} else {
					sequences.push({ seqNumber, state })
				}

				this.seqCache.set('sequence_state', sequences)

				this.log('debug', `State of ${gma3Address} (SEQ) is now ${state} (Seq: ${seqNumber}})`)

				this.checkFeedbacks('sequence_active')
				break
			}
			default:
				break
		}
	}

	handlePluginMessage(path: string[], args: any[]): void {
		const now = Date.now()
		const change = this.consoleStatus.apply(path, args, now)
		if (!change) {
			this.log('debug', `Unknown plugin message: /${path.join('/')}`)
			return
		}

		if (change.lifecycle === 'bye') {
			this.log('info', 'CompanionFeedback plugin stopped on the console')
			this.setOnline(false, 'CompanionFeedback plugin was stopped on the console')
			return
		}
		if (change.lifecycle === 'hello') {
			this.log('info', `CompanionFeedback plugin ${this.consoleStatus.pluginVersion} started on the console`)
		}
		if (change.heartbeat && !this.consoleStatus.online) {
			this.setOnline(true)
			// We may have missed changes while offline (or this is a fresh start): ask for everything.
			if (change.lifecycle !== 'hello') this.requestRefresh()
		}

		if (change.newDefinitions) this.scheduleDefinitions()
		if (Object.keys(change.values).length > 0) this.setVariableValues(change.values)
		if (change.feedbacks.size > 0) this.checkFeedbacks(...change.feedbacks)
	}

	setOnline(online: boolean, why?: string): void {
		const was = this.consoleStatus.online
		this.consoleStatus.online = online
		this.offlineReported = !online
		if (online) {
			this.updateStatus(InstanceStatus.Ok)
		} else if (this.listening) {
			this.updateStatus(InstanceStatus.Disconnected, why ?? 'No heartbeat from the CompanionFeedback plugin')
		}
		if (was !== online) {
			this.setVariableValues({ console_online: online })
			this.checkFeedbacks(
				'console_online',
				'sequence_active',
				'sequence_cue',
				'sequence_fader',
				'executor_active',
				'executor_fader',
				'desk_locked',
			)
		}
	}

	/** Ask the plugin to resend every value on its next tick. */
	requestRefresh(): void {
		this.sendCommand('Plugin "CompanionFeedback" "refresh"')
	}

	sendCommand(command: string): void {
		if (!this.config.host || !this.config.port) return
		const path = (this.config.inputPrefix ? '/' + this.config.inputPrefix : '') + '/cmd'
		this.oscSend(this.config.host, this.config.port, path, [{ type: 's', value: command }])
	}

	private startedAt = 0

	private startWatchdog(): void {
		this.stopWatchdog()
		this.startedAt = Date.now()
		this.offlineReported = false
		this.watchdog = setInterval(() => this.checkHeartbeat(), WATCHDOG_EVERY_MS)
	}

	private stopWatchdog(): void {
		if (this.watchdog) clearInterval(this.watchdog)
		this.watchdog = null
	}

	private checkHeartbeat(): void {
		if (!this.config.usePlugin) return
		const now = Date.now()
		const last = this.consoleStatus.lastHeartbeat
		const timeoutMs = Math.max(2, Number(this.config.heartbeatTimeout) || 6) * 1000

		if (last) this.setVariableValues({ seconds_since_heartbeat: Math.floor((now - last) / 1000) })

		const stale = !last || now - last > timeoutMs
		if (stale && (this.consoleStatus.online || !this.offlineReported)) {
			// Give a fresh start one full timeout before calling it offline.
			if (this.consoleStatus.online || now - this.startedAt > timeoutMs) {
				this.log('warn', 'No heartbeat from the CompanionFeedback plugin, marking console offline')
				this.setOnline(false)
			}
		}
		if (stale && this.config.autoStartPlugin && now - this.lastAutoStart > AUTOSTART_EVERY_MS) {
			this.lastAutoStart = now
			this.log('info', 'Asking the console to start the CompanionFeedback plugin')
			this.sendCommand('Plugin "CompanionFeedback" "start"')
		}
	}

	private scheduleDefinitions(): void {
		if (this.defsTimer) return
		this.defsTimer = setTimeout(() => {
			this.defsTimer = null
			this.updateVariableDefinitions()
		}, 250)
	}

	updateVariableDefinitions(): void {
		this.setVariableDefinitions(this.consoleStatus.variableDefinitions())
		this.setVariableValues(this.consoleStatus.allValues(Date.now()))
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.consoleStatus.online = false
		this.updateActions()
		this.updateFeedbacks()
		await this.initOSC(config)
		this.startWatchdog()
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
