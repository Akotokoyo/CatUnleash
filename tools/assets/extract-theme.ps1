param(
    [Parameter(Mandatory = $true)]
    [string]$Theme
)

$ErrorActionPreference = "Stop"
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$temp = Join-Path $root "tools\temp\assets"
$extract = Join-Path $root "tools\assets\extract-fuchsia-sprites.mjs"
$catsOut = Join-Path $root "public\assets\cats\$Theme"
$pugsOut = Join-Path $root "public\assets\pugs\$Theme"

$cursorAssetsCandidates = @(
    Join-Path $env:USERPROFILE ".cursor\projects\c-git-CatUnleash\assets"
    Join-Path $env:USERPROFILE ".cursor\projects\c-git-catunleash\assets"
)

New-Item -ItemType Directory -Force -Path $temp, $catsOut, $pugsOut | Out-Null

$catNames = "orange_center.png,maxwell_center.png,paralized_center.png,tuxedo_center.png,barong_center.png"
$frontNames = "orange_front.png,maxwell_front.png,paralized_front.png,tuxedo_front.png,barong_front.png"
$pugNames = "carlino_bark.png,carlino_meme.png,carlino_flee.png"

function Move-Sheet([string]$name) {
    foreach ($src in $cursorAssetsCandidates) {
        $from = Join-Path $src $name
        $to = Join-Path $temp $name
        if (Test-Path $from) {
            Move-Item -Force $from $to
            return $to
        }
    }
    $to = Join-Path $temp $name
    if (Test-Path $to) { return $to }
    throw "Foglio mancante: $name (mettilo in tools\temp\assets\ o in .cursor\projects\...\assets\)"
}

$frontSheet = if ($Theme -eq "city") { "city_cats_front_v2_sheet.png" } else { "${Theme}_cats_front_sheet.png" }
$pugSheet = if ($Theme -eq "city") { "city_pugs_v2_sheet.png" } else { "${Theme}_pugs_sheet.png" }

$center = Move-Sheet "${Theme}_cats_center_sheet.png"
$front = Move-Sheet $frontSheet
$pugs = Move-Sheet $pugSheet

node $extract $center --size 256 --out $catsOut --names $catNames
node $extract $front --size 256 --out $catsOut --names $frontNames
node $extract $pugs --size 512 --out $pugsOut --names $pugNames

Write-Host "OK $Theme"
