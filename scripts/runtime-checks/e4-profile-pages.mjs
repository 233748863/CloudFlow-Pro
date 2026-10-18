import { verifyE4MasterPages } from './e4-profile-master-pages.mjs';
import { verifyE4LeadPages } from './e4-profile-lead-pages.mjs';
import { verifyE4ReportPages } from './e4-profile-report-pages.mjs';

export async function verifyE4ProfilePages(context, tree, scoring) {
  await verifyE4MasterPages(context, tree, scoring);
  await verifyE4LeadPages(context, tree, scoring);
  await verifyE4ReportPages(context);
  context.check('all_profile_pages_have_no_uncaught_browser_errors', context.browserErrors.length === 0);
  context.evidence.desktop = true;
  context.evidence.mobile = true;
}
