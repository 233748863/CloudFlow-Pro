package com.cloudflow.auth.printing;

import com.cloudflow.common.core.printing.PrintData;
import java.util.Map;

public interface PrintFieldFilter {
    Map<String, Object> filter(PrintData data);
}
