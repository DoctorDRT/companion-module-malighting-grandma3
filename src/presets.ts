import { combineRgb, type CompanionPresetDefinitions } from '@companion-module/base'

const BLACK = combineRgb(0, 0, 0)
const WHITE = combineRgb(255, 255, 255)
const GREEN = combineRgb(0, 200, 0)
const DARK_RED = combineRgb(120, 0, 0)
const AMBER = combineRgb(255, 170, 0)

export function GetPresets(label: string): CompanionPresetDefinitions {
	const v = (name: string): string => `$(${label}:${name})`
	const presets: CompanionPresetDefinitions = {
		console_status: {
			type: 'button',
			category: 'Console status',
			name: 'Console online',
			style: {
				text: `MA3\n${v('show_file')}`,
				size: '14',
				color: WHITE,
				bgcolor: DARK_RED,
			},
			steps: [{ down: [{ actionId: 'request_refresh', options: {} }], up: [] }],
			feedbacks: [{ feedbackId: 'console_online', options: {}, style: { bgcolor: GREEN, color: BLACK } }],
		},
		page_status: {
			type: 'button',
			category: 'Console status',
			name: 'Current page',
			style: {
				text: `PAGE ${v('page')}\n${v('page_name')}`,
				size: '14',
				color: WHITE,
				bgcolor: BLACK,
			},
			steps: [],
			feedbacks: [],
		},
	}

	for (let seq = 1; seq <= 4; seq++) {
		presets[`seq_${seq}_go`] = {
			type: 'button',
			category: 'Sequence with live cue',
			name: `Sequence ${seq}: Go+ with cue name`,
			style: {
				text: `${v(`seq_${seq}_name`)}\n${v(`seq_${seq}_cue`)} ${v(`seq_${seq}_cue_name`)}`,
				size: '14',
				color: WHITE,
				bgcolor: BLACK,
			},
			steps: [{ down: [{ actionId: 'command', options: { command: `Go+ Sequence ${seq}` } }], up: [] }],
			feedbacks: [
				{ feedbackId: 'sequence_active', options: { sequence_number: seq }, style: { bgcolor: GREEN, color: BLACK } },
			],
		}
		presets[`seq_${seq}_next`] = {
			type: 'button',
			category: 'Sequence with live cue',
			name: `Sequence ${seq}: next cue`,
			style: {
				text: `NEXT\n${v(`seq_${seq}_next_cue`)} ${v(`seq_${seq}_next_cue_name`)}`,
				size: '14',
				color: AMBER,
				bgcolor: BLACK,
			},
			steps: [],
			feedbacks: [],
		}
	}

	for (const exec of [201, 202, 203, 204, 205]) {
		presets[`exec_${exec}`] = {
			type: 'button',
			category: 'Executor with live status',
			name: `Executor ${exec}`,
			style: {
				text: `${v(`exec_${exec}_name`)}\n${v(`exec_${exec}_fader`)}%`,
				size: '14',
				color: WHITE,
				bgcolor: BLACK,
			},
			steps: [
				{
					down: [
						{
							actionId: 'exec_button',
							options: { current_page: true, page: 1, button_number: exec, button_state: 'push' },
						},
					],
					up: [
						{
							actionId: 'exec_button',
							options: { current_page: true, page: 1, button_number: exec, button_state: 'release' },
						},
					],
				},
			],
			feedbacks: [
				{ feedbackId: 'executor_active', options: { executor: exec }, style: { bgcolor: GREEN, color: BLACK } },
			],
		}
	}

	return presets
}
