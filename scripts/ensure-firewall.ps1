# Ensures scorekeeper phones on the hotspot can reach the gateway on TCP 3000.
# Creates the inbound allow rule if it is missing.

$ruleName = 'CPA Padel - Hotspot - Allow Gateway 3000'
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

if ($existing) {
  Write-Host '      Rule already present.'
} else {
  try {
    New-NetFirewallRule `
      -DisplayName $ruleName `
      -Direction Inbound `
      -Action Allow `
      -Protocol TCP `
      -LocalPort 3000 `
      -RemoteAddress '192.168.137.0/24' `
      -Profile Any | Out-Null
    Write-Host '      Rule created.'
  } catch {
    Write-Host ('      Could not create rule: ' + $_.Exception.Message)
  }
}
