import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export interface ModuleConfig {
	host: string
	port: number
	inputPrefix: string
	outputPrefix: string
	feedbackPort: string
	usePlugin: boolean
	pluginRoot: string
	heartbeatTimeout: number
	autoStartPlugin: boolean
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Information',
			value:
				'This module uses OSC in grandMA3. For more information please visit <a href="https://help.malighting.com/grandMA3/2.3/HTML/remote_inputs_osc.html" target="_blank">this link</a>.<br>' +
				'<br>Here is an short explanaiton for the configuration fields below:' +
				'<br>- gMA3 Input Port / Prefix = Companion -> gMA3' +
				'<br>- gMA3 Output Port / Prefix = gMA3 -> Companion<br>' +
				'<br><b>Important:</b> Prefixes are only being considered if they are set, if not, any message gets through.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'grandMA3 Console IP',
			width: 6,
			regex: Regex.IP,
			default: '127.0.0.1',
		},
		{
			type: 'textinput',
			id: 'port',
			label: 'grandMA3 Input Port',
			width: 6,
			regex: Regex.PORT,
			default: '8081',
		},
		{
			type: 'textinput',
			id: 'inputPrefix',
			label: 'grandMA3 Input Prefix',
			width: 6,
			default: '',
		},
		{
			type: 'textinput',
			id: 'feedbackPort',
			label: 'grandMA3 Output Port',
			width: 6,
			default: '8082',
			regex: Regex.PORT,
		},
		{
			type: 'textinput',
			id: 'outputPrefix',
			label: 'grandMA3 Output Prefix',
			width: 6,
			default: '',
		},
		{
			type: 'static-text',
			id: 'pluginInfo',
			width: 12,
			label: 'Live console status',
			value:
				'Import and run the <b>CompanionFeedback</b> plugin on the console to get live cue names, fader levels, playback state and a real online/offline status. ' +
				'It sends to the OSC line(s) set at the top of the plugin, which must point at this computer on the Output Port above with "Enable Output" on. See the help page for setup steps.',
		},
		{
			type: 'checkbox',
			id: 'usePlugin',
			label: 'Use CompanionFeedback plugin for status',
			tooltip: 'When on, the connection only shows OK while heartbeats arrive from the console plugin.',
			width: 6,
			default: true,
		},
		{
			type: 'textinput',
			id: 'pluginRoot',
			label: 'Plugin address root',
			tooltip: 'Must match CONFIG.root in the plugin. Default: ma3',
			width: 6,
			default: 'ma3',
			isVisibleExpression: '$(options:usePlugin)',
		},
		{
			type: 'number',
			id: 'heartbeatTimeout',
			label: 'Offline after no heartbeat for (seconds)',
			width: 6,
			min: 2,
			max: 120,
			default: 6,
			isVisibleExpression: '$(options:usePlugin)',
		},
		{
			type: 'checkbox',
			id: 'autoStartPlugin',
			label: 'Start the plugin on the console if it is not running',
			tooltip: 'Sends Plugin "CompanionFeedback" "start" at most every 30 seconds while no heartbeat arrives.',
			width: 6,
			default: false,
			isVisibleExpression: '$(options:usePlugin)',
		},
	]
}
