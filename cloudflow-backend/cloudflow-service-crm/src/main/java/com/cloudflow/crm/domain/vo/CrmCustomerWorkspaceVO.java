package com.cloudflow.crm.domain.vo;

import com.cloudflow.crm.domain.CrmContact;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmFollowUp;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.domain.CrmServiceTicket;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class CrmCustomerWorkspaceVO {
    private CrmCustomer customer;
    private List<CrmHealthReasonItemVO> healthReasons = new ArrayList<>();
    private List<CrmContact> contacts = new ArrayList<>();
    private List<CrmFollowUp> followUps = new ArrayList<>();
    private List<CrmOpportunity> opportunities = new ArrayList<>();
    private List<CrmQuote> quotes = new ArrayList<>();
    private List<CrmReceivable> receivables = new ArrayList<>();
    private List<CrmRenewal> renewals = new ArrayList<>();
    private List<CrmServiceTicket> tickets = new ArrayList<>();
    private List<RemoteProjectLinkVO> projects = new ArrayList<>();
}
