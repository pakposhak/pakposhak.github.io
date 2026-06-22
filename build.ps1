# PakPoshak — build script.
# Reads *.src.html (readable source files you edit) and produces minified *.html
# (what GitHub Pages serves). Run before every commit.
#
# Minification: HTML whitespace + comments removed; inline CSS minified;
# inline JS whitespace + comments removed (NO mangle, NO compress — code structure
# preserved so Edit-tool patches still work on the src files).
#
# Workflow:
#   1. Edit index.src.html  (or order-form.src.html)
#   2. powershell -ExecutionPolicy Bypass -File build.ps1
#   3. git add index.src.html index.html order-form.src.html order-form.html
#   4. git commit + push
#
# To see/edit source after a build: open *.src.html — the readable copy is always there.

$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot

$rc = Join-Path $base '.htmlminrc'

$pairs = @(
  @{ src = 'index.src.html';      out = 'index.html' },
  @{ src = 'order-form.src.html'; out = 'order-form.html' }
)

foreach ($p in $pairs) {
  $srcPath = Join-Path $base $p.src
  $outPath = Join-Path $base $p.out
  if (-not (Test-Path $srcPath)) { Write-Host "  SKIP $($p.src) (not found)" -ForegroundColor Yellow; continue }

  $beforeKB = [math]::Round((Get-Item $srcPath).Length / 1KB, 1)
  & html-minifier-terser --config-file $rc --output $outPath $srcPath
  $afterKB  = [math]::Round((Get-Item $outPath).Length / 1KB, 1)
  $saving   = [math]::Round(100 * (1 - $afterKB / $beforeKB), 1)
  Write-Host ("  [ok] {0,-30}  {1,7} KB  →  {2,7} KB  ({3}% saved)" -f $p.out, $beforeKB, $afterKB, $saving) -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Next: git add *.src.html *.html && git commit" -ForegroundColor Cyan
