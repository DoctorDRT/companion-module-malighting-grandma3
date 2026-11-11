import type {
	CompanionStaticUpgradeProps,
	CompanionStaticUpgradeResult,
	CompanionStaticUpgradeScript,
	CompanionUpgradeContext,
} from '@companion-module/base'
import type { ModuleConfig } from './config.js'

function updateExecButtonPageFromDropdownToInteger(
	_context: CompanionUpgradeContext<ModuleConfig>,
	props: CompanionStaticUpgradeProps<ModuleConfig>,
): CompanionStaticUpgradeResult<ModuleConfig> {
	const result: CompanionStaticUpgradeResult<ModuleConfig> = {
		updatedActions: [],
		updatedConfig: null,
		updatedFeedbacks: [],
	}

	for (const action of props.actions) {
		if (
			action.actionId === 'exec_button' &&
			typeof action.options.page === 'string' &&
			!isNaN(parseInt(action.options.page))
		) {
			action.options.page = parseInt(action.options.page)
			result.updatedActions.push(action)
		}
	}

	return result
}

function migratePrefixAndPorts(
	_context: CompanionUpgradeContext<ModuleConfig>,
	props: CompanionStaticUpgradeProps<ModuleConfig>,
): CompanionStaticUpgradeResult<ModuleConfig> {
	const result: CompanionStaticUpgradeResult<ModuleConfig> = {
		updatedActions: [],
		updatedConfig: null,
		updatedFeedbacks: [],
	}
	const cfg = props.config as (ModuleConfig & { prefix?: string }) | null
	if (!cfg) return result

	let changed = false
	if (cfg.inputPrefix === undefined) {
		cfg.inputPrefix = cfg.prefix ?? ''
		delete cfg.prefix
		changed = true
	}
	if (cfg.outputPrefix === undefined) {
		cfg.outputPrefix = ''
		changed = true
	}
	if (cfg.feedbackPort === undefined) {
		cfg.feedbackPort = '8082'
		changed = true
	}

	if (changed) result.updatedConfig = cfg
	return result
}

// Existing connections keep the old behaviour (status = port open) until the plugin is set up.
function addPluginStatusConfig(
	_context: CompanionUpgradeContext<ModuleConfig>,
	props: CompanionStaticUpgradeProps<ModuleConfig>,
): CompanionStaticUpgradeResult<ModuleConfig> {
	const result: CompanionStaticUpgradeResult<ModuleConfig> = {
		updatedActions: [],
		updatedConfig: null,
		updatedFeedbacks: [],
	}
	const cfg = props.config
	if (!cfg || cfg.usePlugin !== undefined) return result
	cfg.usePlugin = false
	cfg.pluginRoot = 'ma3'
	cfg.heartbeatTimeout = 6
	cfg.autoStartPlugin = false
	result.updatedConfig = cfg
	return result
}

export const UpgradeScripts: CompanionStaticUpgradeScript<ModuleConfig>[] = [
	updateExecButtonPageFromDropdownToInteger,
	migratePrefixAndPorts,
	addPluginStatusConfig,
	/*
	 * Place your upgrade scripts here
	 * Remember that once it has been added it cannot be removed!
	 */
	// function (context, props) {
	// 	return {
	// 		updatedConfig: null,
	// 		updatedActions: [],
	// 		updatedFeedbacks: [],
	// 	}
	// },
]
