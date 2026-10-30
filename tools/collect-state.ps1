$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$OutputPath = Join-Path $Root "IMS_NETWORK_STATE_BUNDLE.txt"

Set-Location $Root

$Lines = New-Object System.Collections.Generic.List[string]

function Add-Line {
    param([string]$Text = "")
    $Lines.Add($Text)
}

function Add-Section {
    param([string]$Title)

    Add-Line ""
    Add-Line ("=" * 78)
    Add-Line $Title
    Add-Line ("=" * 78)
}

function Add-CommandOutput {
    param(
        [string]$Label,
        [scriptblock]$Command
    )

    Add-Line "$Label"

    try {
        $Result = & $Command 2>&1

        if ($null -eq $Result -or @($Result).Count -eq 0) {
            Add-Line "(no output)"
        }
        else {
            foreach ($Item in @($Result)) {
                Add-Line ([string]$Item)
            }
        }
    }
    catch {
        Add-Line ("Unavailable: " + $_.Exception.Message)
    }
}

function Add-SafeFile {
    param(
        [string]$RelativePath,
        [int]$MaxLines = 400
    )

    $FullPath = Join-Path $Root $RelativePath

    Add-Line ""
    Add-Line "--- $RelativePath ---"

    if (-not (Test-Path $FullPath -PathType Leaf)) {
        Add-Line "(not present)"
        return
    }

    $Content = @(Get-Content $FullPath -ErrorAction Stop)

    if ($Content.Count -gt $MaxLines) {
        $Content = $Content | Select-Object -First $MaxLines
        $Truncated = $true
    }
    else {
        $Truncated = $false
    }

    foreach ($Line in $Content) {
        Add-Line ([string]$Line)
    }

    if ($Truncated) {
        Add-Line "[truncated after $MaxLines lines]"
    }
}

Add-Line "# IMS NETWORK STATE BUNDLE"
Add-Line "# GENERATED FROM AN EXPLICIT SAFE ALLOWLIST"
Add-Line "# DO NOT ADD SECRET FILES OR ENVIRONMENT VALUES TO THIS COLLECTOR"

Add-Section "1. GENERATION INFORMATION"

Add-Line ("Generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss K"))
Add-Line ("Repository: " + $Root)

Add-Section "2. TOOL VERSIONS"

Add-CommandOutput "Node:" { node --version }
Add-CommandOutput "npm:" { npm --version }
Add-CommandOutput "Git:" { git --version }

$VercelCommand = Get-Command vercel -ErrorAction SilentlyContinue

if ($VercelCommand) {
    Add-CommandOutput "Vercel CLI:" { vercel --version }
}
else {
    Add-Line "Vercel CLI:"
    Add-Line "(not installed)"
}

Add-Section "3. GIT STATE"

Add-CommandOutput "Current branch:" { git branch --show-current }
Add-CommandOutput "Current commit:" { git rev-parse HEAD }

Add-Line ""
Add-CommandOutput "git status --short:" { git status --short }

Add-Line ""
Add-CommandOutput "Recent commits:" { git log --oneline -10 }

Add-Section "4. BOUNDED REPOSITORY TREE"

$ExcludedDirectories = @(
    ".git",
    ".next",
    "node_modules"
)

$TreeItems = Get-ChildItem -Path $Root -Recurse -Force |
    Where-Object {
        $FullName = $_.FullName

        $Excluded = $false

        foreach ($Directory in $ExcludedDirectories) {
            $Marker = [IO.Path]::DirectorySeparatorChar + $Directory + [IO.Path]::DirectorySeparatorChar

            if ($FullName.Contains($Marker) -or $FullName.EndsWith([IO.Path]::DirectorySeparatorChar + $Directory)) {
                $Excluded = $true
                break
            }
        }

        if ($_.Name -eq "IMS_NETWORK_STATE_BUNDLE.txt") {
            $Excluded = $true
        }

        -not $Excluded
    } |
    Sort-Object FullName |
    Select-Object -First 300

foreach ($Item in $TreeItems) {
    $Relative = $Item.FullName.Substring($Root.Length).TrimStart("\")
    $Prefix = if ($Item.PSIsContainer) { "[DIR] " } else { "[FILE] " }

    Add-Line ($Prefix + $Relative)
}

if (@($TreeItems).Count -ge 300) {
    Add-Line "[tree capped at 300 entries]"
}

Add-Section "5. PACKAGE AND TYPESCRIPT CONFIGURATION"

Add-SafeFile "package.json" 300
Add-SafeFile "tsconfig.json" 300
Add-SafeFile "next.config.ts" 300
Add-SafeFile "components.json" 300

Add-Section "6. SELECTED PACKAGE VERSIONS"

Add-CommandOutput "Top-level npm packages:" { npm list --depth=0 }

Add-Section "7. DATABASE / MIGRATION FILE STATUS"

$DatabaseFiles = @(
    "drizzle.config.ts",
    "src\server\db\schema.ts",
    "src\server\db\index.ts"
)

foreach ($DatabaseFile in $DatabaseFiles) {
    Add-SafeFile $DatabaseFile 300
}

$DrizzlePath = Join-Path $Root "drizzle"

Add-Line ""
Add-Line "Migration files:"

if (Test-Path $DrizzlePath -PathType Container) {
    $MigrationFiles = Get-ChildItem $DrizzlePath -File -Recurse |
        Sort-Object FullName |
        Select-Object -First 100

    if (@($MigrationFiles).Count -eq 0) {
        Add-Line "(none)"
    }
    else {
        foreach ($File in $MigrationFiles) {
            Add-Line $File.FullName.Substring($Root.Length).TrimStart("\")
        }
    }
}
else {
    Add-Line "(drizzle directory not present)"
}

Add-Section "8. SELECTED ARCHITECTURE DOCUMENTATION"

Add-SafeFile "docs\architecture\overview.md" 400
Add-SafeFile "docs\development-workflow.md" 400

Add-Line ""
Add-Line "ADR files:"

$AdrPath = Join-Path $Root "docs\adr"

if (Test-Path $AdrPath -PathType Container) {
    Get-ChildItem $AdrPath -File |
        Sort-Object Name |
        ForEach-Object {
            Add-Line $_.Name
        }
}
else {
    Add-Line "(ADR directory not present)"
}

Add-Section "9. TEST FILE LIST"

$TestPatterns = @(
    "*.test.ts",
    "*.test.tsx",
    "*.spec.ts",
    "*.spec.tsx"
)

$TestFiles = foreach ($Pattern in $TestPatterns) {
    Get-ChildItem -Path $Root -Recurse -File -Filter $Pattern -ErrorAction SilentlyContinue |
        Where-Object {
            $_.FullName -notlike "*\node_modules\*" -and
            $_.FullName -notlike "*\.next\*"
        }
}

$TestFiles = @($TestFiles | Sort-Object FullName -Unique | Select-Object -First 150)

if ($TestFiles.Count -eq 0) {
    Add-Line "(no test files currently present)"
}
else {
    foreach ($File in $TestFiles) {
        Add-Line $File.FullName.Substring($Root.Length).TrimStart("\")
    }
}

Add-Section "10. ENVIRONMENT VARIABLE NAMES"

Add-Line "Source: .env.example"
Add-Line "Values are NEVER collected."

$EnvExample = Join-Path $Root ".env.example"

if (Test-Path $EnvExample -PathType Leaf) {
    $VariableNames = Get-Content $EnvExample |
        Where-Object {
            $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*='
        } |
        ForEach-Object {
            ($_ -split "=", 2)[0].Trim()
        } |
        Sort-Object -Unique

    if (@($VariableNames).Count -eq 0) {
        Add-Line "(no environment variables declared yet)"
    }
    else {
        foreach ($Name in $VariableNames) {
            Add-Line $Name
        }
    }
}
else {
    Add-Line "(.env.example not present)"
}

Add-Section "11. CURRENT QUALITY-CHECK NOTE"

Add-Line "This collector does not automatically run lint, typecheck, tests, or build."
Add-Line "Quality checks must be run intentionally before claiming they passed."

Add-Section "12. SAFETY CONTRACT"

Add-Line "The collector intentionally does NOT read:"
Add-Line "- .env.local"
Add-Line "- environment variable values"
Add-Line "- DATABASE_URL"
Add-Line "- API keys"
Add-Line "- authentication/session tokens"
Add-Line "- cookies"
Add-Line "- GitHub credentials"
Add-Line "- Vercel credentials"
Add-Line "- Redis credentials"
Add-Line "- private keys"
Add-Line "- node_modules"
Add-Line "- .next"
Add-Line "- database dumps"
Add-Line "- browser data"

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($OutputPath, $Lines, $Utf8NoBom)

Write-Host ""
Write-Host "State bundle created successfully:" -ForegroundColor Green
Write-Host $OutputPath
Write-Host ""
Write-Host "Review the generated file before sharing it." -ForegroundColor Yellow
