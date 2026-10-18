package com.cloudflow.crm.mapper.handler;

import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.core.type.TypeReference;
import java.util.List;

public class CrmEmailFileIdsTypeHandler extends JacksonTypeHandler {
    public CrmEmailFileIdsTypeHandler(Class<?> type) { super(type); }

    @Override public Object parse(String value) {
        try { return getObjectMapper().readValue(value, new TypeReference<List<Long>>() { }); }
        catch (Exception invalid) { throw new IllegalArgumentException("邮件附件标识列表无效"); }
    }
}
