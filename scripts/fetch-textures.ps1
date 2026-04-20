<#
Downloads Minecraft item/block textures from InventivetalentDev/minecraft-assets
(a mirror of Mojang assets) for every entry in palette.csv.

Output: ./items/<normalized_name>.png
  where <normalized_name> matches palette CSV item -> lower, spaces -> underscores.

Usage:
  pwsh -File scripts/fetch-textures.ps1
  pwsh -File scripts/fetch-textures.ps1 -Version 1.20.4
#>

[CmdletBinding()]
param(
    [string]$Version = '1.20.4',
    [string]$PaletteCsv = 'palette.csv',
    [string]$OutDir = 'items'
)

$ErrorActionPreference = 'Stop'

# Map palette item name -> (folder, filename) in minecraft assets.
# folder is 'item' or 'block'. Filename is without .png.
# Some entries are animated / have multiple frames; we pick a sensible single-frame texture.
$TextureMap = @{
    'raw_iron'              = @('item',  'raw_iron')
    'egg'                   = @('item',  'egg')
    'pink_dye'              = @('item',  'pink_dye')
    'crimson_stem'          = @('block', 'crimson_stem')
    'beetroot'              = @('item',  'beetroot')
    'chorus_fruit'          = @('item',  'chorus_fruit')
    'warped_hyphae'         = @('block', 'warped_stem')  # hyphae uses stem texture
    'ice'                   = @('block', 'ice')
    'magenta_dye'           = @('item',  'magenta_dye')
    'purple_dye'            = @('item',  'purple_dye')
    'purpur_block'          = @('block', 'purpur_block')
    'mycelium'              = @('block', 'mycelium_top')
    'lapis_lazuli'          = @('item',  'lapis_lazuli')
    'block_of_lapis_lazuli' = @('block', 'lapis_block')
    'lapis_lazuli_ore'      = @('block', 'lapis_ore')
    'light_blue_dye'        = @('item',  'light_blue_dye')
    'cyan_dye'              = @('item',  'cyan_dye')
    'prismarine_crystals'   = @('item',  'prismarine_crystals')
    'warped_stem'           = @('block', 'warped_stem')
    'warped_nylium'         = @('block', 'warped_nylium')
    'warped_wart_block'     = @('block', 'warped_wart_block')
    'lime_dye'              = @('item',  'lime_dye')
    'grass'                 = @('block', 'grass_block_top')
    'glow_lichen'           = @('block', 'glow_lichen')
    'slimeball'             = @('item',  'slime_ball')
    'green_dye'             = @('item',  'green_dye')
    'poisonous_potato'      = @('item',  'poisonous_potato')
    'emerald'               = @('item',  'emerald')
    'oak_leaves'            = @('block', 'oak_leaves')
    'pumpkin_seeds'         = @('item',  'pumpkin_seeds')
    'gold_nugget'           = @('item',  'gold_nugget')
    'yellow_dye'            = @('item',  'yellow_dye')
    'glowstone_dust'        = @('item',  'glowstone_dust')
    'orange_dye'            = @('item',  'orange_dye')
    'magma_cream'           = @('item',  'magma_cream')
    'dark_oak_log'          = @('block', 'dark_oak_log')
    'melon_seeds'           = @('item',  'melon_seeds')
    'birch_wood'            = @('block', 'birch_log')
    'cocoa_beans'           = @('item',  'cocoa_beans')
    'podzol'                = @('block', 'podzol_top')
    'soul_sand'             = @('block', 'soul_sand')
    'charcoal'              = @('item',  'charcoal')
    'apple'                 = @('item',  'apple')
    'spider_eye'            = @('item',  'spider_eye')
    'crimson_nylium'        = @('block', 'crimson_nylium')
    'brick'                 = @('item',  'brick')
    'crimson_hyphae'        = @('block', 'crimson_stem')  # hyphae uses stem texture
    'red_dye'               = @('item',  'red_dye')
    'nether_wart'           = @('item',  'nether_wart')
    'snow'                  = @('block', 'snow')
    'bone_meal'             = @('item',  'bone_meal')
    'cobweb'                = @('block', 'cobweb')
    'light_gray_dye'        = @('item',  'light_gray_dye')
    'gray_dye'              = @('item',  'gray_dye')
    'gunpowder'             = @('item',  'gunpowder')
    'brown_mushroom'        = @('block', 'brown_mushroom')
    'ghast_tear'            = @('item',  'ghast_tear')
    'cobbled_deepslate'     = @('block', 'cobbled_deepslate')
    'iron_nugget'           = @('item',  'iron_nugget')
    'flint'                 = @('item',  'flint')
    'ink_sac'               = @('item',  'ink_sac')
}

$baseUrl = "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/$Version/assets/minecraft/textures"

if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir | Out-Null
}

if (-not (Test-Path $PaletteCsv)) {
    throw "Palette CSV not found: $PaletteCsv"
}

$items = Import-Csv -Path $PaletteCsv | ForEach-Object {
    ($_.Item.ToLowerInvariant() -replace '\s+', '_')
}

$ok = 0; $fail = 0; $skipped = 0
foreach ($name in $items) {
    $outPath = Join-Path $OutDir "$name.png"
    if (Test-Path $outPath) {
        Write-Host "[skip] $name (exists)" -ForegroundColor DarkGray
        $skipped++
        continue
    }

    if (-not $TextureMap.ContainsKey($name)) {
        Write-Warning "No texture mapping for '$name', skipping."
        $fail++
        continue
    }

    $folder, $file = $TextureMap[$name]
    $url = "$baseUrl/$folder/$file.png"

    try {
        Invoke-WebRequest -Uri $url -OutFile $outPath -UseBasicParsing
        Write-Host "[ok]   $name <- $folder/$file.png" -ForegroundColor Green
        $ok++
    } catch {
        Write-Warning "Failed $name from $url : $($_.Exception.Message)"
        $fail++
    }
}

Write-Host ""
Write-Host "Done. ok=$ok fail=$fail skipped=$skipped  -> $OutDir/" -ForegroundColor Cyan
