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

$PromptText = Get-Content -Path $PromptFile -Raw
$McpConfig = "$ProjectDir\processing\mcp-config.json"
# Absolute path, not just "claude" - Task Scheduler runs with a stale PATH snapshot
# from before the CLI was installed (npm PATH updates need a full logout/login to
# propagate to scheduled tasks), so relying on PATH resolution silently fails there
# even though it works fine in an interactive session.
$ClaudeExe = "C:\Users\De Markt\AppData\Roaming\npm\claude.cmd"
& $ClaudeExe -p $PromptText --mcp-config $McpConfig --permission-mode bypassPermissions 2>&1 | Add-Content -Path $LogFile

Add-Content -Path $LogFile -Value "--- Finished $(Get-Date) ---"
