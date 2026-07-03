# Launched by Windows Task Scheduler on: boot, unlock, and a daily fixed time (8:30 PM).
# Runs the standalone Claude Code CLI non-interactively with the fixed processing
# prompt, so the founder never has to trigger this manually.
#
# --permission-mode bypassPermissions is required here (not a stylistic choice):
# this runs fully unattended with nobody available to approve tool-use prompts,
# and the batch job needs to read/write Drive+Sheets and send Telegram messages
# without a human in the loop. The blast radius is scoped by PROCESS_PENDING.md's
# hard rules (never guess, flag instead, never overwrite committed rows).

$ProjectDir = "E:\Claude Upgrade\Finance"
$PromptFile = "$ProjectDir\processing\PROCESS_PENDING.md"
$LogFile = "$ProjectDir\processing\last_run.log"

Set-Location $ProjectDir
Add-Content -Path $LogFile -Value "--- Triggered $(Get-Date) ---"

$McpConfig = "$ProjectDir\processing\mcp-config.json"
# Absolute path, not just "claude" - Task Scheduler runs with a stale PATH snapshot
# from before the CLI was installed (npm PATH updates need a full logout/login to
# propagate to scheduled tasks), so relying on PATH resolution silently fails there
# even though it works fine in an interactive session.
$ClaudeExe = "C:\Users\De Markt\AppData\Roaming\npm\claude.cmd"
# Pipe the prompt via stdin instead of passing it as a CLI argument - when this
# script is itself launched by a Node child_process (the listener), the prompt
# text passing through Node -> PowerShell -> claude.cmd as a positional argument
# got mangled/truncated, causing Claude to receive a garbled prompt and fall back
# to confused interactive-style responses instead of running the real batch job.
# stdin piping is a single clean handoff and survives being spawned from anywhere.
Get-Content -Path $PromptFile -Raw | & $ClaudeExe -p --mcp-config $McpConfig --permission-mode bypassPermissions 2>&1 | Add-Content -Path $LogFile

Add-Content -Path $LogFile -Value "--- Finished $(Get-Date) ---"
