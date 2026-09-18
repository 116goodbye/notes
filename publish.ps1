# 一键发布：把 zsk_vault\site 的改动同步到站点并推送到 GitHub。
# 用法：在 quartz 目录下执行  .\publish.ps1
#
# 推送成功后 Cloudflare Pages 会自动重新构建，一两分钟后线上更新。

$ErrorActionPreference = "Stop"

$repo = "C:\Users\ZhuanZ1\quartz"
$src  = "D:\hxl_vault\zsk_vault\site"

Set-Location $repo

# 原生命令（git 等）统一走这里，绕开两个坑：
#
# ① git push 会把进度写到 stderr（"To https://github.com/..." 那行就是）。
#    PowerShell 5.1 在 $ErrorActionPreference = "Stop" 下会把原生命令的 stderr
#    当成终止性错误 —— 推送明明成功了，脚本却崩在那一行，后面的「发布完成」不再打印。
#    所以调用期间临时切回 Continue。
#
# ② 光切回 Continue 不够：原生命令失败时不会抛异常，脚本会若无其事地往下走，
#    把「推送失败」也报成绿色的「发布完成」。所以必须显式检查退出码。
#    发布不可逆，宁可中止也不能误报成功。
function Invoke-Native {
    param(
        [string]$What,
        [scriptblock]$Command,
        # 只有原生命令才该看 $LASTEXITCODE。调用 PowerShell 脚本时，它是该脚本里
        # 最后一个原生命令留下的残值，并不代表这次调用本身成没成功。
        # 例如 sync-content.ps1 内部的 robocopy 退出码 3 意为「成功，且目标有多余
        # 文件」（robocopy 0-7 都算成功），拿到这里就会被误判成同步失败——
        # 脚本已经自己按 -ge 8 判断过了，所以那种调用要加这个开关跳过。
        [switch]$SkipExitCodeCheck
    )
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Command
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
    if (-not $SkipExitCodeCheck -and $code -ne 0) {
        throw "$What 失败（退出码 $code）。已中止，站点未更新。"
    }
}

# --- 1. 同步内容 ---
# 这个调用不看 $LASTEXITCODE：sync-content.ps1 是 PowerShell 脚本，它失败时会
# 直接抛异常，而残留的退出码属于它内部的 robocopy。详见函数里的说明。
Invoke-Native "内容同步" { & "$repo\sync-content.ps1" } -SkipExitCodeCheck

# --- 2. 看有没有实际改动 ---
Invoke-Native "git add" { git add -A }
$staged = @(Invoke-Native "git diff" { git diff --cached --name-only })
if ($staged.Count -eq 0) {
    Write-Host "没有检测到改动，无需推送。" -ForegroundColor Yellow
    exit 0
}

Write-Host "`n本次改动：" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "  $_" }

# --- 3. 提交 ---
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
Invoke-Native "git commit" { git commit -q -m "更新笔记 $stamp" }

# --- 4. 推送 ---
Write-Host "`n正在推送到 GitHub..." -ForegroundColor Cyan
Invoke-Native "git push" { git push }

# 网址从 quartz.config.yaml 的 baseUrl 读，改域名时只需改配置那一处
$cfg = Get-Content "$repo\quartz.config.yaml" -Raw -Encoding UTF8
if ($cfg -match '(?m)^\s*baseUrl:\s*(\S+)') {
    $siteUrl = "https://$($Matches[1])"
} else {
    $siteUrl = "（未在 quartz.config.yaml 里找到 baseUrl）"
}

Write-Host "`n发布完成。Cloudflare 会自动重建，约 1-2 分钟后生效：" -ForegroundColor Green
Write-Host "  $siteUrl" -ForegroundColor Green
