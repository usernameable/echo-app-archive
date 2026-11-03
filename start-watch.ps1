param([int]$ServerPid, [long]$ServerStartTicks, [long]$WindowHandle, [int]$Port)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EchoWindowWatch {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr handle);
}
'@
while ([EchoWindowWatch]::IsWindow([IntPtr]$WindowHandle)) { Start-Sleep -Seconds 1 }
try {
    $server = Get-Process -Id $ServerPid -ErrorAction Stop
    $listener = Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort $Port -ErrorAction Stop |
        Where-Object OwningProcess -eq $ServerPid
    if ($listener -and $server.StartTime.ToFileTimeUtc() -eq $ServerStartTicks) {
        Stop-Process -Id $ServerPid
    }
} catch { }
