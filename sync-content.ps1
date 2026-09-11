# 把 zsk_vault\site 的内容镜像到 Quartz 的 content 目录。
# 用法：在 quartz 目录下执行  .\sync-content.ps1
#
# 用 /MIR 做镜像：site\ 里删掉的文件，content\ 里也会相应删除，
# 保证站点内容与 site\ 严格一致（否则删过的笔记会继续挂在网上）。

$ErrorActionPreference = "Stop"

$src = "D:\hxl_vault\zsk_vault\site"
$dst = "C:\Users\ZhuanZ1\quartz\content"

if (-not (Test-Path $src)) {
    Write-Error "源目录不存在：$src"
}

if (-not (Test-Path $dst)) {
    New-Item -ItemType Directory -Path $dst | Out-Null
}

# /MIR   镜像（含删除）
# /XD    排除目录
# /XF    排除文件
# /NFL /NDL /NJH /NJS  精简输出
robocopy $src $dst /MIR /XD ".obsidian" ".git" ".trash" /XF ".DS_Store" "Thumbs.db" /NFL /NDL /NJH /NJS /NP | Out-Null

# robocopy 退出码 0-7 都算成功，8 及以上才是真失败
if ($LASTEXITCODE -ge 8) {
    Write-Error "robocopy 失败，退出码：$LASTEXITCODE"
}

$n = (Get-ChildItem $dst -Recurse -File -Filter *.md | Measure-Object).Count
Write-Host "同步完成：$n 个 Markdown 文件 -> $dst" -ForegroundColor Green
Write-Host "接下来：npx quartz build --serve  预览，或  npx quartz sync  发布" -ForegroundColor Cyan

