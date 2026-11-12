# GrandMA3 Connection

Connection to control your grandMA3 Software via OSC.

# Installation

1. In configuration tab specify the "Console IP", "Console OSC Port" and "Prefix" you want to send on.
2. Configure OSC (Settings -> In&Out) with the same settings as set in the configuration tab. (Same IP, Port & Prefix). Make sure to check "Receive Command" and "Receive", if not checked, the plugin will not work. [Tutorial](https://help2.malighting.com/Page/grandMA3/remote_inputs_osc/en/1.9)
3. Create a button, select action and start!

# Live console status (CompanionFeedback plugin)

On its own, OSC only lets Companion send to the console. To get live status back (cue names, fader levels, what's running, and a real online/offline status), run the small **CompanionFeedback** Lua plugin on the console. It sends to Companion only when something changes, plus a heartbeat every 2 seconds.

**Setup**

1. In grandMA3, go to **Menu > In & Out > OSC** and add a line for each Companion computer: Destination IP = the Companion computer, Port = this connection's **grandMA3 Output Port** (default 8082), **Send** = Yes, **Send Command** = Yes. Turn on **Enable Output**. Note the line number(s).
2. Import the plugin: copy the `grandMA3-plugin/CompanionFeedback` folder to `gma3_library/datapools/plugins` on a USB stick (or the onPC library folder), then import it into the Plugins pool.
3. Edit the settings at the top of the plugin: set `osc_lines` to the line number(s) from step 1. You can also choose which sequences and executors to watch.
4. Run the plugin (tap it in the Plugins pool, or type `Plugin "CompanionFeedback"`). Running it again stops it. `Plugin "CompanionFeedback" "diag"` prints a self-check.
5. In this connection's settings, keep **Use CompanionFeedback plugin for status** on. Turn on **Start the plugin on the console if it is not running** if you want Companion to start it after a show load or restart.

**What you get**

- Connection status is OK only while heartbeats arrive. It goes to Disconnected after the timeout (default 6 s) or as soon as the plugin is stopped.
- Variables: `console_online`, `show_file`, `show_status`, `console_version`, `console_user`, `console_type`, `desk_locked`, `page`, `page_name`, `seconds_since_heartbeat`, `plugin_version`.
- For each sequence: `seq_N_name`, `seq_N_active`, `seq_N_fader`, `seq_N_cue`, `seq_N_cue_name`, `seq_N_next_cue`, `seq_N_next_cue_name`.
- For each watched executor on the current page: `exec_N_name`, `exec_N_fader`, `exec_N_active`, `exec_N_sequence`.
- Feedbacks: Console online, Sequence is on a cue, Sequence master fader level, Executor is on, Executor fader level, Desk is locked. "Check if a sequence is active" uses the plugin's data when it is available.
- Actions: ask the plugin to resend everything, and start or stop the plugin.
- Presets under "Console status", "Sequence with live cue" and "Executor with live status".

The plugin removes commas, semicolons and double quotes from names before sending, because SendOSC can't carry them.

# Example configuration

I do provide a custom-made Companion Layout for a StreamDeck XL, that is fully compatible with this plugin. You can download it from [here](https://github.com/bitfocus/companion-module-malighting-grandma3/tree/main/configuration-examples).
It comes with a LUA plugin, that you can import into your grandMA3 onPC Software, that automatically creates an OSC entry, and the corresponding Quickeys needed for my custom Companion Layout.

It also comes with a page named "Numpad" that allows you to use it with the Software VICREO-Listener which can be downloaded on the plugin page after importing the Layout.
This page is a virtual numpad that allows you to use the grandMA3 Software without a physical keyboard.

# Functions

- Select Sequences
- Select MAtricks
- Call Macros
- Call Plugins
- Select Groups
- Run Quick Keys
- At Menu
- Run Commands
- Toggle Executor Buttons (100/200/300/400)
- Live console status with the CompanionFeedback plugin (see above)
