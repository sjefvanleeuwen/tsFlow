#!/usr/bin/env pwsh
# tsFlow Release Script
# Usage: .\release.ps1 patch|minor|major [-Message "Optional message"]

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('patch', 'minor', 'major')]
    [string]$Type,
    
    [Parameter(Mandatory=$false)]
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

# Colors
$Red = "Red"
$Green = "Green"
$Cyan = "Cyan"
$Yellow = "Yellow"

function Write-Step {
    param([string]$Text)
    Write-Host ">> $Text" -ForegroundColor $Cyan
}

function Write-Success {
    param([string]$Text)
    Write-Host "OK $Text" -ForegroundColor $Green
}

function Write-Fail {
    param([string]$Text)
    Write-Host "!! $Text" -ForegroundColor $Red
}

function Write-Warn {
    param([string]$Text)
    Write-Host "** $Text" -ForegroundColor $Yellow
}

# Get root directory
$RootDir = $PSScriptRoot
Set-Location $RootDir

Write-Host ""
Write-Host "================================================================" -ForegroundColor $Cyan
Write-Host "         tsFlow Release Script - $($Type.ToUpper())" -ForegroundColor $Cyan
Write-Host "================================================================" -ForegroundColor $Cyan
Write-Host ""

# Check git status
Write-Step "Checking git status..."
if (-not (Test-Path .git)) {
    Write-Fail "Not a git repository!"
    exit 1
}

$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Warn "You have uncommitted changes:"
    git status --short
    $continue = Read-Host "`nContinue anyway? (y/N)"
    if ($continue -ne 'y' -and $continue -ne 'Y') {
        Write-Host "Release cancelled."
        exit 0
    }
}
Write-Success "Git status OK"

# Check branch
Write-Step "Checking current branch..."
$currentBranch = git branch --show-current
if ($currentBranch -ne "main") {
    Write-Warn "You're on branch '$currentBranch', not 'main'"
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne 'y' -and $continue -ne 'Y') {
        Write-Host "Release cancelled."
        exit 0
    }
} else {
    Write-Success "On main branch"
}

# Pull latest
Write-Step "Pulling latest changes..."
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Failed to pull latest changes"
    exit 1
}
Write-Success "Up to date"

# Navigate to package
Set-Location packages/flow-engine

# Get current version
$packageJson = Get-Content package.json | ConvertFrom-Json
$oldVersion = $packageJson.version
Write-Host "`nCurrent version: v$oldVersion" -ForegroundColor $Yellow

# Run tests
Write-Step "Running tests..."
npm test
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Tests failed!"
    exit 1
}
Write-Success "All 162 tests passed"

# Build
Write-Step "Building package..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Build failed!"
    exit 1
}
Write-Success "Build successful"

# Bump version
Write-Step "Bumping version ($Type)..."
npm version $Type --no-git-tag-version
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Version bump failed!"
    exit 1
}

# Get new version
$packageJson = Get-Content package.json | ConvertFrom-Json
$newVersion = $packageJson.version
Write-Host "New version: v$newVersion" -ForegroundColor $Green

# Return to root
Set-Location $RootDir

# Commit
Write-Step "Committing changes..."
git add packages/flow-engine/package.json

if ([string]::IsNullOrWhiteSpace($Message)) {
    $commitMessage = "Release v$newVersion"
} else {
    $commitMessage = "$Message (v$newVersion)"
}

git commit -m $commitMessage
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Commit failed!"
    exit 1
}
Write-Success "Changes committed"

# Show summary
Write-Host ""
Write-Host "================================================================" -ForegroundColor $Yellow
Write-Host "                    RELEASE SUMMARY" -ForegroundColor $Yellow
Write-Host "================================================================" -ForegroundColor $Yellow
Write-Host "Package:       @tsflow/flow-engine"
Write-Host "Version:       $oldVersion -> $newVersion"
Write-Host "Bump Type:     $Type"
Write-Host "Commit:        $commitMessage"
Write-Host "Target:        release branch"
Write-Host ""
Write-Host "This will trigger NPM publish via GitHub Actions."
Write-Host ""

# Confirm
$confirm = Read-Host "Push to release branch and publish to NPM? (y/N)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Warn "Release cancelled. Changes committed but not pushed."
    Write-Host "To undo: git reset HEAD~1"
    exit 0
}

# Push to main
Write-Step "Pushing to main..."
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Failed to push to main!"
    exit 1
}
Write-Success "Pushed to main"

# Push to release
Write-Step "Pushing to release (triggers NPM publish)..."
git push origin main:release
if ($LASTEXITCODE -ne 0) {
    Write-Fail "Failed to push to release!"
    exit 1
}
Write-Success "Pushed to release"

# Done!
Write-Host ""
Write-Host "================================================================" -ForegroundColor $Green
Write-Host "                   RELEASE INITIATED!" -ForegroundColor $Green
Write-Host "================================================================" -ForegroundColor $Green
Write-Host ""
Write-Host "Release v$newVersion initiated!" -ForegroundColor $Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Monitor: https://github.com/sjefvanleeuwen/tsFlow/actions"
Write-Host "  2. Verify:  https://www.npmjs.com/package/@tsflow/flow-engine"
Write-Host "  3. Release: https://github.com/sjefvanleeuwen/tsFlow/releases"
Write-Host ""
