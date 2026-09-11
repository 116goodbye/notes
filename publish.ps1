# 一键发布：把 zsk_vault\site 的改动同步到站点并推送到 GitHub。
# 用法：在 quartz 目录下执行  .\publish.ps1
#
# 推送成功后 Cloudflare Pages 会自动重新构建，一两分钟后线上更新。

$ErrorActionPreference = "Stop"

$repo = "C:\Users\ZhuanZ1\quartz"
$src  = "D:\hxl_vault\zsk_vault\site"

Set-Location $repo

# --- 1. 同步内容 ---
& "$repo\sync-content.ps1"

# --- 2. 看有没有实际改动 ---
git add -A
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "没有检测到改动，无需推送。" -ForegroundColor Yellow
    exit 0
}

Write-Host "`n本次改动：" -ForegroundColor Cyan
$staged | ForEach-Object { "  $_" }

# --- 3. 提交 ---
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -q -m "更新笔记 $stamp"

# --- 4. 推送 ---
Write-Host "`n正在推送到 GitHub..." -ForegroundColor Cyan
git push

Write-Host "`n发布完成。Cloudflare 会自动重建，约 1-2 分钟后生效：" -ForegroundColor Green
Write-Host "  https://notes-b1v.pages.dev" -ForegroundColor Green

