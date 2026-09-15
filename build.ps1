<#
.SYNOPSIS
    Builds the dist/ folder for the ZS New Tab extension.

.DESCRIPTION
    Bundles the modular CSS and JS files referenced in index.html into
    single files, copies fonts/ icons/ manifest.json, and rewrites
    index.html to load the bundled files.

    js/script.preload.js is NOT bundled — it must run synchronously
    before the stylesheet to prevent the accent-color flash, so it is
    copied to dist/js/ as-is.

    After this script runs, use package-extension.ps1 to produce the
    .zip / .xpi.

.PARAMETER NoClean
    Keep the existing dist/ folder instead of wiping it first.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\build.ps1
#>

param(
    [switch]$NoClean
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------
# 0. Paths & sanity
# ---------------------------------------------------------------
$Root       = Get-Location
$DistFolder = Join-Path $Root "dist"
$SourceHtml = Join-Path $Root "index.html"

if (-not (Test-Path $SourceHtml)) {
    Write-Host "index.html not found in $Root" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------
# 1. I/O helpers — UTF-8 without BOM (avoids surprises in DevTools
#    and in Firefox's moz-extension:// path handling)
# ---------------------------------------------------------------
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-Text {
    param([string]$Path)
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-Text {
    param([string]$Path, [string]$Content)
    [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

# Warnings collector — printed at the very end of the script so the
# user actually notices them.
$Warnings = [System.Collections.Generic.List[string]]::new()

# ---------------------------------------------------------------
# 2. Clean / create dist/
# ---------------------------------------------------------------
if ((Test-Path $DistFolder) -and -not $NoClean) {
    Remove-Item $DistFolder -Recurse -Force
}

foreach ($sub in @("js", "styles")) {
    $p = Join-Path $DistFolder $sub
    if (-not (Test-Path $p)) {
        New-Item -ItemType Directory -Path $p -Force | Out-Null
    }
}

# ---------------------------------------------------------------
# 3. Parse index.html -> ordered file lists
#    The order in index.html is the order they get concatenated.
# ---------------------------------------------------------------
$html = Read-Text $SourceHtml

$cssRegex = '<link\s+rel="stylesheet"\s+href="\.\/styles\/([^"]+)"\s*>'
$jsRegex  = '<script\s+src="\.\/js\/(?!script\.preload)([^"]+)"></script>'

$cssMatches = [regex]::Matches($html, $cssRegex)
$jsMatches  = [regex]::Matches($html, $jsRegex)

if ($cssMatches.Count -eq 0) {
    Write-Host "No <link rel=stylesheet> tags found in index.html." -ForegroundColor Red
    exit 1
}
if ($jsMatches.Count -eq 0) {
    Write-Host "No <script src=...> tags found in index.html." -ForegroundColor Red
    exit 1
}

$cssFiles = @($cssMatches | ForEach-Object { $_.Groups[1].Value })
$jsFiles  = @($jsMatches  | ForEach-Object { $_.Groups[1].Value })

# ---------------------------------------------------------------
# 3.1 Validate source files against index.html
#     Warnings only — never stops the build.
# ---------------------------------------------------------------

function Get-NumericPrefix {
    param([string]$FileName)

    if ($FileName -match '^(\d+)') {
        return [int]$Matches[1]
    }

    return $null
}

# Returns the list of files that participate in an out-of-order
# sequence. Only the offending files are returned — not the whole
# list.
function Get-OutOfOrderFiles {
    param([string[]]$Files)

    $problems = [System.Collections.Generic.List[string]]::new()

    for ($i = 1; $i -lt $Files.Count; $i++) {
        $prevNum = Get-NumericPrefix $Files[$i - 1]
        $currNum = Get-NumericPrefix $Files[$i]

        # Files without a numeric prefix are ignored for ordering.
        if ($null -eq $prevNum -or $null -eq $currNum) { continue }

        if ($currNum -lt $prevNum) {
            if (-not $problems.Contains($Files[$i - 1])) { $problems.Add($Files[$i - 1]) }
            if (-not $problems.Contains($Files[$i]))     { $problems.Add($Files[$i])     }
        }
    }

    return $problems
}

# --- Find source files that are not referenced by index.html ---

$sourceCssFiles = @(
    Get-ChildItem -Path (Join-Path $Root "styles") -Filter "*.css" -File -ErrorAction SilentlyContinue |
    ForEach-Object { $_.Name }
)

$sourceJsFiles = @(
    Get-ChildItem -Path (Join-Path $Root "js") -Filter "*.js" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne "script.preload.js" } |
    ForEach-Object { $_.Name }
)

$unreferencedCss = @(
    $sourceCssFiles | Where-Object { $_ -notin $cssFiles }
)

$unreferencedJs = @(
    $sourceJsFiles | Where-Object { $_ -notin $jsFiles }
)

if ($unreferencedCss.Count -gt 0) {
    $Warnings.Add("Warning: CSS files found in styles/ but not referenced in index.html:")
    $unreferencedCss | ForEach-Object {
        $Warnings.Add("    styles\$_")
    }
}

if ($unreferencedJs.Count -gt 0) {
    $Warnings.Add("Warning: JS files found in js/ but not referenced in index.html:")
    $unreferencedJs | ForEach-Object {
        $Warnings.Add("    js\$_")
    }
}

# --- Check numeric ordering (only report the offending files) ---

foreach ($entry in @(
    @{ Type = "CSS"; Files = $cssFiles },
    @{ Type = "JS";  Files = $jsFiles  }
)) {
    $problems = Get-OutOfOrderFiles -Files $entry.Files

    if ($problems.Count -gt 0) {
        $Warnings.Add("Warning: $($entry.Type) files in index.html are not in numeric order.")
        $Warnings.Add("  Out-of-order files:")
        foreach ($f in $problems) {
            $Warnings.Add("    $f")
        }
    }
}

# --- Info: file lists being bundled ---

Write-Host ""
Write-Host "Found $($cssFiles.Count) CSS files:" -ForegroundColor Cyan
$cssFiles | ForEach-Object { Write-Host "    $_" }
Write-Host "Found $($jsFiles.Count) JS files:" -ForegroundColor Cyan
$jsFiles  | ForEach-Object { Write-Host "    $_" }
Write-Host ""

# ---------------------------------------------------------------
# 4. Bundle CSS
# ---------------------------------------------------------------
$cssSb = [System.Text.StringBuilder]::new()
[void]$cssSb.AppendLine("/* ============================================================")
[void]$cssSb.AppendLine("   ZS New Tab - bundled stylesheet")
[void]$cssSb.AppendLine("   Generated by build.ps1 - DO NOT EDIT BY HAND.")
[void]$cssSb.AppendLine("   Source files live under styles/ in the repo.")
[void]$cssSb.AppendLine("   ============================================================ */")
[void]$cssSb.AppendLine()

foreach ($file in $cssFiles) {
    $path = Join-Path $Root "styles\$file"
    if (-not (Test-Path $path)) {
        Write-Host "Missing CSS source: styles\$file" -ForegroundColor Red
        exit 1
    }
    [void]$cssSb.AppendLine("/* ===== $file ===== */")
    [void]$cssSb.AppendLine((Read-Text $path))
    [void]$cssSb.AppendLine()
}

$cssOut = Join-Path $DistFolder "styles\styles.css"
Write-Text $cssOut $cssSb.ToString()

# ---------------------------------------------------------------
# 5. Bundle JS
# ---------------------------------------------------------------
$jsSb = [System.Text.StringBuilder]::new()
[void]$jsSb.AppendLine("/* ============================================================")
[void]$jsSb.AppendLine("   ZS New Tab - bundled script")
[void]$jsSb.AppendLine("   Generated by build.ps1 - DO NOT EDIT BY HAND.")
[void]$jsSb.AppendLine("   Source files live under js/ in the repo.")
[void]$jsSb.AppendLine("   ============================================================ */")
[void]$jsSb.AppendLine()

foreach ($file in $jsFiles) {
    $path = Join-Path $Root "js\$file"
    if (-not (Test-Path $path)) {
        Write-Host "Missing JS source: js\$file" -ForegroundColor Red
        exit 1
    }
    [void]$jsSb.AppendLine("/* ===== $file ===== */")
    [void]$jsSb.AppendLine((Read-Text $path))
    [void]$jsSb.AppendLine()
}

$jsOut = Join-Path $DistFolder "js\script.js"
Write-Text $jsOut $jsSb.ToString()

# ---------------------------------------------------------------
# 6. Copy preload script as-is
# ---------------------------------------------------------------
$preloadSrc = Join-Path $Root "js\script.preload.js"
if (-not (Test-Path $preloadSrc)) {
    Write-Host "Missing js\script.preload.js" -ForegroundColor Red
    exit 1
}
Copy-Item $preloadSrc (Join-Path $DistFolder "js\script.preload.js")

# ---------------------------------------------------------------
# 7. Copy fonts/ icons/ manifest.json
# ---------------------------------------------------------------
foreach ($item in @("fonts", "icons")) {
    $src = Join-Path $Root $item
    if (Test-Path $src) {
        Copy-Item $src (Join-Path $DistFolder $item) -Recurse
    } else {
        $Warnings.Add("Warning: $item/ not found in source, skipping.")
    }
}

$manifestSrc = Join-Path $Root "manifest.json"
if (-not (Test-Path $manifestSrc)) {
    Write-Host "manifest.json not found." -ForegroundColor Red
    exit 1
}
Copy-Item $manifestSrc (Join-Path $DistFolder "manifest.json")

# ---------------------------------------------------------------
# 8. Rewrite index.html for dist/
# ---------------------------------------------------------------

# Keeps only the first match, replaces it with $Replacement, drops
# all remaining matches (their surrounding whitespace is preserved).
function Replace-Block {
    param(
        [string]$InputText,
        [System.Text.RegularExpressions.MatchCollection]$Matches,
        [string]$Replacement
    )
    if ($Matches.Count -eq 0) { return $InputText }

    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.Append($InputText.Substring(0, $Matches[0].Index))
    [void]$sb.Append($Replacement)

    $prevEnd = $Matches[0].Index + $Matches[0].Length
    for ($i = 1; $i -lt $Matches.Count; $i++) {
        $m = $Matches[$i]
        [void]$sb.Append($InputText.Substring($prevEnd, $m.Index - $prevEnd))
        $prevEnd = $m.Index + $m.Length
    }
    [void]$sb.Append($InputText.Substring($prevEnd))
    return $sb.ToString()
}

# --- CSS: collapse all <link rel="stylesheet" ...> into one ---
$newHtml = Replace-Block `
    -InputText   $html `
    -Matches     $cssMatches `
    -Replacement '<link rel="stylesheet" href="./styles/styles.css">'

# --- JS: re-scan (positions shifted after the CSS replacement) ---
$jsMatches2 = [regex]::Matches($newHtml, $jsRegex)

$newHtml = Replace-Block `
    -InputText   $newHtml `
    -Matches     $jsMatches2 `
    -Replacement '<script src="./js/script.js"></script>'

# --- Freshen up the header comments so they don't lie ---
$newHtml = $newHtml -replace `
    '<!--\s*Main Stylesheet \(split files, loaded in order\)\s*-->', `
    '<!-- Bundled Stylesheet -->'
$newHtml = $newHtml -replace `
    '<!--\s*JavaScript \(split files, loaded in order\)\s*-->', `
    '<!-- Bundled JavaScript -->'

# --- Collapse runs of 3+ blank lines into a single blank line ---
$newHtml = [regex]::Replace($newHtml, '(\r?\n[ \t]*){3,}', "`r`n`r`n")

Write-Text (Join-Path $DistFolder "index.html") $newHtml

# ---------------------------------------------------------------
# 9. Summary
# ---------------------------------------------------------------
function Format-Size {
    param([long]$Bytes)
    if ($Bytes -ge 1MB) { return "{0:N1} MB" -f ($Bytes / 1MB) }
    if ($Bytes -ge 1KB) { return "{0:N1} KB" -f ($Bytes / 1KB) }
    return "$Bytes B"
}

$cssSize = (Get-Item $cssOut).Length
$jsSize  = (Get-Item $jsOut).Length

Write-Host ""
Write-Host "Build complete." -ForegroundColor Green
Write-Host ("  styles/styles.css   {0}" -f (Format-Size $cssSize))
Write-Host ("  js/script.js        {0}" -f (Format-Size $jsSize))
Write-Host ("  dist/               {0}" -f $DistFolder)
Write-Host ""
Write-Host "Next: run .\package-extension.ps1 to produce the .zip / .xpi" -ForegroundColor Cyan

# ---------------------------------------------------------------
# 10. Warnings (printed last so they're impossible to miss)
# ---------------------------------------------------------------
if ($Warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Yellow
    Write-Host " WARNINGS" -ForegroundColor Yellow
    Write-Host "============================================================" -ForegroundColor Yellow
    foreach ($w in $Warnings) {
        Write-Host $w -ForegroundColor Yellow
    }
    Write-Host ""
}