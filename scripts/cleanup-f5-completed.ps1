param([switch]$Apply)
$ErrorActionPreference='Stop'
$Project='D:/CloudFlowPro'
$Evidence=$Project+'/.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Reference=$Project+'/.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Stopped=$Project+'/.cloudflow-runtime/batch-g-integration/e1afdf39e80341a59789fe9a82057f54'
$Record=$Project+'/docs/design/开发测试过期文件清理-20261016.md'
$Audit=$Project+'/.cloudflow-runtime/storage-cleanup-20261016-r1/f5-completed-result.json'
function Normalize([string]$Path){return [IO.Path]::GetFullPath($Path).Replace([char]92,[char]47).TrimEnd('/')}
$Document=Get-Content -LiteralPath ($Project+'/docs/design/F5-比价视角与手机明细设计-20261015.md') -Raw
$Start='<!-- f5-final-local-acceptance:start -->'
$End='<!-- f5-final-local-acceptance:end -->'
if(-not $Document.Contains($Start) -or -not $Document.Contains($End)){throw 'Final F5 document archive required'}
$Archived=$Document.Split($Start)[1].Split($End)[0].Replace('```json','').Replace('```','').Trim()
$Accepted=$Archived|ConvertFrom-Json
if(-not $Accepted.Passed -or -not $Accepted.All20Complete -or $Accepted.AcceptanceCount -ne 20 -or $Accepted.SummaryTerminal.Exit -ne 0 -or $Accepted.ReviewedImages -ne 41){throw 'F5 final acceptance incomplete'}
if($Apply -and (Test-Path -LiteralPath $Audit)){throw 'Preserve completed cleanup record'}
$ReferenceState=Get-Content -LiteralPath ($Reference+'/state.json') -Raw|ConvertFrom-Json
function Assert-Reference {
 foreach($Entry in $ReferenceState.processes){
  $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
  if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Reference process changed'}
 }
 foreach($Port in @(51959,51961,51963,51965,51967,51969)){
  $Health=Invoke-RestMethod -Uri ('http://127.0.0.1:'+ $Port+'/actuator/health') -TimeoutSec 10
  if($Health.status -ne 'UP'){throw 'Reference service unhealthy'}
 }
}
Assert-Reference
$Keep=@($Reference+'/state.json')+@(Get-ChildItem -LiteralPath ($Evidence+'/a1-codegen-independent-prep-20261016-r1') -File|Select-Object -ExpandProperty FullName)
foreach($Service in @('auth','hr','oa','crm','workflow','gateway')){$Keep+=@(($Reference+'/'+$Service+'/service.args'),($Reference+'/'+$Service+'/integration.properties'))}
foreach($Name in @('backend-r183','frontend-r133')){$Keep+=$Evidence+'/h3-portal-finance-20261002-'+$Name+'-inputs.json'}
$Keep+=$Evidence+'/backend-executable-verification-20261006-r62/result.json'
$Protected=@{}
foreach($Path in $Keep){$Protected[(Normalize $Path)]=(Get-FileHash -LiteralPath $Path).Hash}
$Tracked=@(git -C $Project ls-files)
if($LASTEXITCODE -ne 0){throw 'Git boundary unavailable'}
$Targets=@(Get-ChildItem -LiteralPath $Evidence -Directory -Force|Where-Object Name -Like 'f5-*'|Select-Object -ExpandProperty FullName)
if(Test-Path -LiteralPath $Stopped){
 $StoppedState=Get-Content -LiteralPath ($Stopped+'/state.json') -Raw|ConvertFrom-Json
 if($StoppedState.status -ne 'STOPPED'){throw 'F5 runtime still active'}
 $Targets+=$Stopped
}
$Supplier=$Evidence+'/f2-supplier-checks-20261012-r12'
if(Test-Path -LiteralPath $Supplier){$Targets+=$Supplier}
$Before=(Get-PSDrive D).Free
$Records=[Collections.Generic.List[object]]::new()
$Skipped=[Collections.Generic.List[object]]::new()
foreach($Raw in $Targets){
 $Path=Normalize $Raw
 try{
  if(-not ($Path.StartsWith($Evidence+'/f5-',[StringComparison]::OrdinalIgnoreCase) -or $Path -eq $Stopped -or $Path -eq $Supplier)){throw 'Outside explicit F5 boundary'}
  foreach($KeepPath in $Protected.Keys){if($KeepPath -eq $Path -or $KeepPath.StartsWith($Path+'/')){throw 'Current dependency protected'}}
  $Relative=$Path.Substring($Project.Length+1)
  foreach($File in $Tracked){if($File -eq $Relative -or $File.StartsWith($Relative+'/')){throw 'Tracked file protected'}}
  $Ancestor=Get-Item -LiteralPath $Path -Force
  while($Ancestor){if($Ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked ancestor protected'};$Ancestor=$Ancestor.Parent}
  $Entries=@(Get-ChildItem -LiteralPath $Path -Recurse -Force)
  if(@($Entries|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Linked child protected'}
  $Files=@($Entries|Where-Object {-not $_.PSIsContainer})
  foreach($File in $Files|Where-Object Name -eq 'ibdata1'){$Handle=[IO.File]::Open($File.FullName,'Open','Read','None');$Handle.Dispose()}
  $Live=@(Get-CimInstance Win32_Process|Where-Object ProcessId -ne $PID)
  foreach($Process in $Live){
   $Text=($Process.CommandLine+' '+$Process.ExecutablePath).Replace([char]92,[char]47)
   if($Text.Contains($Path,[StringComparison]::OrdinalIgnoreCase) -or ($Path -eq $Stopped -and $Text.Contains((Split-Path -Leaf $Path)))){throw 'Active process protected'}
  }
  $Item=[pscustomobject]@{path=$Path;files=$Files.Count;logicalBytes=[long]($Files|Measure-Object Length -Sum).Sum;deleted=$false}
  if($Apply){Remove-Item -LiteralPath $Path -Recurse -Force;if(Test-Path -LiteralPath $Path){throw 'Deletion incomplete'};$Item.deleted=$true}
  $Records.Add($Item)
 }catch{$Skipped.Add([pscustomobject]@{path=$Path;reason=$_.Exception.Message})}
}
foreach($Path in $Protected.Keys){if((Get-FileHash -LiteralPath $Path).Hash -ne $Protected[$Path]){throw 'Protected input changed'}}
Assert-Reference
$After=(Get-PSDrive D).Free
$Result=[pscustomobject]@{at=(Get-Date -Format o);applied=[bool]$Apply;beforeFreeBytes=$Before;afterFreeBytes=$After;diskFreeDeltaBytes=$After-$Before;diskDeltaAttributedToProject=$false;protectedInputs=$Protected.Count;referenceProcesses=@($ReferenceState.processes).Count;referenceHealth='UP';targets=@($Records);skipped=@($Skipped)}
if($Apply){
 $Result|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $Audit -Encoding utf8
 $Count=($Records|Measure-Object files -Sum).Sum;$Bytes=($Records|Measure-Object logicalBytes -Sum).Sum
 Add-Content -LiteralPath $Record -Encoding utf8 -Value ([Environment]::NewLine+"F5结项实际清理：$($Records.Count)个目标、$Count 个文件、逻辑大小 $Bytes 字节；跳过 $($Skipped.Count)个。D盘清理前 $Before 字节、清理后 $After 字节，同期差值 $($After-$Before) 字节不归因于本项目。$($Protected.Count)份当前锚点内容保持，参考九进程及六服务UP；A1候选、B183/F133/R62及共享依赖保留。明细为storage-cleanup-20261016-r1/f5-completed-result.json，未复制源码、服务包或数据库。")
}
[pscustomobject]@{applied=[bool]$Apply;targets=$Records.Count;files=($Records|Measure-Object files -Sum).Sum;logicalBytes=($Records|Measure-Object logicalBytes -Sum).Sum;skipped=@($Skipped);protectedInputs=$Protected.Count;afterFreeBytes=$After}|ConvertTo-Json -Depth 4 -Compress
