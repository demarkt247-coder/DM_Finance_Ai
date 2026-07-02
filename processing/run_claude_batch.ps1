# Launched by Windows Task Scheduler on: boot, unlock, and a daily fixed time (8:30 PM).
# Opens Claude Code with the fixed processing prompt so the founder never has to
# trigger this manually. Adjust $ClaudeCodeExe if your install path differs.

$ProjectDir = "E:\Claude Upgrade\Finance"
$PromptFile = "$ProjectDir\processing\PROCESS_PENDING.md"

$LogFile = "$ProjectDir\processing\last_run.log"
Add-Content -Path $LogFile -Value "--- Triggered $(Get-Date) ---"

# Requires the Claude Code CLI on PATH. -p / --print-mode style flags vary by
# version; if this doesn't launch correctly, open Claude Code manually once and
# check `claude --help` for the current non-interactive invocation flag.
claude --cwd $ProjectDir --file $PromptFile 2>&1 | Add-Content -Path $LogFile
