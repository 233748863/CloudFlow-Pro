param([ValidatePattern('^r[1-9][0-9]*$')][string[]]$Rounds=@(),[switch]$CleanupInitializationRemnants)
$ErrorActionPreference='Stop'
if($Rounds.Count -eq 0 -and -not $CleanupInitializationRemnants){throw 'Specify rounds or the exact initialization remnants'}
$Root=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Record=Join-Path $Root 'docs/design/A2-全项验收映射-20261016.md'
$Document=Get-Content -LiteralPath $Record -Raw
if(-not $Document.Contains('assertions=543; failed=0')){throw 'Archive successful verification before cleanup'}
function Normalize([string]$Path){return [IO.Path]::GetFullPath($Path).Replace([char]92,[char]47).TrimEnd('/')}
$Project=Normalize $Root
$Reference=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/state.json'
$ReferenceHash=(Get-FileHash -LiteralPath $Reference).Hash
$ReferenceState=Get-Content -LiteralPath $Reference -Raw|ConvertFrom-Json
$ReferenceLive=@($ReferenceState.processes|Where-Object {
 $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($_.id)"
 if(-not $Observed -and $_.name -eq 'smtp-fixture'){return $false}
 if(-not $Observed -or -not $Observed.CommandLine.Contains($_.marker)){throw 'Reference baseline changed'}
 return $true
})
function Assert-Reference {
 foreach($Entry in $ReferenceLive){
  $Process=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
  if(-not $Process -or -not $Process.CommandLine.Contains($Entry.marker)){throw 'Reference process changed'}
 }
 if((Get-FileHash -LiteralPath $Reference).Hash -ne $ReferenceHash){throw 'Reference state changed'}
}
Assert-Reference
$Targets=[Collections.Generic.List[string]]::new()
if($CleanupInitializationRemnants){
 if(-not $Document.Contains('R5') -or -not $Document.Contains('22:50:30')){throw 'Archive initialization and compile results first'}
 foreach($Relative in @('.cloudflow-runtime/a2-message-database-20261016-r5','.cloudflow-runtime/batch-g-integration/84af3bb1ced04509b73ddc2cc69250ba')){
  $Path=Join-Path $Root $Relative
  if(@(Get-ChildItem -LiteralPath $Path -Force).Count){throw 'Initialization directory must remain empty'}
  $Targets.Add((Normalize $Path))
 }
 $Targets.Add((Normalize (Join-Path $Root '.cloudflow-runtime/a2-outbox-compile-20261016.log')))
}
foreach($Round in $Rounds){
 $Directory=Join-Path $Root ('.cloudflow-runtime/a2-message-database-20261016-'+$Round)
 $Result=Get-Content -LiteralPath (Join-Path $Directory 'result.json') -Raw|ConvertFrom-Json
 if(-not $Result.databaseCleaned){throw 'Owned database cleanup incomplete'}
 if(-not $Result.passed -and -not $Document.Contains($Round.ToUpperInvariant())){throw 'Failed reproduction must be archived'}
 $Targets.Add((Normalize $Directory))
 $Evidence=@(Select-String -LiteralPath (Join-Path $Directory 'checks.log') -Pattern '^MESSAGE_EVIDENCE=(.+)$')
 if($Evidence.Count -ne 1){throw 'Exactly one verification artifact directory required'}
 $Path=Normalize $Evidence[0].Matches[0].Groups[1].Value.Trim()
 if((Normalize (Split-Path -Parent $Path)) -ne ($Project+'/.cloudflow-runtime/message-delivery-checks') -or (Split-Path -Leaf $Path) -notmatch '^[a-f0-9]{32}$'){throw 'Artifact path outside exact boundary'}
 $Targets.Add($Path)
}
$Live=@(Get-CimInstance Win32_Process|Where-Object ProcessId -ne $PID)
$Records=[Collections.Generic.List[object]]::new()
foreach($Path in @($Targets|Sort-Object -Unique)){
 if(-not $Path.StartsWith($Project+'/.cloudflow-runtime/',[StringComparison]::OrdinalIgnoreCase)){throw 'Outside runtime boundary'}
 $Ancestor=Get-Item -LiteralPath $Path -Force
 while($Ancestor){if($Ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked ancestor protected'};$Ancestor=$Ancestor.Parent}
 $Entries=@(Get-ChildItem -LiteralPath $Path -Recurse -Force)
 if(@($Entries|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Linked child protected'}
 $Relative=[IO.Path]::GetRelativePath($Root,$Path)
 $Tracked=@(git -C $Root ls-files -- $Relative)
 if($LASTEXITCODE -ne 0 -or $Tracked.Count){throw 'Tracked files protected'}
 foreach($Process in $Live){
  $Text=($Process.CommandLine+' '+$Process.ExecutablePath).Replace([char]92,[char]47)
  if($Text.Contains($Path,[StringComparison]::OrdinalIgnoreCase)){throw 'Active process protected'}
 }
 $Files=@($Entries|Where-Object {-not $_.PSIsContainer})
 $Records.Add([pscustomobject]@{path=$Path;files=$Files.Count;bytes=[long]($Files|Measure-Object Length -Sum).Sum})
}
$Before=[IO.DriveInfo]::new('D:\').AvailableFreeSpace
$Details=($Records|ForEach-Object{"$($_.path)：$($_.files) 个文件、$($_.bytes) 字节"}) -join '；'
Add-Content -LiteralPath $Record -Encoding utf8 -Value ([Environment]::NewLine+"$(Get-Date -Format o) 清理准备（$($Rounds -join ',')）：结论已归档；$Details。删除前 D 盘可用 $Before 字节，绝对路径、链接、受控文件及运行进程边界核验通过。")
foreach($Entry in $Records){Remove-Item -LiteralPath $Entry.path -Recurse -Force;if(Test-Path -LiteralPath $Entry.path){throw 'Deletion incomplete'}}
Assert-Reference
$After=[IO.DriveInfo]::new('D:\').AvailableFreeSpace
$Count=($Records|Measure-Object files -Sum).Sum
$Bytes=($Records|Measure-Object bytes -Sum).Sum
Add-Content -LiteralPath $Record -Encoding utf8 -Value "实际清理完成：$($Records.Count) 个目录、$Count 个文件、逻辑大小 $Bytes 字节；D 盘可用 $Before → $After 字节，空间差值不归因于本项目。参考 $($ReferenceLive.Count) 个现存进程与 state 内容保持；旧 SMTP 检查进程原已缺失，保持原状。快照、编译检查类、证书及冗余日志已移除，仅保留本文结论，历史原材料未重新校验。"
[pscustomobject]@{rounds=$Rounds;directories=$Records.Count;files=$Count;logicalBytes=$Bytes;freeBefore=$Before;freeAfter=$After;deleted=$true;referenceProcesses=$ReferenceLive.Count}|ConvertTo-Json -Compress
