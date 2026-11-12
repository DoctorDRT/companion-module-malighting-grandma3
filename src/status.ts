// Live console status pushed by the CompanionFeedback grandMA3 plugin.
//
// The plugin sends single OSC messages shaped like
//   [/outputPrefix]/<root>/hb           ,i  counter (heartbeat)
//   [/outputPrefix]/<root>/hello        ,s  plugin version (plugin started)
//   [/outputPrefix]/<root>/bye          ,i  1 (plugin stopped)
//   [/outputPrefix]/<root>/info/<key>   ,s|i
//   [/outputPrefix]/<root>/seq/<n>/<key>  ,s|i
//   [/outputPrefix]/<root>/exec/<n>/<key> ,s|i
// and only sends a value when it changes.

import type { CompanionVariableDefinition, CompanionVariableValues } from '@companion-module/base'

export type SeqState = {
	name: string
	active: boolean
	fader: number
	cue: string
	cueName: string
	nextCue: string
	nextCueName: string
}

export type ExecState = {
	name: string
	fader: number
	active: boolean
	seq: number
}

export type InfoState = {
	version: string
	show: string
	showStatus: string
	user: string
	host: string
	locked: boolean
	page: number
	pageName: string
}

export type StatusChange = {
	/** Something that feedbacks depend on changed. */
	feedbacks: Set<string>
	/** Variable values to push. */
	values: CompanionVariableValues
	/** A sequence or executor appeared for the first time, so variable definitions must be rebuilt. */
	newDefinitions: boolean
	/** The plugin said hello (just started) or bye (just stopped). */
	lifecycle?: 'hello' | 'bye'
	heartbeat: boolean
}

const SEQ_KEYS: Record<string, keyof SeqState> = {
	name: 'name',
	active: 'active',
	fader: 'fader',
	cue: 'cue',
	cuename: 'cueName',
	nextcue: 'nextCue',
	nextcuename: 'nextCueName',
}

const EXEC_KEYS: Record<string, keyof ExecState> = {
	name: 'name',
	fader: 'fader',
	active: 'active',
	seq: 'seq',
}

const INFO_KEYS: Record<string, keyof InfoState> = {
	version: 'version',
	show: 'show',
	showstatus: 'showStatus',
	user: 'user',
	host: 'host',
	locked: 'locked',
	page: 'page',
	pagename: 'pageName',
}

const SEQ_VAR: Record<keyof SeqState, string> = {
	name: 'name',
	active: 'active',
	fader: 'fader',
	cue: 'cue',
	cueName: 'cue_name',
	nextCue: 'next_cue',
	nextCueName: 'next_cue_name',
}

const EXEC_VAR: Record<keyof ExecState, string> = {
	name: 'name',
	fader: 'fader',
	active: 'active',
	seq: 'sequence',
}

const INFO_VAR: Record<keyof InfoState, string> = {
	version: 'console_version',
	show: 'show_file',
	showStatus: 'show_status',
	user: 'console_user',
	host: 'console_type',
	locked: 'desk_locked',
	page: 'page',
	pageName: 'page_name',
}

const BOOL_KEYS = new Set(['active', 'locked'])
const NUM_KEYS = new Set(['fader', 'seq', 'page'])

function emptySeq(): SeqState {
	return { name: '', active: false, fader: 0, cue: '', cueName: '', nextCue: '', nextCueName: '' }
}

function emptyExec(): ExecState {
	return { name: '', fader: 0, active: false, seq: 0 }
}

function emptyInfo(): InfoState {
	return { version: '', show: '', showStatus: '', user: '', host: '', locked: false, page: 0, pageName: '' }
}

type OscArg = string | number | boolean | null | undefined

function coerce(key: string, raw: OscArg): string | number | boolean {
	if (BOOL_KEYS.has(key)) return Number(raw) > 0
	if (NUM_KEYS.has(key)) {
		const n = Number(raw)
		return Number.isFinite(n) ? n : 0
	}
	const text = raw === undefined || raw === null ? '' : String(raw).trim()
	// The plugin sends '-' for an empty string, because SendOSC can't send an empty one.
	return text === '-' ? '' : text
}

export class ConsoleStatus {
	info: InfoState = emptyInfo()
	seqs = new Map<number, SeqState>()
	execs = new Map<number, ExecState>()
	pluginVersion = ''
	lastHeartbeat = 0
	online = false

	reset(): void {
		this.info = emptyInfo()
		this.seqs.clear()
		this.execs.clear()
		this.pluginVersion = ''
		this.lastHeartbeat = 0
		this.online = false
	}

	/**
	 * Strip the optional output prefix and plugin root from an address.
	 * Returns the remaining path parts, or null if this message isn't from the plugin.
	 */
	static matchAddress(address: string, root: string, prefix: string): string[] | null {
		const parts = address.split('/').filter((p) => p !== '')
		if (prefix && parts[0] === prefix) parts.shift()
		if (parts[0] !== root) return null
		return parts.slice(1)
	}

	/** Apply one plugin message. Returns what changed, or null if the message wasn't understood. */
	apply(path: string[], args: OscArg[], now: number): StatusChange | null {
		const change: StatusChange = { feedbacks: new Set(), values: {}, newDefinitions: false, heartbeat: false }
		const value = args[0]
		const [kind, a, b] = path

		switch (kind) {
			case 'hb':
				change.heartbeat = true
				break
			case 'hello':
				change.heartbeat = true
				change.lifecycle = 'hello'
				this.pluginVersion = String(value ?? '')
				change.values.plugin_version = this.pluginVersion
				break
			case 'bye':
				change.lifecycle = 'bye'
				break
			case 'info': {
				const key = INFO_KEYS[a]
				if (!key) return null
				const v = coerce(a, value)
				if (this.info[key] === v) return change
				;(this.info as Record<string, unknown>)[key] = v
				change.values[INFO_VAR[key]] = v
				if (key === 'locked') change.feedbacks.add('desk_locked')
				break
			}
			case 'seq': {
				const no = Number(a)
				const key = SEQ_KEYS[b]
				if (!Number.isInteger(no) || !key) return null
				let seq = this.seqs.get(no)
				if (!seq) {
					seq = emptySeq()
					this.seqs.set(no, seq)
					change.newDefinitions = true
				}
				const v = coerce(b, value)
				if (seq[key] === v) return change
				;(seq as Record<string, unknown>)[key] = v
				change.values[`seq_${no}_${SEQ_VAR[key]}`] = v
				if (key === 'active') change.feedbacks.add('sequence_active')
				if (key === 'cue' || key === 'active') change.feedbacks.add('sequence_cue')
				if (key === 'fader') change.feedbacks.add('sequence_fader')
				break
			}
			case 'exec': {
				const no = Number(a)
				const key = EXEC_KEYS[b]
				if (!Number.isInteger(no) || !key) return null
				let exec = this.execs.get(no)
				if (!exec) {
					exec = emptyExec()
					this.execs.set(no, exec)
					change.newDefinitions = true
				}
				const v = coerce(b, value)
				if (exec[key] === v) return change
				;(exec as Record<string, unknown>)[key] = v
				change.values[`exec_${no}_${EXEC_VAR[key]}`] = v
				if (key === 'active') change.feedbacks.add('executor_active')
				if (key === 'fader') change.feedbacks.add('executor_fader')
				break
			}
			default:
				return null
		}

		if (change.heartbeat) this.lastHeartbeat = now
		return change
	}

	variableDefinitions(): CompanionVariableDefinition[] {
		const defs: CompanionVariableDefinition[] = [
			{ variableId: 'console_online', name: 'Console online (plugin heartbeat seen)' },
			{ variableId: 'plugin_version', name: 'CompanionFeedback plugin version' },
			{ variableId: 'console_version', name: 'Console software version' },
			{ variableId: 'show_file', name: 'Show file name' },
			{ variableId: 'show_status', name: 'Show file status' },
			{ variableId: 'console_user', name: 'Logged in user' },
			{ variableId: 'console_type', name: 'Console type (console / onPC)' },
			{ variableId: 'desk_locked', name: 'Desk locked' },
			{ variableId: 'page', name: 'Current executor page number' },
			{ variableId: 'page_name', name: 'Current executor page name' },
			{ variableId: 'seconds_since_heartbeat', name: 'Seconds since last heartbeat' },
		]
		for (const no of [...this.seqs.keys()].sort((x, y) => x - y)) {
			defs.push(
				{ variableId: `seq_${no}_name`, name: `Sequence ${no}: name` },
				{ variableId: `seq_${no}_active`, name: `Sequence ${no}: on` },
				{ variableId: `seq_${no}_fader`, name: `Sequence ${no}: master fader %` },
				{ variableId: `seq_${no}_cue`, name: `Sequence ${no}: current cue number` },
				{ variableId: `seq_${no}_cue_name`, name: `Sequence ${no}: current cue name` },
				{ variableId: `seq_${no}_next_cue`, name: `Sequence ${no}: next cue number` },
				{ variableId: `seq_${no}_next_cue_name`, name: `Sequence ${no}: next cue name` },
			)
		}
		for (const no of [...this.execs.keys()].sort((x, y) => x - y)) {
			defs.push(
				{ variableId: `exec_${no}_name`, name: `Executor ${no} (current page): name` },
				{ variableId: `exec_${no}_fader`, name: `Executor ${no} (current page): fader %` },
				{ variableId: `exec_${no}_active`, name: `Executor ${no} (current page): on` },
				{ variableId: `exec_${no}_sequence`, name: `Executor ${no} (current page): sequence number` },
			)
		}
		return defs
	}

	/** Every current value, for after definitions are rebuilt. */
	allValues(now: number): CompanionVariableValues {
		const v: CompanionVariableValues = {
			console_online: this.online,
			plugin_version: this.pluginVersion,
			seconds_since_heartbeat: this.lastHeartbeat ? Math.floor((now - this.lastHeartbeat) / 1000) : '',
		}
		for (const [key, id] of Object.entries(INFO_VAR)) v[id] = this.info[key as keyof InfoState]
		for (const [no, seq] of this.seqs) {
			for (const [key, id] of Object.entries(SEQ_VAR)) v[`seq_${no}_${id}`] = seq[key as keyof SeqState]
		}
		for (const [no, exec] of this.execs) {
			for (const [key, id] of Object.entries(EXEC_VAR)) v[`exec_${no}_${id}`] = exec[key as keyof ExecState]
		}
		return v
	}
}
