$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Source=Join-Path $Evidence 'e3-credit-independent-20261009-r13'
$Output=Join-Path $Evidence 'e3-credit-start-limit-inspection-20261010-r1'
if(Test-Path -LiteralPath $Output){throw 'Preserve previous rate inspection'}
$Launcher=Get-Content -LiteralPath (Join-Path $Source 'launcher-result.json') -Raw|ConvertFrom-Json
$Run=[IO.Path]::GetFullPath($Launcher.run)
if((Split-Path -Parent $Run) -ne (Join-Path $Root '.cloudflow-runtime/batch-g-integration') -or (Split-Path -Leaf $Run) -ne 'daa8f7adb4934ac89338ea6b715df24f' -or -not $Launcher.processesStopped){throw 'Stopped R13 runtime required'}
$LogPath=Join-Path $Run 'workflow/stdout.log'
$Lines=[IO.File]::ReadAllLines($LogPath)
$Facts=[Collections.Generic.List[object]]::new()
foreach($Line in $Lines){
    $Limit=[regex]::Match($Line,'用户操作 \[启动流程\] 触发限流，当前计数: (\d+), 限制: (\d+)')
    if($Limit.Success){
        $Time=[regex]::Match($Line,'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?').Value
        $Facts.Add([pscustomobject]@{Time=$Time;Count=[int]$Limit.Groups[1].Value;Limit=[int]$Limit.Groups[2].Value})
    }
}
if($Facts.Count -eq 0){throw 'Expected actual start limit evidence missing'}
$OwnedStarts=@($Lines|Where-Object {$_ -match 'businessKey=crm_customer_credit:26729\b'}|ForEach-Object{
    [pscustomobject]@{Time=[regex]::Match($_,'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?').Value;AttemptObserved=$true}
})
$LimiterPath=Join-Path $Root 'cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/RateLimiterService.java'
$TimingPath=Join-Path $Evidence 'e3-credit-binding-timing-20261010-r13/result.json'
$Timing=Get-Content -LiteralPath $TimingPath -Raw|ConvertFrom-Json
if($Timing.Timeline.creationToBindingSeconds -ne 65 -or $Timing.Outbox[0].retryCount -ne 0){throw 'Unexpected timing input'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Result=[pscustomobject]@{
    RuntimeRound='r13';ApprovalId=26729;ActualStartLimitEvents=@($Facts);OwnedStartAttempts=$OwnedStarts
    BindingDelaySeconds=65;OutboxPublicationRetryCount=0
    WorkflowLogSha256=(Get-FileHash -LiteralPath $LogPath -Algorithm SHA256).Hash
    TimingResultSha256=(Get-FileHash -LiteralPath $TimingPath -Algorithm SHA256).Hash
    LimiterSourceSha256=(Get-FileHash -LiteralPath $LimiterPath -Algorithm SHA256).Hash
    RuntimeStarted=$false;BusinessWrites=0;RateCountersChanged=$false;ConfigurationChanged=$false;RawLogsEmitted=$false
}
$Result|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
$Result|ConvertTo-Json -Depth 8
