# PakPoshak — build script.
# Minifies all source files before deployment. Run before every commit.
#
# Source files (edit these):
#   index.src.html, order-form.src.html  — HTML skeletons
#   style.src.css                        — all app CSS
#   app.src.js                           — all app JavaScript
#
# Output files (committed + served by GitHub Pages):
#   index.html, order-form.html  — minified HTML (~68 KB each)
#   style.css                    — minified CSS
#   app.js                       — minified JS (no mangle/compress — structure preserved)
#
# Workflow:
#   1. Edit *.src.html / style.src.css / app.src.js
#   2. powershell -ExecutionPolicy Bypass -File build.ps1
#   3. git add *.src.html *.src.css *.src.js *.html style.css app.js sw.js
#   4. git commit + push
#
# IMPORTANT: bump CACHE_VERSION in sw.js before committing whenever style.css or
# app.js change — the service worker caches them permanently until the version bumps.

$ErrorActionPreference = 'Stop'
$base = $PSScriptRoot
$rc   = Join-Path $base '.htmlminrc'

Write-Host "PakPoshak build" -ForegroundColor Cyan

# ── CSS ──────────────────────────────────────────────────────────────────────
$cssSrc = Join-Path $base 'style.src.css'
$cssOut = Join-Path $base 'style.css'
if (Test-Path $cssSrc) {
  $bKB = [math]::Round((Get-Item $cssSrc).Length / 1KB, 1)
  & cleancss -o $cssOut $cssSrc
  $aKB = [math]::Round((Get-Item $cssOut).Length / 1KB, 1)
  Write-Host ("  [ok] {0,-30}  {1,7} KB  →  {2,7} KB  ({3}% saved)" -f 'style.css', $bKB, $aKB, [math]::Round(100*(1-$aKB/$bKB),1)) -ForegroundColor Green
}

# ── JS ───────────────────────────────────────────────────────────────────────
$jsSrc = Join-Path $base 'app.src.js'
$jsOut = Join-Path $base 'app.js'
if (Test-Path $jsSrc) {
  $bKB = [math]::Round((Get-Item $jsSrc).Length / 1KB, 1)
  # no-compress + no-mangle: strips whitespace/comments only; string patterns stay intact
  # for future Edit-tool patches on the .src file.
  & terser $jsSrc --no-mangle --no-compress --comments false --output $jsOut
  $aKB = [math]::Round((Get-Item $jsOut).Length / 1KB, 1)
  Write-Host ("  [ok] {0,-30}  {1,7} KB  →  {2,7} KB  ({3}% saved)" -f 'app.js', $bKB, $aKB, [math]::Round(100*(1-$aKB/$bKB),1)) -ForegroundColor Green
}

# ── HTML ─────────────────────────────────────────────────────────────────────
# Read the build tag from app.src.js so the asset URLs (app.js?b=… / style.css?b=…)
# carry it. Because index.html is served network-FIRST, a reopen always gets fresh
# HTML; a NEW build tag => a NEW app.js URL => service-worker cache miss => fresh
# code in ONE reopen, with no stale-while-revalidate lag.
$appSrc = Join-Path $base 'app.src.js'
$buildTag = 'dev'
if (Test-Path $appSrc) {
  $m = Select-String -Path $appSrc -Pattern "PSB_BUILD\s*=\s*'([^']+)'" | Select-Object -First 1
  if ($m) { $buildTag = $m.Matches[0].Groups[1].Value }
}
Write-Host ("  build tag for asset URLs: {0}" -f $buildTag) -ForegroundColor DarkGray

$pairs = @(
  @{ src = 'index.src.html';      out = 'index.html' },
  @{ src = 'order-form.src.html'; out = 'order-form.html' }
)
foreach ($p in $pairs) {
  $srcPath = Join-Path $base $p.src
  $outPath = Join-Path $base $p.out
  if (-not (Test-Path $srcPath)) { Write-Host "  SKIP $($p.src)" -ForegroundColor Yellow; continue }
  $bKB = [math]::Round((Get-Item $srcPath).Length / 1KB, 1)
  & html-minifier-terser --config-file $rc --output $outPath $srcPath
  # Substitute the build tag into the versioned asset URLs.
  # IMPORTANT: write UTF-8 WITHOUT a BOM. PowerShell 5.1's `Set-Content -Encoding utf8`
  # prepends a BOM (EF BB BF) before <!doctype html>, which throws some mobile browsers
  # into quirks mode / fails to render. Use .NET WriteAllText with a no-BOM encoding.
  $html = (Get-Content $outPath -Raw).Replace('__PSB_BUILD__', $buildTag)
  [System.IO.File]::WriteAllText($outPath, $html, (New-Object System.Text.UTF8Encoding $false))
  $aKB = [math]::Round((Get-Item $outPath).Length / 1KB, 1)
  Write-Host ("  [ok] {0,-30}  {1,7} KB  →  {2,7} KB  ({3}% saved)" -f $p.out, $bKB, $aKB, [math]::Round(100*(1-$aKB/$bKB),1)) -ForegroundColor Green
}

# ── POST-BUILD INTEGRITY CHECKS ───────────────────────────────────────────────
# Fails the build if a known-incident invariant regresses ([hidden] guard, BOM,
# versioned asset URLs, build/cache stamps). See verify-build.js.
$verify = Join-Path $base 'verify-build.js'
if (Test-Path $verify) {
  Write-Host ""
  & node $verify
  if ($LASTEXITCODE -ne 0) {
    Write-Host "BUILD VERIFY FAILED: artifacts are NOT safe to deploy." -ForegroundColor Red
    exit 1
  }
}

Write-Host ""
Write-Host "Done. git add *.src.html *.src.css *.src.js *.html style.css app.js sw.js verify-build.js" -ForegroundColor Cyan
