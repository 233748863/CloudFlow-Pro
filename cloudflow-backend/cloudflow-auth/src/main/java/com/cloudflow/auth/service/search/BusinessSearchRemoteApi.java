package com.cloudflow.auth.service.search;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.search.BusinessSearchGroup;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

public interface BusinessSearchRemoteApi {
    @GetMapping("/search")
    R<List<BusinessSearchGroup>> search(@RequestParam("keyword") String keyword, @RequestParam("limitPerType") int limitPerType);
}
