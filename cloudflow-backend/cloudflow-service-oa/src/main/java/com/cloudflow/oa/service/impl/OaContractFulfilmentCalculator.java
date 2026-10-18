package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.domain.OaContractFulfilmentTerm;
import java.time.LocalDate;
import java.util.List;

public final class OaContractFulfilmentCalculator {
    private OaContractFulfilmentCalculator() { }

    public static boolean done(OaContractFulfilmentTerm term) {
        return Integer.valueOf(1).equals(term.getFulfilledFlag()) || Integer.valueOf(1).equals(term.getWaivedFlag());
    }

    public static boolean overdue(OaContractFulfilmentTerm term, LocalDate today) {
        return !done(term) && term.getDeadlineDate() != null && term.getDeadlineDate().isBefore(today);
    }

    public static String status(OaContract contract, List<OaContractFulfilmentTerm> terms, LocalDate today) {
        if (!Integer.valueOf(1).equals(contract.getRequiresFulfilmentFlag()) || terms.isEmpty()) return "NOT_STARTED";
        if (terms.stream().allMatch(OaContractFulfilmentCalculator::done)) return "FULFILLED";
        if (contract.getFulfilmentDeadline() != null && contract.getFulfilmentDeadline().isBefore(today)) return "BREACHED";
        if (terms.stream().anyMatch(term -> overdue(term, today))) return "PARTIALLY_BREACHED";
        return "ONGOING";
    }
}
