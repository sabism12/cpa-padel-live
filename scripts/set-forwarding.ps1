# Applies the hotspot network rules:
#   - hotspot adapter: forwarding DISABLED  (phones get no Internet)
#   - Wi-Fi adapter:   forwarding ENABLED   (Dell keeps its own Internet)
#
# ICS re-enables forwarding whenever the hotspot starts, so this is re-applied
# on every launcher run.

function Set-Forwarding {
  param(
    [string]$Alias,
    [string]$State
  )
  try {
    Set-NetIPInterface -InterfaceAlias $Alias -Forwarding $State -ErrorAction Stop
    return $true
  } catch {
    Write-Host ('      Could not set ' + $Alias + ' to ' + $State + ': ' + $_.Exception.Message)
    return $false
  }
}

$hotspotAlias = 'Local Area Connection* 2'
$wifiAlias = 'Wi-Fi'

# Only touch the hotspot adapter if it exists (i.e. the hotspot has been on).
$hotspotExists = Get-NetAdapter -InterfaceAlias $hotspotAlias -ErrorAction SilentlyContinue

if ($hotspotExists) {
  [void](Set-Forwarding -Alias $hotspotAlias -State 'Disabled')
} else {
  Write-Host '      Hotspot adapter not present yet (hotspot is off).'
}

[void](Set-Forwarding -Alias $wifiAlias -State 'Enabled')

Write-Host '      Result:'
Get-NetIPInterface -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.InterfaceAlias -in @($hotspotAlias, $wifiAlias) } |
  ForEach-Object {
    $label = if ($_.InterfaceAlias -eq $hotspotAlias) { 'phones blocked' } else { 'Dell Internet' }
    Write-Host ('        ' + $_.InterfaceAlias + '  forwarding = ' + $_.Forwarding + '   (' + $label + ')')
  }
