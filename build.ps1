$ErrorActionPreference = 'Stop'
$fixtureRoot = Join-Path $PSScriptRoot '.cache'
New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
$fixtures = @(
    @{ Name = 'semi-auto-farm'; Mod = 2362049; File = 5908246; Source = 'semi-auto-farm-main/src/v1.3.0/main.mjs' },
    @{ Name = 'semi-core'; Mod = 2253323; File = 5767689; Source = 'semi-core-and-utils-main/src/v1.3.0/main.mjs' }
)
foreach ($fixture in $fixtures) {
    if (Test-Path -LiteralPath (Join-Path $fixtureRoot $fixture.Source)) { continue }
    $fixtureArchive = Join-Path $fixtureRoot ($fixture.Name + '.zip')
    Invoke-WebRequest -Uri "https://g-2869.modapi.io/v1/games/2869/mods/$($fixture.Mod)/files/$($fixture.File)/download" -OutFile $fixtureArchive
    Expand-Archive -LiteralPath $fixtureArchive -DestinationPath $fixtureRoot -Force
    if (!(Test-Path -LiteralPath (Join-Path $fixtureRoot $fixture.Source))) { throw "Missing upstream fixture: $($fixture.Source)" }
}
Push-Location -LiteralPath $PSScriptRoot
try {
    node --test
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed; release archive was not built.' }
    $releasePath = Join-Path $PSScriptRoot 'krokys-armed-to-the-seeds-0.1.1.zip'
    $releaseFiles = @('manifest.json', 'setup.mjs', 'combat-farming.mjs', 'assets/icon.png')
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $releaseStream = [System.IO.File]::Create($releasePath)
    $releaseArchive = [System.IO.Compression.ZipArchive]::new($releaseStream, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($releaseFile in $releaseFiles) {
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($releaseArchive, (Join-Path $PSScriptRoot $releaseFile), $releaseFile) | Out-Null
        }
    } finally {
        $releaseArchive.Dispose()
        $releaseStream.Dispose()
    }
    $releaseArchive = [System.IO.Compression.ZipFile]::OpenRead($releasePath)
    try {
        if ($releaseArchive.Entries.Count -ne $releaseFiles.Count) { throw 'Unexpected release archive contents.' }
        foreach ($releaseFile in $releaseFiles) {
            if (!$releaseArchive.GetEntry($releaseFile)) { throw "Release archive is missing $releaseFile" }
        }
    } finally {
        $releaseArchive.Dispose()
    }
    Write-Output $releasePath
} finally {
    Pop-Location
}
