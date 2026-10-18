param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r146')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "h3-performance-database-20261010-$Round"
$Backend=Join-Path $Root 'cloudflow-backend'
$Module=Join-Path $Backend 'cloudflow-service-crm'
$StatePath=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
if(Test-Path -LiteralPath $Output){throw 'Preserve earlier H3 performance database evidence'}
$State=Get-Content -LiteralPath $StatePath -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or $State.processes.Count -ne 9 -or $State.services.Count -ne 6){throw 'Owned reference runtime required'}
$OriginalProcesses=@(foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Reference process ownership differs'}
    [pscustomobject]@{Id=$Entry.id;Created=$Observed.CreationDate;Marker=$Entry.marker}
})
$BuildPath=Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
$Build=@(Get-Content -LiteralPath $BuildPath -Raw|ConvertFrom-Json)
foreach($Entry in $Build){
    if((Get-FileHash -LiteralPath ([IO.Path]::GetFullPath($Entry.Path,$Root))).Hash -ne $Entry.Hash){throw 'Product differs from verified backend build'}
}
$ClassPathFile=Join-Path $Module 'target/batch-e-classpath.txt'
$Dependencies=([IO.File]::ReadAllText($ClassPathFile)).Trim()
$CommonModules=@(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory|Where-Object{Test-Path -LiteralPath (Join-Path $_.FullName 'target/classes')})
$CommonClasses=@($CommonModules|ForEach-Object{Join-Path $_.FullName 'target/classes'})
$DependencyPaths=@($Dependencies.Split([IO.Path]::PathSeparator))
foreach($CommonModule in $CommonModules){
    $DependencyPaths=@($DependencyPaths|Where-Object{[IO.Path]::GetFileName($_) -notlike "$($CommonModule.Name)-*.jar"})
}
$ClassDirectories=@((Join-Path $Module 'target/classes'))+$CommonClasses
$ExpectedClassPath=($ClassDirectories+$DependencyPaths) -join [IO.Path]::PathSeparator
$Sources=@('scripts/verify-batch-e-db.ps1','scripts/verify-batch-e.ps1',$PSCommandPath,'.cloudflow-runtime/use-data-drive.ps1')+
    @(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/crm-checks') -File -Filter '*.java'|Where-Object Name -NotLike 'CrmEmail*DatabaseChecks.java'|ForEach-Object{$_.FullName})
$Paths=@($Build.Path)+$Sources+@($BuildPath,$ClassPathFile,$StatePath)
$RuntimePaths=@($DependencyPaths)
foreach($Directory in $ClassDirectories){$RuntimePaths+=@(Get-ChildItem -LiteralPath $Directory -Recurse -File|ForEach-Object{$_.FullName})}
[IO.Directory]::CreateDirectory($Output)|Out-Null
Set-Acl -LiteralPath $Output -AclObject (Get-Acl -LiteralPath (Split-Path -Parent $StatePath))
function Snapshot([string[]]$Files){
    return @(foreach($Path in @($Files|ForEach-Object{[IO.Path]::GetFullPath($_,$Root)}|Sort-Object -Unique)){
        [pscustomobject]@{Path=$Path;Hash=(Get-FileHash -LiteralPath $Path).Hash}
    })
}
$Inputs=Snapshot $Paths
$RuntimeInputs=Snapshot $RuntimePaths
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$RuntimeInputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'runtime-inputs.json') -Encoding utf8NoBOM
foreach($Source in @($Sources|ForEach-Object{[IO.Path]::GetFullPath($_,$Root)}|Sort-Object -Unique)){
    $Copy=Join-Path $Output ('originals/'+[IO.Path]::GetRelativePath($Root,$Source))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy($Source,$Copy,$false)
    if((Get-FileHash -LiteralPath $Copy).Hash -ne (Get-FileHash -LiteralPath $Source).Hash){throw 'Database execution source original differs'}
}
$Exit=0;$FailureType=$null
try {
    & (Join-Path $Root 'scripts/verify-batch-e-db.ps1') -SkipBuild -ArtifactRoot (Join-Path $Output 'database') *> (Join-Path $Output 'run.log')
    if($LASTEXITCODE -ne 0){$Exit=$LASTEXITCODE}
} catch {$Exit=1;$FailureType=$_.Exception.GetType().Name}
$Changes=@(@($Inputs)+@($RuntimeInputs)|Where-Object{-not (Test-Path -LiteralPath $_.Path) -or (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash}).Count
$ReferenceKept=$true
foreach($Entry in $OriginalProcesses){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.Id)"
    if(-not $Observed -or $Observed.CreationDate -ne $Entry.Created -or -not $Observed.CommandLine.Contains($Entry.Marker)){$ReferenceKept=$false}
}
$DatabaseStopped=@(Get-CimInstance Win32_Process -Filter "Name='mysqld.exe'"|Where-Object{$_.CommandLine -and $_.CommandLine.Contains((Join-Path $Output 'database'))}).Count -eq 0
$CheckDirectory=Join-Path $Module 'target/batch-e-checks'
$ActualCompile=Get-Content -LiteralPath (Join-Path $CheckDirectory 'compile.args')
$ClassPathIndex=[Array]::IndexOf($ActualCompile,'-cp')
$ActualClassPath=if($ClassPathIndex -ge 0){$ActualCompile[$ClassPathIndex+1].Trim('"').Replace('/','\')}else{''}
$DependenciesBound=$ActualClassPath -eq $ExpectedClassPath.Replace('/','\')
$ExecutedFiles=@(Get-ChildItem -LiteralPath $CheckDirectory -Recurse -File|ForEach-Object{$_.FullName})
$Compiled=Snapshot $ExecutedFiles
foreach($File in $Compiled){
    $Copy=Join-Path $Output ('compiled-originals/'+[IO.Path]::GetRelativePath($CheckDirectory,$File.Path))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    [IO.File]::Copy($File.Path,$Copy,$false)
    if((Get-FileHash -LiteralPath $Copy).Hash -ne $File.Hash){throw 'Compiled check original differs'}
}
$Compiled|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'compiled-inputs.json') -Encoding utf8NoBOM
$Log=[IO.File]::ReadAllText((Join-Path $Output 'run.log'))
$Match=[regex]::Match($Log,'H3_PERFORMANCE_DATABASE_CHECKS: assertions=([0-9]+); failed=0;')
$Count=if($Match.Success){[int]$Match.Groups[1].Value}else{0}
$Passed=$Exit -eq 0 -and $Count -gt 0 -and $Changes -eq 0 -and $ReferenceKept -and $DatabaseStopped -and $DependenciesBound
$Result=[pscustomobject]@{Passed=$Passed;Backend=$BackendRound;Exit=$Exit;FailureType=$FailureType;Assertions=$Count;Inputs=$Inputs.Count;RuntimeInputs=$RuntimeInputs.Count;CompiledInputs=$Compiled.Count;InputChanges=$Changes;ActualDependenciesBound=$DependenciesBound;OriginalProcessesKept=$ReferenceKept;IndependentDatabaseStopped=$DatabaseStopped;DatabaseRetained=$true;ControlledIdentity=$true;ActualWinRestore=$Match.Success;RealHttp=$false;ProductionModified=$false}
$Result|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H3_PERFORMANCE_DATABASE: passed=$Passed; checks=$Count; inputs=$($Inputs.Count); runtime_inputs=$($RuntimeInputs.Count); changes=$Changes; actual_dependencies=$DependenciesBound; reference_kept=$ReferenceKept; database_stopped=$DatabaseStopped; http=false"
if(-not $Passed){throw 'H3 performance database verification failed; original diagnostics retained'}
