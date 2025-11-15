# Script to convert states from array format to Record format in test files
$testFiles = @(
    "c:\Users\sjefv\tsFlow\packages\flow-engine\src\__tests__\state-machine.test.ts",
    "c:\Users\sjefv\tsFlow\packages\flow-engine\src\__tests__\flow-engine.test.ts",
    "c:\Users\sjefv\tsFlow\packages\flow-engine\src\__tests__\yaml-parser.test.ts"
)

foreach ($file in $testFiles) {
    Write-Host "Processing $file..."
    $content = Get-Content $file -Raw
    
    # Replace states: [ with states: {
    $content = $content -replace 'states:\s*\[', 'states: {'
    
    # Replace patterns like },\s*{$ with },  (keep comma between objects)
    # This is complex, so we'll do a simpler approach
    
    # Replace closing ] at end of states with }
    $content = $content -replace '\]\s*(\};?\s*\n)', '}$1'
    
    # Save back
    Set-Content -Path $file -Value $content
}

Write-Host "Conversion complete!"
