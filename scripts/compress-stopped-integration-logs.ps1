param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Runs=Join-Path $Root '.cloudflow-runtime/batch-g-integration'
$Output=Join-Path $Root ".cloudflow-runtime/full-prd-20260915/approved-runtime/stopped-log-compression-20261007-$Round"
if(Test-Path -LiteralPath $Output){throw 'Compression evidence already exists'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$BeforeFree=(Get-PSDrive -Name D).Free
$Results=[Collections.Generic.List[object]]::new()
function Assert-Stopped([string]$Directory){
    $State=Get-Content -LiteralPath (Join-Path $Directory 'state.json') -Raw|ConvertFrom-Json
    if($State.status -ne 'STOPPED'){throw 'Only explicitly stopped evidence can be compressed'}
    $Marker=Split-Path -Leaf $Directory
    $Live=@(Get-CimInstance Win32_Process | Where-Object{$_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains($Marker)})
    if($Live.Count){throw 'Stopped evidence still has a matching process'}
}
foreach($Directory in Get-ChildItem -LiteralPath $Runs -Directory){
    if((Get-PSDrive -Name D).Free -ge 10GB){break}
    $StateFile=Join-Path $Directory.FullName 'state.json'
    if(-not (Test-Path -LiteralPath $StateFile)){continue}
    $State=Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json
    if($State.status -ne 'STOPPED'){continue}
    $Data=[IO.Path]::GetFullPath($Directory.FullName)
    if(-not $Data.StartsWith($Runs+'\',[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $Data) -notmatch '^[a-f0-9]{32}$'){throw 'Archive data path escapes owned runs'}
    if(-not (Test-Path -LiteralPath $Data)){continue}
    Assert-Stopped $Directory.FullName
    $Entries=@(Get-ChildItem -LiteralPath $Data -Recurse -Force -File -Filter '*.log')
    if((Get-Item -LiteralPath $Data).Attributes -band [IO.FileAttributes]::ReparsePoint -or @($Entries|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Archive contains redirected paths'}
    $Files=@($Entries|Where-Object{-not $_.PSIsContainer})
    if(-not @($Files|Where-Object{-not ($_.Attributes -band [IO.FileAttributes]::Compressed)}).Count){continue}
    $Hashes=@($Files|ForEach-Object{[pscustomobject]@{Path=$_.FullName;Hash=(Get-FileHash -LiteralPath $_.FullName).Hash;Bytes=$_.Length}})
    $Hashes|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output ($Directory.Name+'-inputs.json')) -Encoding utf8NoBOM
    $StateHash=(Get-FileHash -LiteralPath $StateFile).Hash
    $CompactExit=0
    for($Index=0;$Index -lt $Files.Count;$Index+=20){
        $Last=[Math]::Min($Index+19,$Files.Count-1)
        & compact.exe /C /I /Q @($Files[$Index..$Last].FullName) *>> (Join-Path $Output ($Directory.Name+'-compact.log'))
        if($LASTEXITCODE -ne 0){$CompactExit=$LASTEXITCODE;break}
    }
    Assert-Stopped $Directory.FullName
    if($CompactExit -ne 0){throw 'NTFS compression failed; retain evidence'}
    if((Get-FileHash -LiteralPath $StateFile).Hash -ne $StateHash){throw 'Stopped state changed'}
    $Current=@(Get-ChildItem -LiteralPath $Data -Recurse -Force -File -Filter '*.log')
    if(@(Compare-Object ($Hashes.Path|Sort-Object) ($Current.FullName|Sort-Object)).Count){throw 'Evidence file set changed'}
    foreach($File in $Hashes){if((Get-FileHash -LiteralPath $File.Path).Hash -ne $File.Hash){throw 'Evidence content changed'}}
    $Results.Add([pscustomobject]@{Run=$Directory.Name;Files=$Files.Count;Bytes=($Files|Measure-Object Length -Sum).Sum;ContentChanges=0;StateUnchanged=$true;CompressionExit=$CompactExit})
    'STOPPED_LOG_COMPRESSED: runs='+$Results.Count+'; contents_unchanged=true; free_bytes='+(Get-PSDrive -Name D).Free
}
$AfterFree=(Get-PSDrive -Name D).Free
[pscustomobject]@{Passed=$true;BeforeFree=$BeforeFree;AfterFree=$AfterFree;Runs=@($Results);ContentChanges=0;DeletedFiles=0;RunningEnvironmentsModified=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
'STOPPED_LOG_COMPRESSION: runs='+$Results.Count+'; before_free='+$BeforeFree+'; after_free='+$AfterFree+'; deleted=0; content_changes=0'
