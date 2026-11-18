/**
 * 真实 Edge 窗口验证：启动 app 窗口 → 置顶 → 截取窗口区域
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile } from 'node:fs/promises';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const HERE = dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://127.0.0.1:8123/index.html?autostart=1';
const outPng = process.argv[3] || join(HERE, '_out', 'real-window.png');
const W = 1280, H = 800;

const profile = join(process.env.TEMP, 'mx-edge-app-' + Date.now());
const startedAt = Date.now();
const child = spawn(EDGE, [
  `--app=${url}`,
  `--window-size=${W},${H}`,
  '--window-position=80,80',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  `--user-data-dir=${profile}`,
], { stdio: 'ignore' });

console.log('窗口已启动，等待全景加载…');
await sleep(15000);

const script = `
$env:LIB=''
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class W {
  public delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Cb cb, IntPtr l);
  [DllImport("user32.dll")] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
[void][W]::SetProcessDPIAware()
$script:found = [IntPtr]::Zero
$cb = [W+Cb]{
  param($h,$l)
  if ([W]::IsWindowVisible($h)) {
    $sb = New-Object System.Text.StringBuilder 512
    [void][W]::GetWindowTextW($h, $sb, 512)
    if ($sb.ToString() -like '*自由游览*') { $script:found = $h; return $false }
  }
  return $true
}
[void][W]::EnumWindows($cb, [IntPtr]::Zero)
if ($script:found -eq [IntPtr]::Zero) { Write-Output 'WINDOW_NOT_FOUND'; exit 2 }
$h = $script:found
$fg = [W]::GetForegroundWindow()
if ($fg -ne $h) {
  $t = [W]::GetWindowThreadProcessId($fg, [IntPtr]::Zero)
  $mt = [W]::GetCurrentThreadId()
  [void][W]::AttachThreadInput($mt, $t, $true)
  [void][W]::BringWindowToTop($h)
  [void][W]::SetForegroundWindow($h)
  [void][W]::AttachThreadInput($mt, $t, $false)
}
Start-Sleep -Milliseconds 1500
$r = New-Object W+RECT
[void][W]::GetWindowRect($h, [ref]$r)
$wd = $r.Right - $r.Left
$ht = $r.Bottom - $r.Top
Write-Output ("RECT " + $r.Left + "," + $r.Top + " " + $wd + "x" + $ht)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap $wd, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
$g.Dispose()
$bmp.Save('OUTPATH', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output 'SAVED'
`.replace('OUTPATH', outPng.replace(/\\/g, '\\\\'));

const psFile = join(process.env.TEMP, 'mx-shot2.ps1');
await writeFile(psFile, script, 'utf8');

const res = await new Promise((resolve) => {
  const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psFile], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { out += d; });
  p.on('close', () => resolve(out));
});
console.log(res.trim());

try { child.kill(); } catch { /* ignore */ }
console.log('elapsed', Math.round((Date.now() - startedAt) / 1000) + 's');