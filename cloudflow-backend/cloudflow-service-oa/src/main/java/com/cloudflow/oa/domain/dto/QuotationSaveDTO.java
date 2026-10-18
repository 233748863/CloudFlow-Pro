package com.cloudflow.oa.domain.dto;

import com.cloudflow.oa.domain.OaSupplierQuotation;
import com.cloudflow.oa.domain.OaSupplierQuotationItem;
import lombok.Data;
import java.util.List;

@Data
public class QuotationSaveDTO {
    private OaSupplierQuotation quotation;
    private List<OaSupplierQuotationItem> items;
}
