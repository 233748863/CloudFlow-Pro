package com.cloudflow.crm.service.impl;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.crm.domain.CrmCampaignLog;
import com.cloudflow.crm.mapper.CrmCampaignLogMapper;
import com.cloudflow.crm.support.CrmCampaignLogArchiveCodec;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CrmCampaignLogArchiveService {
    public static final int RETENTION_MONTHS = 12;
    public static final int BATCH_LIMIT = 200;
    private final CrmCampaignLogMapper logs;

    public record Result(int checked, int archived, long previousDetailBytes, long retainedDetailBytes) {
    }

    @Audit(name = "营销日志到期详情归档")
    @Transactional(rollbackFor = Exception.class)
    public Result archiveExpired() {
        LocalDateTime observedAt = LocalDateTime.now().withNano(0);
        Long tenantId = CrmRecordSupport.tenantId();
        LocalDateTime cutoff = observedAt.minusMonths(RETENTION_MONTHS);
        List<Long> candidateIds = logs.selectArchiveCandidateIds(tenantId, cutoff, BATCH_LIMIT);
        int checked = 0;
        int archived = 0;
        long previousDetailBytes = 0;
        long retainedDetailBytes = 0;
        for (Long logId : candidateIds) {
            CrmCampaignLog candidate = logs.lockArchiveCandidate(tenantId, logId, cutoff);
            if (candidate == null) continue;
            CrmCampaignLogArchiveCodec.Encoded encoded = CrmCampaignLogArchiveCodec.encode(new CrmCampaignLogArchiveCodec.Details(
                    candidate.getTargetEmail(), candidate.getClickUrl(), candidate.getUserAgent(), candidate.getIpAddress()));
            previousDetailBytes += encoded.detailBytes();
            if (encoded.storedBytes() < encoded.detailBytes()) {
                candidate.setArchivePayload(encoded.payload());
                candidate.setArchiveChecksum(encoded.checksum());
                candidate.setArchivedTime(observedAt);
                retainedDetailBytes += encoded.storedBytes();
                archived++;
            } else {
                retainedDetailBytes += encoded.detailBytes();
            }
            candidate.setArchiveCheckedTime(observedAt);
            if (logs.archiveDetails(tenantId, candidate) != 1) throw new IllegalStateException("营销日志到期详情归档发生并发变更");
            checked++;
        }
        return new Result(checked, archived, previousDetailBytes, retainedDetailBytes);
    }
}
