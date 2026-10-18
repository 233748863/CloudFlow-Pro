param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "retained-database-compression-20261007-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous database compression evidence'}
$Directories=@('.codex-temp/mysql-demo-seed-20260901/data',
    '.cloudflow-runtime/batch-f-validation/data-d805a5f3df45432a800d66982b25ab01',
    '.cloudflow-runtime/batch-f-rehearsal/data-e84dbab19d444d1cbcab08221f0e5256')
function Assert-Stopped([string]$Directory){
    $Marker=(Split-Path -Parent $Directory).Replace('\','/')
    $Processes=@(Get-CimInstance Win32_Process|Where-Object{$_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Replace('\','/').Contains($Marker)})
    if($Processes.Count){throw 'Retained database directory has a live matching process'}
    $Probe=Join-Path $Directory 'ibdata1'
    $Stream=[IO.File]::Open($Probe,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
    $Stream.Dispose()
}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$BeforeFree=(Get-PSDrive -Name D).Free
$Results=[Collections.Generic.List[object]]::new()
foreach($Relative in $Directories){
    $Directory=[IO.Path]::GetFullPath((Join-Path $Root $Relative))
    if(-not $Directory.StartsWith($Root+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Archive escapes workspace'}
    $Parent=Get-Item -LiteralPath $Directory
    while($Parent.FullName -ne $Root){
        if($Parent.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Archive path is redirected'}
        $Parent=Get-Item -LiteralPath (Split-Path -Parent $Parent.FullName)
    }
    Assert-Stopped $Directory
    $Entries=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
    if(@($Entries|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Archive contains redirected paths'}
    $Files=@($Entries|Where-Object{-not $_.PSIsContainer})
    $Hashes=@($Files|ForEach-Object{[pscustomobject]@{Path=$_.FullName;Hash=(Get-FileHash -LiteralPath $_.FullName).Hash;Bytes=$_.Length}})
    $Number=$Results.Count+1
    $Hashes|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output "archive-$Number-inputs.json") -Encoding utf8NoBOM
    Assert-Stopped $Directory
    & compact.exe /C "/S:$Directory" /I /Q *> (Join-Path $Output "archive-$Number-compact.log")
    if($LASTEXITCODE -ne 0){throw 'Archive compression failed; preserve original files'}
    Assert-Stopped $Directory
    $Current=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force -File)
    if(@(Compare-Object ($Hashes.Path|Sort-Object) ($Current.FullName|Sort-Object)).Count){throw 'Archive file set changed'}
    foreach($File in $Hashes){if((Get-FileHash -LiteralPath $File.Path).Hash -ne $File.Hash){throw 'Archive content changed'}}
    $Results.Add([pscustomobject]@{Directory=$Relative;Files=$Files.Count;Bytes=($Files|Measure-Object Length -Sum).Sum;LiveProcesses=0;DatabaseExclusiveRead=$true;ContentChanges=0})
    "RETAINED_DATABASE_COMPRESSED: archives=$($Results.Count); free_bytes=$((Get-PSDrive -Name D).Free); contents_unchanged=true"
}
$AfterFree=(Get-PSDrive -Name D).Free
[pscustomobject]@{Passed=$true;BeforeFree=$BeforeFree;AfterFree=$AfterFree;Archives=@($Results);ContentChanges=0;DeletedFiles=0;RunningEnvironmentsModified=$false}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"RETAINED_DATABASE_COMPRESSION: archives=$($Results.Count); before_free=$BeforeFree; after_free=$AfterFree; deleted=0; content_changes=0"
