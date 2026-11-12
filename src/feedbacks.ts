import { combineRgb } from '@companion-module/base'
import type { ModuleInstance } from './main.js'
import { SequenceActiveState } from './cache.js'

const GREEN = combineRgb(0, 200, 0)
const RED = combineRgb(200, 0, 0)
const BLACK = combineRgb(0, 0, 0)
const WHITE = combineRgb(255, 255, 255)

function compare(value: number, op: unknown, threshold: number): boolean {
	switch (op) {
		case 'lt':
			return value < threshold
		case 'eq':
			return value === threshold
		case 'gte':
		default:
			return value >= threshold
	}
}

const COMPARE_OPTION = {
	type: 'dropdown' as const,
	label: 'Is',
	id: 'op',
	default: 'gte',
	choices: [
		{ id: 'gte', label: 'at or above' },
		{ id: 'lt', label: 'below' },
		{ id: 'eq', label: 'exactly' },
	],
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const status = self.consoleStatus

	self.setFeedbackDefinitions({
		console_online: {
			type: 'boolean',
			name: 'Console online (plugin heartbeat)',
			description: 'True while heartbeats arrive from the CompanionFeedback plugin on the console.',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [],
			callback: () => status.online,
		},
		sequence_active: {
			type: 'boolean',
			name: 'Check if a sequence is active',
			defaultStyle: {
				bgcolor: 0x00ff00,
				color: 0x000000,
			},
			options: [
				{
					type: 'number',
					label: 'Sequence Number',
					id: 'sequence_number',
					min: 1,
					max: 9999,
					default: 1,
				},
			],
			callback: (feedback) => {
				const no = Number(feedback.options.sequence_number)

				// Plugin data wins when we have it.
				const live = status.seqs.get(no)
				if (live && status.online) return live.active

				const sequences = self.seqCache.get('sequence_state') as SequenceActiveState[]
				if (!sequences || sequences.length === 0) {
					return false
				}
				const matchingSeq = sequences.find((seq) => seq.seqNumber === no)
				return !!matchingSeq && matchingSeq.state === 1
			},
		},
		sequence_cue: {
			type: 'boolean',
			name: 'Sequence is on a cue',
			description: 'Needs the CompanionFeedback plugin. Compares the current cue number, e.g. 3 or 3.5.',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [
				{ type: 'number', label: 'Sequence Number', id: 'sequence_number', min: 1, max: 9999, default: 1 },
				{ type: 'textinput', label: 'Cue Number', id: 'cue', default: '1', useVariables: true },
				{ type: 'checkbox', label: 'Only while the sequence is on', id: 'require_active', default: true },
			],
			callback: async (feedback, context) => {
				const seq = status.seqs.get(Number(feedback.options.sequence_number))
				if (!seq || !status.online) return false
				if (feedback.options.require_active && !seq.active) return false
				const want = (await context.parseVariablesInString(String(feedback.options.cue ?? ''))).trim()
				if (want === '' || seq.cue === '') return false
				const a = Number(want)
				const b = Number(seq.cue)
				if (Number.isFinite(a) && Number.isFinite(b)) return a === b
				return want === seq.cue
			},
		},
		sequence_fader: {
			type: 'boolean',
			name: 'Sequence master fader level',
			description: 'Needs the CompanionFeedback plugin.',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [
				{ type: 'number', label: 'Sequence Number', id: 'sequence_number', min: 1, max: 9999, default: 1 },
				COMPARE_OPTION,
				{ type: 'number', label: 'Level %', id: 'level', min: 0, max: 100, default: 100 },
			],
			callback: (feedback) => {
				const seq = status.seqs.get(Number(feedback.options.sequence_number))
				if (!seq || !status.online) return false
				return compare(seq.fader, feedback.options.op, Number(feedback.options.level))
			},
		},
		executor_active: {
			type: 'boolean',
			name: 'Executor is on (current page)',
			description: 'Needs the CompanionFeedback plugin, and the executor must be in its watch list.',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [{ type: 'number', label: 'Executor', id: 'executor', min: 101, max: 490, default: 201 }],
			callback: (feedback) => {
				const exec = status.execs.get(Number(feedback.options.executor))
				return !!exec && status.online && exec.active
			},
		},
		executor_fader: {
			type: 'boolean',
			name: 'Executor fader level (current page)',
			description: 'Needs the CompanionFeedback plugin, and the executor must be in its watch list.',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [
				{ type: 'number', label: 'Executor', id: 'executor', min: 101, max: 490, default: 201 },
				COMPARE_OPTION,
				{ type: 'number', label: 'Level %', id: 'level', min: 0, max: 100, default: 100 },
			],
			callback: (feedback) => {
				const exec = status.execs.get(Number(feedback.options.executor))
				if (!exec || !status.online) return false
				return compare(exec.fader, feedback.options.op, Number(feedback.options.level))
			},
		},
		desk_locked: {
			type: 'boolean',
			name: 'Desk is locked',
			description: 'Needs the CompanionFeedback plugin.',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [],
			callback: () => status.online && status.info.locked,
		},
	})
}
