package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

public final class ContractPortalSelectionRules {
    private static final ObjectMapper JSON = new ObjectMapper();
    public static final int MAX_ITEMS = 1000;

    private ContractPortalSelectionRules() { }

    public static List<Long> fromRequest(List<String> values) {
        if (values == null || values.size() > MAX_ITEMS) throw invalid();
        List<Long> ids = new ArrayList<>();
        for (String value : values) {
            if (value == null || !value.matches("[1-9][0-9]{0,18}")) throw invalid();
            try { ids.add(Long.valueOf(value)); }
            catch (NumberFormatException overflow) { throw invalid(); }
        }
        if (new HashSet<>(ids).size() != ids.size()) throw invalid();
        return ids.stream().sorted().toList();
    }

    public static List<Long> fromStored(String value) {
        if (value == null) return List.of();
        if (value.length() > 22000) throw invalid();
        try {
            JsonNode array = JSON.readTree(value);
            if (array == null || !array.isArray() || array.size() > MAX_ITEMS) throw invalid();
            List<String> ids = new ArrayList<>();
            for (JsonNode item : array) {
                if (!item.isIntegralNumber() || !item.canConvertToLong()) throw invalid();
                ids.add(item.asText());
            }
            return fromRequest(ids);
        } catch (java.io.IOException malformed) { throw invalid(); }
    }

    public static String encode(List<Long> ids) {
        if (ids == null) throw invalid();
        return fromRequest(ids.stream().map(String::valueOf).toList()).toString();
    }

    private static ServiceException invalid() {
        return new ServiceException("每类公开清单须为最多1000个不重复的有效项目编号", 400);
    }
}
