# 把 zsk_vault\site 的内容镜像到 Quartz 的 content 目录。
# 用法：在 quartz 目录下执行  .\sync-content.ps1
#
# 用 /MIR 做镜像：site\ 里删掉的文件，content\ 里也会相应删除，
# 保证站点内容与 site\ 严格一致（否则删过的笔记会继续挂在网上）。

$ErrorActionPreference = "Stop"

# 发布目录的位置。在 Obsidian 里挪动这个文件夹后，改这里一处即可。
$src = "D:\hxl_vault\zsk_vault\site"
$dst = "C:\Users\ZhuanZ1\quartz\content"

if (-not (Test-Path $src)) {
    Write-Error "源目录不存在：$src"
}

# 安全闸，三道。$src 一旦被改错（比如指到 vault 根目录），/MIR 会一声不响地
# 把私人内容镜像进站点并发布出去，而发布是不可逆的。所以宁可报错，不能放过。
#
# 第一道：结构检查——$src 必须就是「发布用」的那个文件夹本身。
# 原来这里的名单里还有「日记」，2026-09-19 已移除：site\日记\ 现在是站点的
# 合法内容，不能再拿它当哨兵（哨兵得是「只可能出现在私人位置」的名字）。
# 改成看目录名：vault 根目录叫 zsk_vault，不叫 site，所以最危险的那个场景
# ——「$src 被指到 vault 根」——依然会被拦下。
# 注意：以后若给这个文件夹改名，$src 与 $expectedLeaf 要一起改。
$expectedLeaf = "site"
$srcFull = [System.IO.Path]::GetFullPath($src).TrimEnd('\')
if ((Split-Path $srcFull -Leaf) -ne $expectedLeaf) {
    Write-Error "拒绝同步：$src 的目录名不是「$expectedLeaf」。请检查 `$src 是否指错了位置。"
}

# 第二道：vault 根目录本身（或它的上层）绝不能当同步源。
# 这一道不依赖「目录名必须叫 site」那个假设，所以两条是各自独立的兜底。
$vaultRoot = "D:\hxl_vault\zsk_vault"
$vaultFull = [System.IO.Path]::GetFullPath($vaultRoot).TrimEnd('\')
if ($vaultFull -eq $srcFull -or $vaultFull.StartsWith($srcFull + '\', [StringComparison]::OrdinalIgnoreCase)) {
    Write-Error "拒绝同步：$src 是 vault 根目录 $vaultRoot 本身或它的上层，会把私人内容一起镜像上线。"
}

# 第三道：这些名字是明确的私人内容，出现在 $src 里就说明源目录被污染了。
$forbidden = @("private", "密码.md", "CLAUDE.md", "SKILL.md")
foreach ($item in $forbidden) {
    if (Test-Path (Join-Path $src $item)) {
        Write-Error "拒绝同步：源目录 $src 里出现了「$item」，这看起来是私人内容。请检查 `$src 是否指错了位置。"
    }
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

