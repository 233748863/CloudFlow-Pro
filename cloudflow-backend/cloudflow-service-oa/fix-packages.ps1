# Fix package names in OA module
$oaPath = "src\main\java\com\cloudflow\oa"
$javaFiles = Get-ChildItem -Path $oaPath -Filter "*.java" -Recurse
$count = 0

foreach ($file in $javaFiles) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $newContent = $content -replace 'package com\.cloudflow\.workflow', 'package com.cloudflow.oa'
    $newContent = $newContent -replace 'import com\.cloudflow\.workflow', 'import com.cloudflow.oa'
    
    if ($content -ne $newContent) {
        Set-Content -Path $file.FullName -Value $newContent -Encoding UTF8 -NoNewline
        $count++
        Write-Host "Updated: $($file.Name)"
    }
}

Write-Host "Done! Updated $count files"
