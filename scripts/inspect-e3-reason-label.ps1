$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Output=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime/e3-reason-label-inspection-20261010-r1'
if(Test-Path -LiteralPath $Output){throw 'Preserve existing label inspection'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.File]::Copy($PSCommandPath,(Join-Path $Output 'original.ps1'),$false)
$Code=@'
import { createRequire } from 'node:module';
import path from 'node:path';
const requireBrowser = createRequire(path.join(process.env.CLOUDFLOW_PLAYWRIGHT_HOME || 'D:/CloudFlowPro/.cloudflow-runtime/playwright', 'package.json'));
const { chromium } = requireBrowser('playwright-core');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<label><span>备注</span><textarea></textarea></label>');
  const initialLabelMatches = await page.getByLabel('备注', { exact: true }).count();
  await page.getByLabel('备注', { exact: true }).fill('诊断保存内容');
  await page.setContent('<label><span>备注</span><textarea>诊断保存内容</textarea></label>');
  const result = {
    diagnosticOnly: true, actualBusinessAcceptance: false, networkRequests: 0,
    initialLabelMatches, reopenedLabelMatches: await page.getByLabel('备注', { exact: true }).count(),
    reopenedRoleMatches: await page.getByRole('textbox', { name: '备注', exact: true }).count(),
    savedValue: await page.locator('textarea').inputValue(),
    labelText: await page.locator('label').textContent(), browserClosed: true
  };
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
'@
$Raw=$Code | & node --input-type=module
if($LASTEXITCODE -ne 0){throw 'Browser label inspection failed'}
$Result=$Raw|ConvertFrom-Json
$Result|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
$Files=@($PSCommandPath,'cloudflow-frontend/src/components/crm/operations/OperationsKit.tsx','cloudflow-frontend/src/components/common/Textarea.tsx','.cloudflow-runtime/full-prd-20260915/approved-runtime/e3-credit-independent-20261009-r11/result.json','.cloudflow-runtime/full-prd-20260915/approved-runtime/e3-credit-independent-20261009-r11/e3-failure-manager.png')
$Files|ForEach-Object {$File=[IO.Path]::GetFullPath($_,$Root);[pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath $File).Hash}}|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
$Result|ConvertTo-Json -Depth 4
