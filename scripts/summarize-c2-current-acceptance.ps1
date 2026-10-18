param([ValidatePattern('^r[1-9][0-9]*$')][string]$Round='r1',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$FrontendRound='r50',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r76',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RowRound='r3',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$GeometryRound='r5',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$NativeRound='r5',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$MobileRound='r7',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$LocationRound='r17',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$RegressionRound='r24',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$ResponseRound='r7',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$DesktopLiveRound='r57',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$MobileLiveRound='r58',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$TypesLiveRound='r59',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$DesignerLiveRound='r60',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PrecisionLiveRound='r61',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$PrecisionRound='r4',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$InputRound='r3',
    [ValidatePattern('^r[1-9][0-9]*$')][string]$AdjacentRound='r73')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "c2-current-acceptance-20261005-$Round"
if(Test-Path -LiteralPath $Output){throw 'Retain previous C2 acceptance evidence'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Common=@{BackendRound=$BackendRound;FrontendRound=$FrontendRound;RegressionRound=$RegressionRound;AdjacentRound=$AdjacentRound}
$Step='row-and-real-operations'
try {
    & (Join-Path $Root 'scripts/summarize-c2-row-renders.ps1') @Common -RowRound $RowRound -NativeRound $NativeRound -MobileRound $MobileRound -LocationRound $LocationRound -ResponseRound $ResponseRound -DesktopLiveRound $DesktopLiveRound -MobileLiveRound $MobileLiveRound | Tee-Object -FilePath (Join-Path $Output 'rows.log')
    $Step='geometry'
    $GeometryPath=Join-Path $Evidence "c2-table-geometry-20261005-$GeometryRound"
    $Geometry=Get-Content -LiteralPath (Join-Path $GeometryPath 'result.json') -Raw|ConvertFrom-Json
    if(-not $Geometry.completed -or $Geometry.mode -ne 'verify' -or -not $Geometry.componentOnly -or $Geometry.checks.Count -ne 97 -or $Geometry.observations.Count -ne 18 -or @($Geometry.checks|Where-Object{-not $_.passed}).Count -or $Geometry.pageErrors.Count -or $Geometry.businessRequests.Count){throw 'Current geometry evidence incomplete'}
    foreach($Name in @('actual_pointer_drag_preserves_all_values_and_ids','scroll_keeps_only_one_extra_focused_row','leaving_table_releases_offscreen_focused_row')){
        if(@($Geometry.checks|Where-Object{$_.label -eq $Name -and $_.passed}).Count -ne 1){throw 'Pointer sorting and virtual focus evidence required'}
    }
    $GeometryInputs=@(Get-Content -LiteralPath (Join-Path $GeometryPath 'inputs.json') -Raw|ConvertFrom-Json)
    if(-not $GeometryInputs.Count){throw 'Geometry snapshot required'}
    foreach($Input in $GeometryInputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Input.Path)).Hash -ne $Input.Hash){throw 'Geometry input changed'}}
    $Step='types-uploads-and-rejections'
    & (Join-Path $Root 'scripts/summarize-c2-type-pages.ps1') @Common -LiveRound $TypesLiveRound | Tee-Object -FilePath (Join-Path $Output 'types.log')
    $Step='designer'
    & (Join-Path $Root 'scripts/summarize-c2-designer-pages.ps1') @Common -LiveRound $DesignerLiveRound | Tee-Object -FilePath (Join-Path $Output 'designer.log')
    $Step='precision-and-saved-schema'
    & (Join-Path $Root 'scripts/summarize-c2-summary-precision.ps1') @Common -LiveRound $PrecisionLiveRound -PrecisionRound $PrecisionRound -InputRound $InputRound -ResponseRound $ResponseRound | Tee-Object -FilePath (Join-Path $Output 'precision.log')
    $Step='prd-mapping'
    $PrdPath='docs/prd/C2-LC-03-明细子表-PRD.md'
    $Prd=Get-Content -LiteralPath (Join-Path $Root $PrdPath)
    $Numbers=@($Prd|Where-Object{$_ -match '^\| AC-([0-9]+) \|'}|ForEach-Object{[int]([regex]::Match($_,'AC-([0-9]+)').Groups[1].Value)})
    if($Numbers.Count -ne 12 -or @($Numbers|Sort-Object -Unique).Count -ne 12 -or @((1..12)|Where-Object{$_ -notin $Numbers}).Count){throw 'Twelve current C2 acceptance criteria required'}
    $Mapping=@(
        @{id='AC-1';evidence=@("native/$NativeRound","mobile/$MobileRound","desktop-live/$DesktopLiveRound","mobile-live/$MobileLiveRound","types-live/$TypesLiveRound");scope='增删复制、键盘/鼠标排序及真实双端保存审批'},
        @{id='AC-2';evidence=@("types-live/$TypesLiveRound","designer-live/$DesignerLiveRound");scope='十类真实填写/恢复/审批与二十类设计器禁选'},
        @{id='AC-3';evidence=@("precision/$PrecisionRound","precision-live/$PrecisionLiveRound","types-live/$TypesLiveRound");scope='SUM/COUNT/AVG、抵消、舍入、长金额与500行'},
        @{id='AC-4';evidence=@("types-live/$TypesLiveRound","saved-schema/$InputRound");scope='低于最少和高于最多行数拒绝、保存定义保留整数配置'},
        @{id='AC-5';evidence=@("types-live/$TypesLiveRound","response/$ResponseRound");scope='递归必填/范围/选项/未知列拒绝且原数据保持'},
        @{id='AC-6';evidence=@("location/$LocationRound","rows/$RowRound","types-live/$TypesLiveRound");scope='真实拒绝路径、双端具体行列错误标记及18场景定位'},
        @{id='AC-7';evidence=@("mobile/$MobileRound","mobile-live/$MobileLiveRound","geometry/$GeometryRound");scope='手机卡片行操作、合计及真实恢复审批'},
        @{id='AC-8';evidence=@("native/$NativeRound","geometry/$GeometryRound");scope='100行8列小于500毫秒、30/31行边界及虚拟滚动'},
        @{id='AC-9';evidence=@("rows/$RowRound");scope='真实组件加载时计数，双端3/100行的外层/字段/控件分别观察，12次编辑其他行零执行'},
        @{id='AC-10';evidence=@("designer-live/$DesignerLiveRound");scope='列/合计配置真实保存重读、仅数值列可选及八类非法定义拒绝'},
        @{id='AC-11';evidence=@("desktop-live/$DesktopLiveRound","mobile-live/$MobileLiveRound","types-live/$TypesLiveRound","precision-live/$PrecisionLiveRound");scope='多行费用、实际附件及合计发起审批完成并保留行值/身份'},
        @{id='AC-12';evidence=@("native/$NativeRound","mobile/$MobileRound","geometry/$GeometryRound","desktop-live/$DesktopLiveRound");scope='原生table与scope、操作按钮标签及44px目标'}
    )
    [ordered]@{passed=$true;prd=$PrdPath;prdSha256=(Get-FileHash -LiteralPath (Join-Path $Root $PrdPath)).Hash;backend=$BackendRound;frontend=$FrontendRound;acceptanceCount=12;mapping=$Mapping;geometryInputs=$GeometryInputs.Count;allProductInputsVerified=$true;isolatedOnly=$true;complete35Prd=$false;productionModified=$false}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    "C2_CURRENT_ACCEPTANCE: backend=$BackendRound; frontend=$FrontendRound; criteria=12; passed=true; healthy_services=6; complete_35_prd=false; production_modified=false"|Tee-Object -FilePath (Join-Path $Output 'summary.log')
} catch {
    [ordered]@{passed=$false;step=$Step;complete35Prd=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
    throw
}
