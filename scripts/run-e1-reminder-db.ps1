param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r119')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "e1-reminder-database-20261007-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original reminder database evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@{}
function Track([string]$File,[string]$Expected=''){
    $Full=[IO.Path]::GetFullPath($File)
    $Hash=(Get-FileHash -LiteralPath $Full).Hash
    if($Expected -and $Hash -ne $Expected){throw 'Database check input differs from build'}
    $Inputs[$Full]=$Hash
}
foreach($Entry in @(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)){Track (Join-Path $Root $Entry.Path) $Entry.Hash}
$Scripts=@($PSCommandPath,(Join-Path $Root 'scripts/verify-batch-e.ps1'),(Join-Path $Root 'scripts/verify-batch-e-db.ps1'))+@(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/crm-checks') -Filter '*.java' -File|ForEach-Object FullName)
foreach($File in $Scripts){
    Track $File
    $Original=Join-Path $Output ('originals/'+[IO.Path]::GetRelativePath($Root,$File))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Original))|Out-Null
    [IO.File]::Copy($File,$Original,$false)
}
$DependencyFile=Join-Path $Root 'cloudflow-backend/cloudflow-service-crm/target/batch-e-classpath.txt'
Track $DependencyFile
foreach($Entry in (Get-Content -LiteralPath $DependencyFile -Raw).Trim().Split(';')){
    if(Test-Path -LiteralPath $Entry -PathType Container){foreach($File in Get-ChildItem -LiteralPath $Entry -Recurse -File){Track $File.FullName}}
    else{Track $Entry}
}
$ClassRoots=@((Join-Path $Root 'cloudflow-backend/cloudflow-service-crm/target/classes'))+@(Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/cloudflow-common') -Directory|ForEach-Object{Join-Path $_.FullName 'target/classes'}|Where-Object{Test-Path -LiteralPath $_})
foreach($Directory in $ClassRoots){foreach($File in Get-ChildItem -LiteralPath $Directory -Recurse -File){Track $File.FullName}}
$Inputs.Keys|Sort-Object|ForEach-Object{[pscustomobject]@{Path=$_;Hash=$Inputs[$_]}}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
& scripts/verify-batch-e-db.ps1 -SkipBuild -ArtifactRoot (Join-Path $Output 'database') *> (Join-Path $Output 'checks.log')
$Result=$LASTEXITCODE
foreach($File in $Inputs.Keys){if((Get-FileHash -LiteralPath $File).Hash -ne $Inputs[$File]){throw 'Database verification input changed'}}
$Log=Get-Content -LiteralPath (Join-Path $Output 'checks.log') -Raw
if($Result -ne 0 -or -not $Log.Contains('PASS: isolated CRM services with real tenant/data-scope SQL and transactions') -or -not $Log.Contains('Temporary data removed; logs retained')){throw 'Reminder database verification failed; retain evidence'}
[pscustomobject]@{Passed=$true;Backend=$BackendRound;Inputs=$Inputs.Count;OriginalFiles=$Scripts.Count;InputChanges=0;TemporaryDatabaseRemoved=$true;ProductionModified=$false;GlobalComplete=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"E1_REMINDER_DATABASE: inputs=$($Inputs.Count); originals=$($Scripts.Count); changed=0; temporary_database_removed=true; exit=0"
