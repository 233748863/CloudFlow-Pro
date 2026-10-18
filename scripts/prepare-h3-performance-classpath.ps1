param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r146')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h3-performance-classpath-20261010-$Round"
if(Test-Path -LiteralPath $Output){throw 'Preserve earlier classpath preparation'}
$Build=Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json
foreach($Entry in $Build){if((Get-FileHash -LiteralPath (Join-Path $Root $Entry.Path)).Hash -ne $Entry.Hash){throw 'Backend changed since verified build'}}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$ClassPath=Join-Path $Root 'cloudflow-backend/cloudflow-service-hr/target/batch-d-classpath.txt'
[IO.File]::Copy($ClassPath,(Join-Path $Output 'before-classpath.txt'),$false)
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
Push-Location (Join-Path $Root 'cloudflow-backend')
try {
    & mvn -q -pl cloudflow-service-hr dependency:build-classpath '-Dmdep.outputFile=target/batch-d-classpath.txt' '-Dmdep.regenerateFile=true' *> (Join-Path $Output 'maven.log')
    if($LASTEXITCODE -ne 0){throw 'HR verification classpath generation failed; retain original diagnostics'}
}finally{Pop-Location}
$Paths=([IO.File]::ReadAllText($ClassPath)).Trim().Split([IO.Path]::PathSeparator)
$Inputs=@(foreach($Dependency in $Paths){
    $Path=[IO.Path]::GetFullPath($Dependency)
    if(-not ($Path.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith('D:\CloudFlowProCache\',[StringComparison]::OrdinalIgnoreCase))){throw 'HR dependency still points outside the approved data drive'}
    if(-not (Test-Path -LiteralPath $Path -PathType Leaf)){throw 'Installed HR dependency file is unavailable'}
    [pscustomobject]@{Path=$Path;Hash=(Get-FileHash -LiteralPath $Path).Hash}
})
[IO.File]::Copy($ClassPath,(Join-Path $Output 'after-classpath.txt'),$false)
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($Entry in $Build){if((Get-FileHash -LiteralPath (Join-Path $Root $Entry.Path)).Hash -ne $Entry.Hash){throw 'Backend source changed while generating classpath'}}
[pscustomobject]@{Passed=$true;DependencyFiles=$Inputs.Count;DesktopReferences=0;Backend=$BackendRound;ProductModified=$false;ProductionModified=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H3_PERFORMANCE_CLASSPATH: passed=true; dependency_files=$($Inputs.Count); desktop_references=0; source_changes=0"
