import HrTaxDeductionsPanel from '../rules/HrTaxDeductionsPanel';
import { RulePage } from '../rules/RuleWorkspace';

export default function HrEssTaxDeductionPage() {
  return <RulePage title="我的专项扣除" description="申报有效期和扣除金额，上传证明，跟踪审核结果。"><HrTaxDeductionsPanel mine /></RulePage>;
}
