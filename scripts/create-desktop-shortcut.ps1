# ============================================================
#  AirSnap - put a "Start AirSnap" button on the Desktop.
#  Run once:  right-click -> Run with PowerShell
#  (or: powershell -ExecutionPolicy Bypass -File scripts\create-desktop-shortcut.ps1)
# ============================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bat  = Join-Path $root 'Start AirSnap.bat'
$png  = Join-Path $root 'assets\icon.png'
$ico  = Join-Path $root 'assets\airsnap.ico'

# 1. Build a Windows .ico from the app icon (256px PNG inside an ICO wrapper).
if (-not (Test-Path $ico)) {
    Add-Type -AssemblyName System.Drawing
    $src = [System.Drawing.Image]::FromFile($png)
    $bmp = New-Object System.Drawing.Bitmap 256, 256
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($src, 0, 0, 256, 256)
    $g.Dispose(); $src.Dispose()

    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $pngBytes = $ms.ToArray()

    $fs = [System.IO.File]::Create($ico)
    $w = New-Object System.IO.BinaryWriter $fs
    $w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]1)      # ICONDIR
    $w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0)
    $w.Write([UInt16]1); $w.Write([UInt16]32)                           # planes, bpp
    $w.Write([UInt32]$pngBytes.Length); $w.Write([UInt32]22)            # size, offset
    $w.Write($pngBytes)
    $w.Close()
}

# 2. Desktop shortcut (works with OneDrive-redirected desktops too).
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'AirSnap.lnk'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = $bat
$lnk.WorkingDirectory = $root
$lnk.IconLocation = "$ico,0"
$lnk.Description = 'Start AirSnap (app + live drone viewer)'
$lnk.Save()

Write-Host "Created $lnkPath"
