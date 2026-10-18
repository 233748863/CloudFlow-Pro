package com.cloudflow.oa.domain.dto;

import com.cloudflow.oa.domain.OaPurchaseRfq;
import com.cloudflow.oa.domain.OaPurchaseRfqItem;
import lombok.Data;
import java.util.List;

@Data
public class RfqSaveDTO {
    private OaPurchaseRfq rfq;
    private List<OaPurchaseRfqItem> items;
}
