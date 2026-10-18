package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.exception.CrmBusinessException;

import com.cloudflow.common.datascope.DataScopeUtils;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.domain.dto.CrmSlaReportQuery;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class CrmSlaReportService {
    private final CrmServiceTicketMapper ticketMapper;

    public Report report(CrmSlaReportQuery query) {
        if (query.getStart() != null && query.getEnd() != null && query.getEnd().isBefore(query.getStart())) throw new CrmBusinessException("统计日期范围无效");
        List<CrmServiceTicket> tickets = ticketMapper.selectSlaReportTickets(query, DataScopeUtils.listScope("scope_dept_id", "scope_owner_id"));
        Function<CrmServiceTicket, String> group = switch (query.getGroupBy()) {
            case "PRIORITY" -> CrmServiceTicket::getSeverity;
            case "OWNER" -> ticket -> ticket.getOwnerId() + " / " + ticket.getOwnerName();
            case "POLICY" -> ticket -> String.valueOf(ticket.getSlaPolicyId());
            default -> throw new CrmBusinessException("统计维度只能为POLICY/PRIORITY/OWNER");
        };
        return new Report(aggregate("TOTAL", tickets), groups(tickets, group),
                groups(tickets, ticket -> String.valueOf(ticket.getOpenedTime().toLocalDate())),
                tickets.stream().filter(ticket -> Integer.valueOf(1).equals(ticket.getResponseBreachedFlag())
                        || Integer.valueOf(1).equals(ticket.getResolutionBreachedFlag())).toList());
    }

    private List<Group> groups(List<CrmServiceTicket> rows, Function<CrmServiceTicket, String> group) {
        return rows.stream().collect(Collectors.groupingBy(group, TreeMap::new, Collectors.toList())).entrySet().stream()
                .map(entry -> aggregate(entry.getKey(), entry.getValue())).toList();
    }

    private Group aggregate(String key, List<CrmServiceTicket> rows) {
        List<CrmServiceTicket> responded = rows.stream().filter(ticket -> ticket.getFirstResponseMinutes() != null).toList();
        List<CrmServiceTicket> resolved = rows.stream().filter(ticket -> ticket.getResolutionDue() != null && ticket.getResolutionMinutes() != null).toList();
        long responseMet = responded.stream().filter(ticket -> !Integer.valueOf(1).equals(ticket.getResponseBreachedFlag())).count();
        long resolutionMet = resolved.stream().filter(ticket -> !Integer.valueOf(1).equals(ticket.getResolutionBreachedFlag())).count();
        return new Group(key, rows.size(), responded.size(), resolved.size(), responseMet, resolutionMet,
                ratio(responseMet, responded.size()), ratio(resolutionMet, resolved.size()),
                ratio(responded.stream().mapToLong(CrmServiceTicket::getFirstResponseMinutes).sum(), responded.size()),
                ratio(resolved.stream().mapToLong(CrmServiceTicket::getResolutionMinutes).sum(), resolved.size()));
    }

    private BigDecimal ratio(long numerator, long denominator) {
        return denominator == 0 ? null : BigDecimal.valueOf(numerator).divide(BigDecimal.valueOf(denominator), 4, RoundingMode.HALF_UP);
    }

    public record Group(String key, long total, long responded, long resolved, long responseMet, long resolutionMet,
                        BigDecimal responseRate, BigDecimal resolutionRate, BigDecimal averageResponseMinutes, BigDecimal averageResolutionMinutes) { }
    public record Report(Group total, List<Group> groups, List<Group> trend, List<CrmServiceTicket> breachedTickets) { }
}
