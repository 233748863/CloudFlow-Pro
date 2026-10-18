param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "retained-input-compression-20261007-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous compression evidence'}
$Candidates=@(Get-ChildItem -LiteralPath $Evidence -Recurse -File -Filter '*inputs.json'|Where-Object{-not($_.Attributes -band [IO.FileAttributes]::Compressed)})
if(-not $Candidates.Count){throw 'No uncompressed input manifests'}
$BeforeFree=(Get-PSDrive -Name D).Free
$Hashes=@($Candidates|ForEach-Object{
    $Full=[IO.Path]::GetFullPath($_.FullName)
    if(-not $Full.StartsWith($Evidence+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Manifest escapes evidence root'}
    $Parent=Get-Item -LiteralPath $Full
    while($Parent.FullName -ne $Evidence){
        if($Parent.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected manifest path'}
        $Parent=Get-Item -LiteralPath (Split-Path -Parent $Parent.FullName)
    }
    [pscustomobject]@{Path=$Full;Hash=(Get-FileHash -LiteralPath $Full).Hash;Bytes=$_.Length;WriteTime=$_.LastWriteTimeUtc}
})
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Hashes|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'before.json') -Encoding utf8NoBOM
for($Index=0;$Index -lt $Hashes.Count;$Index+=20){
    $Last=[Math]::Min($Index+19,$Hashes.Count-1)
    $Batch=@($Hashes[$Index..$Last])
    foreach($File in $Batch){if((Get-FileHash -LiteralPath $File.Path).Hash -ne $File.Hash){throw 'Manifest changed before compression'}}
    & compact.exe /C /I /Q @($Batch.Path) *> (Join-Path $Output "compact-$Index.log")
    if($LASTEXITCODE -ne 0){throw 'Manifest compression failed; originals retained'}
}
foreach($File in $Hashes){
    if((Get-FileHash -LiteralPath $File.Path).Hash -ne $File.Hash){throw 'Manifest content changed'}
    if((Get-Item -LiteralPath $File.Path).LastWriteTimeUtc -ne $File.WriteTime){throw 'Manifest was rewritten'}
}
$AfterFree=(Get-PSDrive -Name D).Free
[pscustomobject]@{Passed=$true;Files=$Hashes.Count;Bytes=($Hashes|Measure-Object Bytes -Sum).Sum;BeforeFree=$BeforeFree;AfterFree=$AfterFree;ContentChanges=0;DeletedFiles=0;ProductModified=$false;RunningDatabaseFilesModified=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"RETAINED_INPUT_COMPRESSION: files=$($Hashes.Count); before_free=$BeforeFree; after_free=$AfterFree; deleted=0; content_changes=0"
