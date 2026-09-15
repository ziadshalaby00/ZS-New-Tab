# package-extension.ps1
# Packs all files inside the .\dist folder into a .zip and/or a .xpi file.
# Uses System.IO.Compression directly (not Compress-Archive) to guarantee forward-slash
# paths inside the zip, since Firefox resolves moz-extension:// paths literally and
# Compress-Archive on Windows can write backslash-separated entries for subfolders,
# which breaks loading of scripts inside subdirectories (e.g. js/script.shared.js).
#
# Usage:
#   .\package-extension.ps1                 -> Builds BOTH .zip and .xpi, name from dist\manifest.json
#   .\package-extension.ps1 -Zip            -> Builds ONLY the .zip
#   .\package-extension.ps1 -Xpi            -> Builds ONLY the .xpi
#   .\package-extension.ps1 -Name my-name   -> Uses a custom name -> my-name.zip / my-name.xpi
#
# =====================================================================
# Run: powershell -ExecutionPolicy Bypass -File .\package-extension.ps1
# =====================================================================

param(
    [string]$Name,
    [switch]$Zip,
    [switch]$Xpi
)

# If neither -Zip nor -Xpi was passed, build both (keeps old behavior working)
if (-not $Zip -and -not $Xpi) {
    $Zip = $true
    $Xpi = $true
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$DistFolder = Join-Path (Get-Location) "dist"

# =============================================================
# Make sure the dist folder actually exists
# =============================================================

if (-not (Test-Path $DistFolder)) {
    Write-Host "Folder 'dist' was not found. Build your extension into .\dist first." -ForegroundColor Red
    exit 1
}

# =============================================================
# Get extension name from dist\manifest.json
# =============================================================

if (-not $Name) {
    $manifestPath = Join-Path $DistFolder "manifest.json"
    if (Test-Path $manifestPath) {
        try {
            $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
            $Name = ($manifest.name -replace '\s+', '-').ToLower()
        }
        catch {
            $Name = "extension"
        }
    }
    else {
        $Name = "extension"
    }
}

$zipPath = Join-Path (Get-Location) "$Name.zip"
$xpiPath = Join-Path (Get-Location) "$Name.xpi"

# =============================================================
# Remove previous builds (only for the formats being built)
# =============================================================

$pathsToClean = @()
if ($Zip) { $pathsToClean += $zipPath }
if ($Xpi) { $pathsToClean += $xpiPath }

foreach ($path in $pathsToClean) {
    if (Test-Path $path) {
        Remove-Item $path -Force
    }
}

# =============================================================
# Collect files from dist while preserving relative paths
# =============================================================

$rootPath = $DistFolder

$files = Get-ChildItem -Path $DistFolder -Recurse -File -Force

if ($files.Count -eq 0) {
    Write-Host "There are no files inside 'dist' to compress." -ForegroundColor Yellow
    exit 1
}

# =============================================================
# Build the zip manually so entry names always use "/" separators
# (this is the part that fixes moz-extension:// path resolution)
# =============================================================

function New-ExtensionArchive {
    param(
        [string]$OutputPath
    )

    $zipStream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::Create)
    $archive = New-Object System.IO.Compression.ZipArchive($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)

    try {
        foreach ($file in $files) {
            $relativePath = $file.FullName.Substring($rootPath.Length + 1)

            # Force forward slashes regardless of OS path separator
            $entryName = $relativePath -replace '\\', '/'

            $entry = $archive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)

            $entryStream = $entry.Open()
            $fileStream = [System.IO.File]::OpenRead($file.FullName)
            try {
                $fileStream.CopyTo($entryStream)
            }
            finally {
                $fileStream.Dispose()
                $entryStream.Dispose()
            }
        }
    }
    finally {
        $archive.Dispose()
        $zipStream.Dispose()
    }
}

# Build whichever format(s) were requested.
# If both are requested, build the .zip once and copy the same bytes to .xpi
# (same content, .xpi is just the extension Firefox expects) instead of
# compressing twice.
if ($Zip) {
    New-ExtensionArchive -OutputPath $zipPath
}

if ($Xpi) {
    if ($Zip) {
        Copy-Item -Path $zipPath -Destination $xpiPath -Force
    }
    else {
        New-ExtensionArchive -OutputPath $xpiPath
    }
}

# =============================================================
# Format file size
# =============================================================

function Format-FileSize {
    param([long]$Bytes)

    if ($Bytes -ge 1GB) {
        return "{0:N1} GB" -f ($Bytes / 1GB)
    }
    elseif ($Bytes -ge 1MB) {
        return "{0:N1} MB" -f ($Bytes / 1MB)
    }
    else {
        return "{0:N1} KB" -f ($Bytes / 1KB)
    }
}

$createdFiles = @()
if ($Zip) { $createdFiles += "$Name.zip" }
if ($Xpi) { $createdFiles += "$Name.xpi" }

$sizePath = if ($Zip) { $zipPath } else { $xpiPath }
$sizeText = Format-FileSize -Bytes (Get-Item $sizePath).Length

Write-Host ""
Write-Host "$($createdFiles -join ' and ') successfully created ($sizeText each)" -ForegroundColor Green
Write-Host ""