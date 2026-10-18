param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$RuntimeRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Source=Join-Path $Evidence "e3-credit-independent-20261009-$RuntimeRound"
$Output=Join-Path $Evidence "e3-credit-quote-collision-20261010-$RuntimeRound"
if(Test-Path -LiteralPath $Output){throw 'Preserve previous quote diagnosis'}
$Launcher=Get-Content -LiteralPath (Join-Path $Source 'launcher-result.json') -Raw|ConvertFrom-Json
$Business=Get-Content -LiteralPath (Join-Path $Source 'result.json') -Raw|ConvertFrom-Json -Depth 80
$Fixture=Get-Content -LiteralPath (Join-Path $Source 'fixture.json') -Raw|ConvertFrom-Json -Depth 80
if($Launcher.passed -or -not $Launcher.inputsUnchanged -or -not $Launcher.processesStopped -or -not $Launcher.referenceKept){throw 'Retained failed and fully stopped round required'}
$Failed=@($Business.requests|Where-Object {$_.path -eq '/crm/quote' -and $_.method -eq 'POST' -and $_.status -eq 409 -and $_.code -eq 409})
if($Failed.Count -ne 1){throw 'Exactly one retained quote creation conflict required'}
$Cases=@($Fixture.customers|Where-Object {$_.code -match '_(FUTURE|EXPIRED|DISABLED)_CREDIT$'}|ForEach-Object {
    [pscustomobject]@{CustomerId=$_.id;Code=$_.code;GeneratedQuote=($Fixture.marker+'_RULE_INACTIVE_'+$_.code.Substring($_.code.Length-8))}
})
if($Cases.Count -ne 3){throw 'Three actual credit period customers required'}
$Collisions=@($Cases|Group-Object GeneratedQuote|Where-Object Count -GT 1)
if($Collisions.Count -ne 1 -or $Collisions[0].Count -ne 2){throw 'Exactly one two-customer generated quote collision required'}
$Existing=@($Fixture.quotes|Where-Object name -EQ $Collisions[0].Name)
if($Existing.Count -ne 1 -or $Existing[0].customerId -ne $Collisions[0].Group[0].CustomerId){throw 'First conflicting quote was not actually saved'}
$Original=Join-Path $Source 'originals/scripts/runtime-checks/e3-credit-rules.mjs'
$OriginalText=Get-Content -LiteralPath $Original -Raw
if(-not $OriginalText.Contains("inactive.code.slice(-8)")){throw 'Original executed number generation differs'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Inputs=@($PSCommandPath,(Join-Path $Source 'launcher-result.json'),(Join-Path $Source 'result.json'),(Join-Path $Source 'fixture.json'),$Original)|ForEach-Object {
    [pscustomobject]@{Path=$_;Hash=(Get-FileHash -LiteralPath $_).Hash}
}
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Result=[pscustomobject]@{RuntimeRound=$RuntimeRound;DeterministicFixtureNumberCollision=$true;ConflictingCustomers=@($Collisions[0].Group.CustomerId);ExistingQuote=$Existing[0].id;GeneratedQuote=$Collisions[0].Name;ObservedStatus=409;TraceId=$Failed[0].traceId;BusinessWrites=0;RuntimeStarted=$false;ProductModified=$false;OriginalRoundUnchanged=$true}
$Result|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"E3_QUOTE_DIAGNOSIS: collision=true; customers=2; saved_quotes=1; status=409; business_writes=0; original_round_unchanged=true"
