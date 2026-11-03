$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
function Halt($message) { Write-Host $message; Read-Host '按回车键关闭窗口' | Out-Null; exit 1 }
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class EchoWindowApi {
  public delegate bool EnumWindowsProc(IntPtr handle, IntPtr data);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr data);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr handle, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle, out uint processId);
  public static string Title(long handle) {
    var text = new StringBuilder(512);
    GetWindowText(new IntPtr(handle), text, text.Capacity);
    return text.ToString();
  }
  public static long[] ChromeWindows() {
    var windows = new List<long>();
    EnumWindows((handle, data) => {
      if (!IsWindowVisible(handle)) return true;
      uint id; GetWindowThreadProcessId(handle, out id);
      try {
        if (Process.GetProcessById((int)id).ProcessName == "chrome" && Title(handle.ToInt64()).Length > 0)
          windows.Add(handle.ToInt64());
      } catch { }
      return true;
    }, IntPtr.Zero);
    return windows.ToArray();
  }
}
"@
$chrome = @("${env:ProgramFiles}\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe") |
    Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $chrome) { Halt '没有找到 Chrome，无法在关闭应用窗口后自动释放端口。' }
$python = $null
$command = Get-Command python -ErrorAction SilentlyContinue
if ($command) { try { & $command.Source --version 2>$null | Out-Null; if ($LASTEXITCODE -eq 0) { $python = $command.Source } } catch { } }
if (-not $python) {
    $command = Get-Command py -ErrorAction SilentlyContinue
    if ($command) { try { $candidate = (& $command.Source -3 -c 'import sys; print(sys.executable)' 2>$null | Select-Object -First 1); if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $candidate)) { $python = $candidate } } catch { } }
}
if (-not $python) { Halt '没有找到运行环境。请把这句交给 AI 助手安装：winget install Python.Python.3.12' }
$port = 0
foreach ($candidate in 8000,8001,8002) {
    $socket = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse('127.0.0.1'), $candidate)
    try { $socket.Start(); $port = $candidate; break } catch { } finally { $socket.Stop() }
}
if (-not $port) { Halt '8000 到 8002 都被占用，请关闭占用这些端口的程序。' }
try { $server = Start-Process -FilePath $python -ArgumentList '-m','http.server',$port,'--bind','127.0.0.1' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru }
catch { Halt '本地服务启动失败，请让家长检查运行环境。' }
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    if ($server.HasExited) { break }
    try { if ((Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200) { $ready = $true; break } } catch { }
    Start-Sleep -Milliseconds 250
}
$listener = Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort $port -ErrorAction SilentlyContinue |
    Where-Object OwningProcess -eq $server.Id
if (-not $ready -or -not $listener) { if (-not $server.HasExited) { Stop-Process -Id $server.Id }; Halt '应用未能准备好，请检查运行环境。' }
$before = [EchoWindowApi]::ChromeWindows()
$url = "http://localhost:$port/"
$launchUrl = '{0}?launch={1}' -f $url, [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
try { Start-Process -FilePath $chrome -ArgumentList '--new-window','--window-size=1280,900',$launchUrl | Out-Null }
catch { Stop-Process -Id $server.Id; Halt "浏览器未能打开，请复制这个地址：$url" }
$window = 0L
for ($i = 0; $i -lt 60; $i++) {
    $window = [EchoWindowApi]::ChromeWindows() | Where-Object { $before -notcontains $_ -and [EchoWindowApi]::Title($_) -match '^Echo' } | Select-Object -First 1
    if ($window) { break }
    Start-Sleep -Milliseconds 500
}
if (-not $window) { Stop-Process -Id $server.Id; Halt '没有找到新打开的 Echo 窗口，本地服务已停止。' }
$watchArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + (Join-Path $PSScriptRoot 'start-watch.ps1') + '"'),
    '-ServerPid',$server.Id,'-ServerStartTicks',$server.StartTime.ToFileTimeUtc(),'-WindowHandle',$window,'-Port',$port)
try {
    $watcher = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $watchArgs -WindowStyle Hidden -PassThru
    Start-Sleep -Milliseconds 300
    if ($watcher.HasExited) { throw '监控进程未能启动' }
} catch { Stop-Process -Id $server.Id; Halt '窗口监控未能启动，本地服务已停止。' }
Write-Host "应用已打开：$url"
Write-Host '关闭这次打开的 Echo 窗口后，本地服务会自动停止。'
