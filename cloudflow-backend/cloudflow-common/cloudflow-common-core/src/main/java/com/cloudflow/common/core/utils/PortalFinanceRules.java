package com.cloudflow.common.core.utils;

import com.cloudflow.common.core.domain.PortalFinancePublicationVO;
import com.cloudflow.common.core.domain.PortalFinanceState;
import com.cloudflow.common.core.domain.PortalFinanceAttachment;
import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

public final class PortalFinanceRules {
    private static final ObjectMapper JSON = new ObjectMapper();
    private PortalFinanceRules() { }

    public record Change(int version, boolean publish, List<Long> fileIds) { }

    public static Change change(JsonNode body) {
        if (body == null || !body.isObject()) throw invalid();
        body.fieldNames().forEachRemaining(name -> { if (!Set.of("version", "publish", "fileIds").contains(name)) throw invalid(); });
        JsonNode version = body.get("version");
        if (version == null || !version.isIntegralNumber() || !version.canConvertToInt()
                || version.intValue() < 0 || !body.path("publish").isBoolean() || !body.path("fileIds").isArray()) throw invalid();
        List<Long> files = fileIds(body.get("fileIds"));
        if (!body.get("publish").booleanValue() && !files.isEmpty()) throw invalid();
        return new Change(version.intValue(), body.get("publish").booleanValue(), files);
    }

    public static List<Long> storedFiles(String json) {
        if (json == null) return List.of();
        try { return fileIds(JSON.readTree(json)); }
        catch (java.io.IOException failure) { throw new ServiceException("公开文件记录无效，请重新核对单据", 409); }
    }

    private static List<Long> fileIds(JsonNode values) {
        if (values == null || !values.isArray()) throw invalid();
        Set<Long> unique = new HashSet<>();
        List<Long> files = new ArrayList<>();
        for (JsonNode value : values) {
            String text = value.isTextual() || value.isIntegralNumber() ? value.asText() : "";
            if (!text.matches("[1-9][0-9]{0,18}")) throw invalid();
            long id;
            try { id = Long.parseLong(text); } catch (NumberFormatException failure) { throw invalid(); }
            if (!unique.add(id)) throw invalid();
            files.add(id);
        }
        files.sort(Long::compareTo);
        return List.copyOf(files);
    }

    public static String jsonFiles(List<Long> ids) {
        try { return JSON.writeValueAsString(ids.stream().map(String::valueOf).toList()); }
        catch (java.io.IOException impossible) { throw new IllegalStateException("公开文件编号序列化失败"); }
    }

    public static boolean published(PortalFinanceState state) {
        return state.getPublicVersion() != null && Objects.equals(state.getVersion(), state.getPublicVersion())
                && state.getPublishedBy() != null && state.getPublishedTime() != null && state.getFileIdsJson() != null;
    }

    public static PortalFinancePublicationVO preview(PortalFinanceState state, List<PortalFinanceAttachment> available) {
        PortalFinancePublicationVO view = new PortalFinancePublicationVO();
        view.setVersion(state.getVersion());
        view.setPublicationStatus(published(state) ? "PUBLISHED" : state.getPublicVersion() == null ? "PRIVATE" : "STALE");
        view.setCustomerId(String.valueOf(state.getCustomerId())); view.setCustomerName(state.getCustomerName());
        view.setPublishedBy(state.getPublishedBy() == null ? null : state.getPublishedBy().toString());
        view.setPublishedTime(state.getPublishedTime());
        view.setFileIds(storedFiles(state.getFileIdsJson()).stream().map(String::valueOf).toList());
        view.setAvailableFiles(available); view.setRecord(state.getRecord());
        return view;
    }

    public static boolean unchanged(PortalFinanceState state, Change change) {
        // Repeated identical requests can confirm the outcome after a lost response without new audit writes.
        boolean sameOutcome = change.publish() ? published(state) && storedFiles(state.getFileIdsJson()).equals(change.fileIds())
                : state.getPublicVersion() == null;
        return sameOutcome && (Objects.equals(state.getVersion(), change.version())
                || change.version() < Integer.MAX_VALUE && Objects.equals(state.getVersion(), change.version() + 1));
    }

    public static void version(PortalFinanceState state, Change change) {
        if (!Objects.equals(state.getVersion(), change.version()) || change.version() == Integer.MAX_VALUE)
            throw new ServiceException("单据已变化，请重新读取并核对后确认公开", 409);
    }

    public static String kind(String kind) {
        if (!Set.of("RECEIVABLE", "INVOICE").contains(kind == null ? "" : kind)) throw invalid();
        return kind;
    }

    private static ServiceException invalid() { return new ServiceException("公开确认内容无效，请重新核对版本与所选票据", 400); }
}
