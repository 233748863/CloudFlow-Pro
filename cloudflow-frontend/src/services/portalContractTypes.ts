export interface PortalContractTerm {
  termId: string;
  termNo: number;
  termCategory: string;
  termContent: string;
  requirement: string;
  responsibleParty: string;
  deadlineDate?: string;
  fulfilledDate?: string;
  status: string;
}

export interface PortalContractMilestone {
  id: string;
  milestoneNo: number;
  milestoneName: string;
  milestoneType: string;
  plannedDate?: string;
  actualDate?: string;
  amount?: string;
  currency?: string;
  status: string;
}

export interface PortalContractPayment {
  id: string;
  paymentNo: number;
  paymentName: string;
  planDate?: string;
  actualDate?: string;
  amount?: string;
  actualAmount?: string;
  currency?: string;
  status: string;
}

export interface PortalContract {
  contractId: string;
  contractNo: string;
  contractName: string;
  counterpartyName: string;
  amount?: string;
  currency?: string;
  startDate?: string;
  endDate?: string;
  status: string;
  terms: PortalContractTerm[];
  milestones: PortalContractMilestone[];
  paymentSchedules: PortalContractPayment[];
}

export interface PortalContractPage { rows: PortalContract[]; total: number; pageNum: number; pageSize: number }
