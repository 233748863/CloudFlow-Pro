param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r101')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d3-money-codec-20261006-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain original money codec check'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Inputs=@(Get-Content (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
foreach($Name in @('scripts/hr-checks/HrMoneyPrecisionChecks.java','scripts/run-d3-money-codec.ps1')){
    $Inputs+=[pscustomobject]@{Path=$Name;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $Name)).Hash}
}
function Assert-Inputs {foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Money codec check input changed'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$ArgumentLines=Get-Content (Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/hr/service.args')
$Classpath=$ArgumentLines[[Array]::IndexOf($ArgumentLines,'-cp')+1].Trim('"')
if(-not $Classpath.Contains('cloudflow-service-hr')){throw 'Owned HR classpath required'}
$JavaArgs=Join-Path $Output 'checks.args'
@('-Dfile.encoding=UTF-8','-cp',('"'+$Classpath.Replace('\','/')+'"'),(Join-Path $Root 'scripts/hr-checks/HrMoneyPrecisionChecks.java').Replace('\','/'))|Set-Content $JavaArgs -Encoding utf8NoBOM
& java "@$JavaArgs" *> (Join-Path $Output 'checks.log')
$CheckExit=$LASTEXITCODE
Assert-Inputs
Get-Content (Join-Path $Output 'checks.log')|Where-Object{$_ -match '^HR_MONEY_PRECISION:'}
if($CheckExit -ne 0){throw 'Money codec check failed; original diagnostics retained'}
"D3_MONEY_CODEC: inputs=$($Inputs.Count); changed=0; exit=0"
