-- Companion Feedback for grandMA3
--
-- Sends live console status to Bitfocus Companion over OSC, so the
-- malighting-grandma3 Companion module can show cue names, fader levels,
-- playback state and a real "console online" status.
--
-- Run it once to start it. Run it again to stop it.
-- You can also pass an argument:
--   Plugin "CompanionFeedback" "start"    start (does nothing if already running)
--   Plugin "CompanionFeedback" "stop"     stop
--   Plugin "CompanionFeedback" "refresh"  resend everything on the next tick
--   Plugin "CompanionFeedback" "diag"     print what this console's Lua API offers
--
-- Companion can also ask for a full resend by setting the global variable
-- CompanionFeedbackRefresh. The Companion module sends Plugin "CompanionFeedback" "refresh"
-- by itself whenever it (re)connects.

local PLUGIN_VERSION = '0.1.2'

-- ---------------------------------------------------------------------------
-- Settings. Change these to suit your show.
-- ---------------------------------------------------------------------------
local CONFIG = {
	-- OSC lines (Menu > In & Out > OSC) that point at your Companion server(s).
	-- Use one line per Companion server, for example {2, 3, 4}.
	osc_lines = { 2 },

	-- First part of every address this plugin sends, e.g. /ma3/seq/1/cue
	root = 'ma3',

	-- How often to check the console, in seconds.
	interval = 0.2,

	-- How often to send the "I'm alive" heartbeat, in seconds.
	-- Companion marks the console offline when heartbeats stop.
	heartbeat = 2,

	-- Which sequences to watch: 'auto' watches every sequence in the pool
	-- (up to max_sequences), or list numbers, e.g. { 1, 2, 12 }.
	sequences = 'auto',
	max_sequences = 200,

	-- Which executors to watch on the current page.
	executors = { 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115,
		201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215 },

	-- Most messages sent per check. Extra changes wait for the next check,
	-- so a full resend is spread out instead of flooding the console.
	max_per_tick = 40,

	-- Set to true to print every message in the command line history (testing only).
	echo = false,
}

-- ---------------------------------------------------------------------------

local Cmd, Printf, ErrPrintf = Cmd, Printf, ErrPrintf
local pcall, tostring, tonumber, type, ipairs, pairs = pcall, tostring, tonumber, type, ipairs, pairs
local floor = math.floor

local running = false
local runId = 0
local last = {} -- last value sent per address
local forceAll = true
local hbCount = 0
local sendError = nil -- set when the console refuses a SendOSC

local function try(fn, ...)
	if type(fn) ~= 'function' then
		return nil
	end
	local ok, a, b = pcall(fn, ...)
	if ok then
		return a, b
	end
	return nil
end

-- Read a property or call a method on a handle without ever throwing.
local function prop(h, key)
	if h == nil then
		return nil
	end
	local ok, v = pcall(function()
		return h[key]
	end)
	if ok then
		return v
	end
	return nil
end

local function method(h, name, ...)
	if h == nil then
		return nil
	end
	local fn = prop(h, name)
	if type(fn) ~= 'function' then
		return nil
	end
	local args = { ... }
	local ok, a, b = pcall(function()
		return fn(h, table.unpack(args))
	end)
	if ok then
		return a, b
	end
	return nil
end

-- SendOSC splits on commas and the whole message sits in double quotes,
-- so strip those characters out of any text we send.
local function clean(s)
	s = tostring(s or '')
	s = s:gsub('"', "'")
	s = s:gsub('[,;%c]', ' ')
	s = s:gsub('%s+', ' ')
	s = s:gsub('^%s+', ''):gsub('%s+$', '')
	if #s > 120 then
		s = s:sub(1, 120)
	end
	return s
end

local function sendRaw(address, typeTag, value)
	if sendError then
		return false
	end
	local msg
	if typeTag == 's' then
		local text = clean(value)
		if text:match('^%s*$') then
			text = '-' -- empty strings don't survive SendOSC; Companion turns '-' back into ''
		end
		msg = '/' .. CONFIG.root .. address .. ',s,' .. text
	else
		msg = '/' .. CONFIG.root .. address .. ',' .. typeTag .. ',' .. tostring(value)
	end
	local ok = true
	for _, line in ipairs(CONFIG.osc_lines) do
		local result = Cmd('SendOSC ' .. line .. ' "' .. msg .. '"')
		if type(result) == 'string' and not result:upper():find('^OK') then
			ok = false
			sendError = 'OSC line ' .. tostring(line) .. ' refused the message (' .. result .. ')'
		end
	end
	if CONFIG.echo then
		Printf('CompanionFeedback: ' .. msg)
	end
	return ok
end

-- Changes waiting to go out. Latest value per address wins.
local queue, queued = {}, {}

-- Queue a value when it changed (or a full resend was asked for).
local function send(address, typeTag, value)
	local v = value
	if v == nil then
		v = (typeTag == 's') and '' or 0
	end
	if not forceAll and last[address] == v then
		return
	end
	last[address] = v
	if queued[address] == nil then
		queue[#queue + 1] = address
	end
	queued[address] = { typeTag, v }
end

local function flush()
	local n = math.min(#queue, CONFIG.max_per_tick)
	for i = 1, n do
		local address = queue[i]
		local item = queued[address]
		queued[address] = nil
		sendRaw(address, item[1], item[2])
	end
	if n > 0 then
		local rest = {}
		for i = n + 1, #queue do
			rest[#rest + 1] = queue[i]
		end
		queue = rest
	end
end

local function bool(v)
	return v and 1 or 0
end

local function round(v)
	v = tonumber(v)
	if not v then
		return 0
	end
	return floor(v + 0.5)
end

-- ---------------------------------------------------------------------------
-- Reading console state
-- ---------------------------------------------------------------------------

local function cueNumber(cue)
	if cue == nil then
		return ''
	end
	-- Ask for the display text first ("1.5"); fall back to the raw number.
	local roles = prop(Enums, 'Roles')
	local display = roles and prop(roles, 'Display')
	if display ~= nil then
		local s = method(cue, 'Get', 'No', display)
		if s ~= nil and tostring(s) ~= '' then
			return tostring(s)
		end
	end
	local n = prop(cue, 'no')
	if n == nil then
		return ''
	end
	return tostring(n)
end

local function same(a, b)
	if a == nil or b == nil then
		return a == b
	end
	if a == b then
		return true
	end
	local ia, ib = try(HandleToInt, a), try(HandleToInt, b)
	return ia ~= nil and ia == ib
end

local function isRealCue(cue)
	local name = prop(cue, 'name')
	return name ~= 'OffCue' and name ~= 'CueZero'
end

local function nextCueOf(seq, current)
	local cues = method(seq, 'Children')
	if type(cues) ~= 'table' then
		return nil
	end
	local found = (current == nil)
	for i = 1, #cues do
		local c = cues[i]
		if isRealCue(c) then
			if found then
				return c
			end
			if same(c, current) then
				found = true
			end
		end
	end
	return nil
end

local function sequencePool()
	local dp = try(DataPool)
	return dp and prop(dp, 'Sequences')
end

local function watchedSequences()
	local list = {}
	local pool = sequencePool()
	if pool == nil then
		return list
	end
	if CONFIG.sequences == 'auto' then
		local children = method(pool, 'Children') or {}
		for i = 1, #children do
			if #list >= CONFIG.max_sequences then
				break
			end
			local no = prop(children[i], 'no')
			if no then
				list[#list + 1] = { no = no, h = children[i] }
			end
		end
	else
		for _, no in ipairs(CONFIG.sequences) do
			local h = prop(pool, no)
			if h then
				list[#list + 1] = { no = no, h = h }
			end
		end
	end
	return list
end

local seqCurrent = {} -- seq no -> current cue handle, to only rescan "next" when it moves

local function pollSequence(no, seq)
	local base = '/seq/' .. no
	send(base .. '/name', 's', prop(seq, 'name'))
	send(base .. '/active', 'i', bool(method(seq, 'HasActivePlayback')))
	send(base .. '/fader', 'i', round(method(seq, 'GetFader', {})))

	local cue = method(seq, 'CurrentChild')
	if cue ~= nil and not isRealCue(cue) then
		cue = nil
	end
	send(base .. '/cue', 's', cueNumber(cue))
	send(base .. '/cuename', 's', cue and prop(cue, 'name') or '')

	if forceAll or not same(seqCurrent[no], cue) then
		seqCurrent[no] = cue
		local nxt = nextCueOf(seq, cue)
		send(base .. '/nextcue', 's', cueNumber(nxt))
		send(base .. '/nextcuename', 's', nxt and prop(nxt, 'name') or '')
	end
end

local function pollExecutor(no)
	local base = '/exec/' .. no
	local exec = try(GetExecutor, no)
	local obj = exec and prop(exec, 'Object')
	send(base .. '/name', 's', obj and prop(obj, 'name') or '')
	send(base .. '/fader', 'i', exec and round(method(exec, 'GetFader', {})) or 0)
	send(base .. '/active', 'i', obj and bool(method(obj, 'HasActivePlayback')) or 0)
	local seqNo = 0
	if obj and method(obj, 'GetClass') == 'Sequence' then
		seqNo = prop(obj, 'no') or 0
	end
	send(base .. '/seq', 'i', seqNo)
end

local function showFileName()
	local root = try(Root)
	local sock = root and prop(root, 'manetsocket')
	return sock and prop(sock, 'showfile') or ''
end

local function pollInfo()
	send('/info/version', 's', try(Version) or try(ReleaseType) or '')
	send('/info/show', 's', showFileName())
	send('/info/showstatus', 's', try(GetShowFileStatus) or '')
	local user = try(CurrentUser)
	send('/info/user', 's', user and prop(user, 'name') or '')
	send('/info/host', 's', try(HostType) or '')
	send('/info/locked', 'i', bool(try(DeskLocked)))
	local page = try(CurrentExecPage)
	send('/info/page', 'i', page and prop(page, 'no') or 0)
	send('/info/pagename', 's', page and prop(page, 'name') or '')
end

local function refreshRequested()
	local gv = try(GlobalVars)
	if gv == nil then
		return false
	end
	local v = try(GetVar, gv, 'CompanionFeedbackRefresh')
	if v ~= nil and tostring(v) ~= '' and tostring(v) ~= '0' then
		try(DelVar, gv, 'CompanionFeedbackRefresh')
		return true
	end
	return false
end

-- ---------------------------------------------------------------------------
-- Main loop
-- ---------------------------------------------------------------------------

local function tick()
	if refreshRequested() then
		forceAll = true
	end
	pollInfo()
	for _, s in ipairs(watchedSequences()) do
		pollSequence(s.no, s.h)
	end
	for _, no in ipairs(CONFIG.executors) do
		pollExecutor(no)
	end
	forceAll = false
end

local function loop(myRun)
	local sinceBeat = CONFIG.heartbeat -- beat straight away
	while running and runId == myRun do
		local ok, err = pcall(tick)
		if not ok then
			ErrPrintf('CompanionFeedback: ' .. tostring(err))
		end
		flush()
		if sendError then
			running = false
			ErrPrintf('CompanionFeedback stopped: ' .. sendError .. '.')
			ErrPrintf('Check Menu > In & Out > OSC: the line number(s) in osc_lines must exist and have Send Command = Yes. ' ..
				'Lines are numbered from 1 at the top. Then run the plugin again.')
			return
		end
		sinceBeat = sinceBeat + CONFIG.interval
		if sinceBeat >= CONFIG.heartbeat then
			sinceBeat = 0
			hbCount = hbCount + 1
			sendRaw('/hb', 'i', hbCount)
		end
		coroutine.yield(CONFIG.interval)
	end
end

local function start()
	if running then
		Printf('CompanionFeedback is already running.')
		return
	end
	running = true
	runId = runId + 1
	last, seqCurrent, forceAll = {}, {}, true
	queue, queued = {}, {}
	sendError = nil
	Printf('CompanionFeedback ' .. PLUGIN_VERSION .. ' started. Sending to OSC line(s) ' ..
		table.concat(CONFIG.osc_lines, ', ') .. '.')
	sendRaw('/hello', 's', PLUGIN_VERSION)
	loop(runId)
end

local function stop()
	if not running then
		return
	end
	running = false
	sendRaw('/bye', 'i', 1)
	Printf('CompanionFeedback stopped.')
end

local function diag()
	local function has(name)
		return type(_G[name]) == 'function' and 'yes' or 'NO'
	end
	Printf('=== CompanionFeedback ' .. PLUGIN_VERSION .. ' diagnostics ===')
	for _, n in ipairs({ 'DataPool', 'GetExecutor', 'CurrentExecPage', 'CurrentUser', 'Version',
		'GetShowFileStatus', 'GlobalVars', 'GetVar', 'DelVar', 'HostType', 'DeskLocked', 'Root' }) do
		Printf('  ' .. n .. ': ' .. has(n))
	end
	Printf('  Version: ' .. tostring(try(Version)))
	Printf('  Show file: ' .. tostring(showFileName()))
	local seqs = watchedSequences()
	Printf('  Sequences watched: ' .. #seqs)
	local s = seqs[1]
	if s then
		local cue = method(s.h, 'CurrentChild')
		Printf('  Seq ' .. s.no .. ' "' .. tostring(prop(s.h, 'name')) .. '": active=' ..
			tostring(method(s.h, 'HasActivePlayback')) .. ' fader=' .. tostring(method(s.h, 'GetFader', {})) ..
			' CurrentChild=' .. tostring(cue ~= nil) .. ' cue=' .. cueNumber(cue) ..
			' cuename=' .. tostring(cue and prop(cue, 'name')))
	end
	local exec = try(GetExecutor, CONFIG.executors[1])
	Printf('  Exec ' .. tostring(CONFIG.executors[1]) .. ': ' .. tostring(exec ~= nil) ..
		' object=' .. tostring(exec and prop(prop(exec, 'Object'), 'name')))
	Printf('  OSC lines: ' .. table.concat(CONFIG.osc_lines, ', ') .. '  running=' .. tostring(running))
end

return function(display, argument)
	local arg = argument and tostring(argument):lower() or ''
	if arg == 'start' then
		start()
	elseif arg == 'stop' then
		stop()
	elseif arg == 'refresh' then
		forceAll = true
		Printf('CompanionFeedback: resending everything' .. (running and '' or ' (not running, start it first)'))
	elseif arg == 'diag' then
		diag()
	elseif running then
		stop()
	else
		start()
	end
end
