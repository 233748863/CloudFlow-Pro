package com.cloudflow.common.core.domain;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.time.LocalDate;
import java.util.List;
import lombok.Data;

@Data
public class PortalContractVO {
    private String contractId;
    private String contractNo;
    private String contractName;
    private String counterpartyName;
    private String amount;
    private String currency;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate startDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate endDate;
    private String status;
    private List<Term> terms = List.of();
    private List<Milestone> milestones = List.of();
    private List<PaymentSchedule> paymentSchedules = List.of();

    @Data
    public static class Term {
        private String termId;
        private Integer termNo;
        private String termCategory;
        private String termContent;
        private String requirement;
        private String responsibleParty;
        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate deadlineDate;
        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate fulfilledDate;
        private String status;
    }

    @Data
    public static class Milestone {
        private String id;
        private Integer milestoneNo;
        private String milestoneName;
        private String milestoneType;
        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate plannedDate;
        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate actualDate;
        private String amount;
        private String currency;
        private String status;
    }

    @Data
    public static class PaymentSchedule {
        private String id;
        private Integer paymentNo;
        private String paymentName;
        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate planDate;
        @JsonFormat(pattern = "yyyy-MM-dd")
        private LocalDate actualDate;
        private String amount;
        private String actualAmount;
        private String currency;
        private String status;
    }
}
