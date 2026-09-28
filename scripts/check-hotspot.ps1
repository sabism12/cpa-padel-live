# Reports whether the Windows Mobile Hotspot is currently on.
# Kept as a separate .ps1 file so the .bat launcher never has to escape
# PowerShell special characters.

$hotspot = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -eq '192.168.137.1' }

if ($hotspot) {
  Write-Host ('      Hotspot is ON  --  phones use http://192.168.137.1:3000')
} else {
  Write-Host '      Hotspot is OFF.'
  Write-Host '      Turn it on:  Settings  -  Network and internet  -  Mobile hotspot  -  On'
  Write-Host '      Then run this launcher again for best results.'
}
