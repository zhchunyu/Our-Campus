# 从 Windows 凭据管理器直接读取 git 的 GitHub 凭据，写入临时文件供推送脚本使用。
# 为什么不用 `git credential fill`：受限环境下它会间歇性挂起（无输出、无报错）。
#
# 注意事项（都是实测踩过的坑）：
#  1) 结尾的 "@ 必须顶格写在行首，缩进会让 here-string 提前结束并报一堆语法错。
#  2) 本机 Add-Type 可能因历史遗留的 LIB/INCLUDE 环境变量（指向不存在的 VC98 目录）
#     而编译失败，故下面先清空再调用。
#  3) 凭据的目标名不一定是 `git:https://<user>@github.com`：git 走 GitHub 时实际
#     存的是 `git:https://github.com`。这里按候选列表逐个尝试，避免读不到。
$env:LIB = $null
$env:INCLUDE = $null

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class CredMan {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct CREDENTIAL {
        public uint Flags;
        public uint Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }

    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CredRead(string target, uint type, uint flags, out IntPtr credential);
    [DllImport("advapi32.dll")]
    private static extern void CredFree(IntPtr cred);

    public static string Read(string target, uint type) {
        IntPtr p;
        if (!CredRead(target, type, 0, out p)) { return null; }
        try {
            CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
            if (c.CredentialBlobSize == 0) { return ""; }
            return Marshal.PtrToStringUni(c.CredentialBlob, (int)(c.CredentialBlobSize / 2));
        } finally { CredFree(p); }
    }
}
'@

$targets = @(
    'git:https://github.com',
    'git:https://zhchunyu@github.com'
)
$tok = $null
$used = $null
foreach ($t in $targets) {
    $tok = [CredMan]::Read($t, 1)   # 1 = CRED_TYPE_GENERIC
    if ($tok) { $used = $t; break }
}
if (-not $tok) { Write-Output ("未读到凭据，已尝试：" + ($targets -join ' / ')); exit 1 }

$dir = Join-Path $env:TEMP 'chunyu_push'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$out = Join-Path $dir 'token.txt'
[System.IO.File]::WriteAllText($out, $tok, (New-Object System.Text.ASCIIEncoding))
Write-Output ("凭据目标 " + $used + " → token 长度 " + $tok.Length + " → " + $out)
