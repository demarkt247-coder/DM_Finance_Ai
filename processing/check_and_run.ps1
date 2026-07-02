# Runs every 15 min via Task Scheduler. Does a cheap HTTP check first - only
# invokes the expensive Claude Code batch job (run_claude_batch.ps1) if there's
# actually something pending. This avoids burning Claude Code Pro usage on
# empty checks every 15 minutes.

$ProjectDir = "E:\Claude Upgrade\Finance"
$LogFile = "$ProjectDir\processing\last_run.log"

try {
    $response = Invoke-RestMethod -Uri "https://dm-finance-bot.onrender.com/pending-count" -TimeoutSec 60
    if ($response.count -gt 0) {
        Add-Content -Path $LogFile -Value "--- Pending check $(Get-Date): $($response.count) pending, launching batch job ---"
        & "$ProjectDir\processing\run_claude_batch.ps1"
    }
    # else: nothing pending, exit quietly - no log spam, no Claude Code invocation
} catch {
    Add-Content -Path $LogFile -Value "--- Pending check $(Get-Date) failed: $($_.Exception.Message) ---"
}
