param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1', [ValidateRange(1,1000)][int]$FirstCoreRound=1, [ValidateRange(1,1000)][int]$LastCoreRound=13)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Runs=Join-Path $Root '.cloudflow-runtime/batch-g-integration'
$Output=Join-Path $Evidence "h3-retained-storage-compression-20261011-$Round"
if($FirstCoreRound -gt $LastCoreRound){throw 'First round must not exceed last round'}
if(Test-Path -LiteralPath $Output){throw 'Preserve existing compression evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Targets=[Collections.Generic.List[object]]::new()
$BeforeFree=(Get-PSDrive -Name D).Free
function Assert-Stopped([string]$Run){
    if((Split-Path -Parent $Run) -ne $Runs -or (Split-Path -Leaf $Run) -notmatch '^[a-f0-9]{32}$'){throw 'Owned test runtime required'}
    $State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
    if($State.status -ne 'STOPPED' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Runtime must remain stopped'}
    foreach($Observed in @(Get-CimInstance Win32_Process)){
        if($Observed.ProcessId -ne $PID -and $Observed.CommandLine -and $Observed.CommandLine.Replace('/','\').Contains($Run,[StringComparison]::OrdinalIgnoreCase)){throw 'Runtime still has a live process'}
    }
}
foreach($Number in $FirstCoreRound..$LastCoreRound){
    $Report=Join-Path $Evidence "h3-core-independent-20261011-r$Number/launcher-result.json"
    $Launcher=Get-Content -LiteralPath $Report -Raw|ConvertFrom-Json
    if(-not $Launcher.processesStopped -or -not $Launcher.inputsUnchanged){throw 'Original run must be stopped with intact inputs'}
    $Run=[IO.Path]::GetFullPath($Launcher.run)
    Assert-Stopped $Run
    $Data=Join-Path $Run 'mysql-data'
    foreach($Directory in @($Root,$Runs,$Run,$Data)){
        if((Get-Item -LiteralPath $Directory).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected path rejected'}
    }
    $Entries=@(Get-ChildItem -LiteralPath $Data -Recurse -Force)
    if(@($Entries|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Redirected database entry rejected'}
    $Files=@($Entries|Where-Object{-not $_.PSIsContainer}|ForEach-Object{[pscustomobject]@{Path=$_.FullName;Hash=(Get-FileHash -LiteralPath $_.FullName).Hash;Bytes=$_.Length}})
    $Originals=@($Report,(Join-Path $Run 'state.json'))|ForEach-Object{[pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}}
    $Target=[pscustomobject]@{Round="r$Number";Run=$Run;Path=$Data;Files=$Files;Originals=@($Originals)}
    $Target|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output "r$Number-before.json") -Encoding utf8NoBOM
    Assert-Stopped $Run
    & compact.exe /C "/S:$Data" /I /Q *> (Join-Path $Output "r$Number-compact.log")
    if($LASTEXITCODE -ne 0){throw 'NTFS compression failed; original bytes retained'}
    $AfterFiles=@(Get-ChildItem -LiteralPath $Data -Recurse -Force -File)
    if($AfterFiles.Count -ne $Files.Count){throw 'Database file set changed'}
    foreach($File in @($Files)+@($Originals)){if((Get-FileHash -LiteralPath $File.Path).Hash -ne $File.Hash){throw 'Original content changed during compression'}}
    Assert-Stopped $Run
    $Targets.Add([pscustomobject]@{Round="r$Number";Files=$Files.Count;LogicalBytes=($Files|Measure-Object Bytes -Sum).Sum;ContentUnchanged=$true})
    "H3_RETAINED_COMPRESSION: round=r$Number; files=$($Files.Count); content_unchanged=true; free_bytes=$((Get-PSDrive -Name D).Free)"
}
$AfterFree=(Get-PSDrive -Name D).Free
[pscustomobject]@{Passed=$true;Targets=@($Targets);BeforeFreeBytes=$BeforeFree;AfterFreeBytes=$AfterFree;FreedBytes=$AfterFree-$BeforeFree;FilesDeleted=0;ContentChanges=0;RuntimeStarted=$false}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"H3_RETAINED_COMPRESSION_COMPLETE: targets=$($Targets.Count); content_changes=0; files_deleted=0; freed_bytes=$($AfterFree-$BeforeFree)"
