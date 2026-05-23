import type { CrmContact, CrmCustomer, CrmFollowUp, CrmOpportunity, CrmQuote, CrmReceivable, CrmRenewal, CrmTicket } from '@/services/api/crm';

export type CrmTab = 'dashboard' | 'customer' | 'opportunity' | 'quote' | 'receivable' | 'renewal' | 'ticket';

export type DialogState =
  | { type: 'customer'; item?: CrmCustomer | null }
  | { type: 'opportunity'; item?: CrmOpportunity | null }
  | { type: 'quote'; item?: CrmQuote | null }
  | { type: 'receivable'; item?: CrmReceivable | null }
  | { type: 'renewal'; item?: CrmRenewal | null }
  | { type: 'ticket'; item?: CrmTicket | null }
  | { type: 'contact'; item?: CrmContact | null }
  | { type: 'followUp'; item?: CrmFollowUp | null }
  | null;

export type ConfirmState =
  | { action: 'submitQuote' | 'sendQuote' | 'acceptQuote' | 'expireQuote' | 'winOpportunity' | 'loseOpportunity' | 'confirmReceivable' | 'resolveTicket' | 'closeTicket'; item: any }
  | null;

export const DASHBOARD_TONE_STYLES = {
  cyan: {
    accent: 'text-cyan-700 dark:text-cyan-300',
    icon: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300',
    hover: 'group-hover:text-cyan-700 dark:group-hover:text-cyan-300',
  },
  emerald: {
    accent: 'text-emerald-700 dark:text-emerald-300',
    icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
    hover: 'group-hover:text-emerald-700 dark:group-hover:text-emerald-300',
  },
  amber: {
    accent: 'text-amber-700 dark:text-amber-300',
    icon: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
    hover: 'group-hover:text-amber-700 dark:group-hover:text-amber-300',
  },
  rose: {
    accent: 'text-rose-700 dark:text-rose-300',
    icon: 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-300',
    hover: 'group-hover:text-rose-700 dark:group-hover:text-rose-300',
  },
};

export type DashboardTone = keyof typeof DASHBOARD_TONE_STYLES;
