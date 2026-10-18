param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound,
    [Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d3-official-tax-20261006-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous official tax evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if($null -eq $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process verification failed'}
}
$Inputs=@()
foreach($Build in @("backend-$BackendRound","frontend-$FrontendRound")){
    $Inputs+=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-$Build-inputs.json") -Raw|ConvertFrom-Json)
}
$Originals=@('scripts/run-d3-official-tax.ps1','scripts/verify-d3-official-tax.mjs','scripts/run-d3-official-tax-allowance.mjs','scripts/runtime-checks/d1-leave-runtime.mjs','scripts/runtime-checks/form-browser-auth.mjs')
$Paths=$Originals+@('scripts/owned-gateway-redis.mjs','scripts/portal-checks/scan-access-logs.mjs',
    'docs/design/D3-正式工资个税口径补充提案-20261006.md',
    '.cloudflow-runtime/full-prd-20260915/approved-runtime/d3-policy-reference-20261006-r1/sources.json',
    '.cloudflow-runtime/full-prd-20260915/approved-runtime/d3-policy-reference-20261006-r1/announcement-2018-61.html',
    '.cloudflow-runtime/full-prd-20260915/approved-runtime/d3-policy-reference-20261006-r1/official-tax-tables.doc',
    'docs/prd/D3-HR-薪资批量与个税-PRD.md','.cloudflow-runtime/full-prd-20260915/approved-runtime/d3-payroll-deductions-20261006-r2/fixture.json')
$Paths+=@($State.services|ForEach-Object{".cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/$($_.name)/service.args"; ".cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7/$($_.name)/integration.properties"})
foreach($Service in $State.services){
    foreach($Setting in @(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/integration.properties")|Where-Object {$_ -like 'spring.redis.redisson.file=file:*'})){
        $Config=[IO.Path]::GetFullPath($Setting.Substring('spring.redis.redisson.file=file:'.Length))
        if(-not $Config.StartsWith($Run+'\private\',[StringComparison]::OrdinalIgnoreCase)){throw 'Owned Redis pool configuration required'}
        $Paths+=[IO.Path]::GetRelativePath($Root,$Config)
    }
}
foreach($Service in $State.services){
    $ArgumentLines=@(Get-Content -LiteralPath (Join-Path $Run "$($Service.name)/service.args"))
    $Markers=@(0..($ArgumentLines.Count-1)|Where-Object{$ArgumentLines[$_] -eq '-jar'})
    $LayeredMarkers=@(0..($ArgumentLines.Count-1)|Where-Object{$ArgumentLines[$_] -eq '-cp'})
    if($Markers.Count -eq 0 -and $LayeredMarkers.Count -eq 1){
        $Index=$LayeredMarkers[0]
        if($Index+2 -ge $ArgumentLines.Count -or $ArgumentLines[$Index+2] -ne 'org.springframework.boot.loader.launch.JarLauncher'){throw 'Verified layered launcher required'}
        $LayeredRoot=[IO.Path]::GetFullPath($ArgumentLines[$Index+1].Trim('"'))
        if((Split-Path -Parent $LayeredRoot) -ne (Join-Path $Run "$($Service.name)/artifacts") -or (Split-Path -Leaf $LayeredRoot) -notmatch '^([a-f0-9]{64})-layered$'){throw 'Owned layered artifact required'}
        $PackageHash=$Matches[1]
        $OriginalJar=Join-Path (Split-Path -Parent $LayeredRoot) ($PackageHash+'.jar')
        if((Get-FileHash -LiteralPath $OriginalJar).Hash -ne $PackageHash){throw 'Layered source package differs'}
        $ManifestPath=$LayeredRoot+'.json'
        $Manifest=Get-Content -LiteralPath $ManifestPath -Raw|ConvertFrom-Json
        if($Manifest.Path -ne $LayeredRoot -or $Manifest.PackageHash -ne $PackageHash -or $Manifest.Files.Count -eq 0){throw 'Layered byte manifest differs'}
        $Paths+=[IO.Path]::GetRelativePath($Root,$OriginalJar)
        $Paths+=[IO.Path]::GetRelativePath($Root,$ManifestPath)
        foreach($Entry in $Manifest.Files){
            $EntryPath=[IO.Path]::GetFullPath((Join-Path $LayeredRoot $Entry.Path))
            if(-not $EntryPath.StartsWith($LayeredRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or (Get-FileHash -LiteralPath $EntryPath).Hash -ne $Entry.Hash){throw 'Layered entry differs from verified bytes'}
            $Paths+=[IO.Path]::GetRelativePath($Root,$EntryPath)
        }
        if(@(Get-ChildItem -LiteralPath $LayeredRoot -Recurse -File).Count -ne $Manifest.Files.Count -or @(Get-ChildItem -LiteralPath $LayeredRoot -Recurse -Force|Where-Object{$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'Unexpected layered file or redirect'}
        continue
    }
    if($Markers.Count -ne 1 -or $Markers[0]+1 -ge $ArgumentLines.Count){throw 'Actual executable package launch required'}
    $JarPath=[IO.Path]::GetFullPath($ArgumentLines[$Markers[0]+1].Trim('"'))
    if((Split-Path -Parent $JarPath) -ne (Join-Path $Run "$($Service.name)/artifacts")){throw 'Immutable owned package required'}
    $Paths+=[IO.Path]::GetRelativePath($Root,$JarPath)
}
foreach($File in $Paths){$Inputs+=[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath (Join-Path $Root $File)).Hash}}
function Assert-Inputs {foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Official tax execution input changed'}}}
Assert-Inputs
$PolicyDirectory=Join-Path $Evidence 'd3-policy-reference-20261006-r1'
$PolicySources=Get-Content -LiteralPath (Join-Path $PolicyDirectory 'sources.json') -Raw|ConvertFrom-Json
if((Get-FileHash -LiteralPath (Join-Path $PolicyDirectory 'announcement-2018-61.html')).Hash -ne $PolicySources.PageHash -or (Get-FileHash -LiteralPath (Join-Path $PolicyDirectory 'official-tax-tables.doc')).Hash -ne $PolicySources.AttachmentHash){throw 'Official policy originals differ from their recorded hashes'}
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
foreach($File in $Originals){[IO.File]::Copy((Join-Path $Root $File),(Join-Path $Output ('original-'+(Split-Path -Leaf $File))),$false)}
Push-Location $Root
try {
    & node scripts/verify-d3-official-tax.mjs --d1-leave --d3-official-tax --output $Output *> (Join-Path $Output 'live.log')
    $RunExit=$LASTEXITCODE
    Assert-Inputs
    Get-Content -LiteralPath (Join-Path $Output 'live.log')|Where-Object{$_ -match '^D3_'}
    "D3_OFFICIAL_TAX_INPUTS: files=$($Inputs.Count); changed=0; exit=$RunExit"
    if($RunExit -ne 0){throw 'Official tax verification failed; evidence retained'}
    $Result=Get-Content -LiteralPath (Join-Path $Output 'result.json') -Raw|ConvertFrom-Json
    foreach($Property in @('passed','boundaries','rounding','threshold','cumulative','zeroIncome','yearReset','activation','snapshots','browser','preservation','restoration','secrets','officialTaxPolicyVerified')){
        if($Result.$Property -ne $true){throw "Official tax evidence missing: $Property"}
    }
    if($Result.all18Complete -or $Result.globalComplete -or $Result.officialPolicyYear -ne 2026){throw 'Verification boundary changed'}
    'D3_OFFICIAL_TAX_RUN_EXIT=0'
} finally {Pop-Location}
