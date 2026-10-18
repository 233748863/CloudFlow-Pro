package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.controller.AssetExceptionHandler;
import org.springframework.http.ResponseEntity;

import static com.cloudflow.oa.service.impl.OaOperationsChecks.*;

final class OaAssetExceptionChecks {
    private OaAssetExceptionChecks() { }

    static void run() {
        AssetExceptionHandler handler = new AssetExceptionHandler();
        ResponseEntity<R<Void>> cycle = handler.invalidCommand(new IllegalArgumentException("分类存在循环引用"));
        equal(400, cycle.getStatusCode().value(), "asset category cycle is a business rejection");
        equal("分类存在循环引用", cycle.getBody().getMsg(), "asset category cycle keeps actionable message");
        ResponseEntity<R<Void>> stale = handler.invalidState(new IllegalStateException("记录已修改，请刷新后重试"));
        equal(409, stale.getStatusCode().value(), "asset optimistic write conflict remains retryable");
        ResponseEntity<R<Void>> field = handler.invalidCommand(new IllegalArgumentException("资产名称不能为空且不能超过100个字符"));
        equal("资产名称不能为空且不能超过100个字符", field.getBody().getMsg(), "asset bounded validation keeps field message");
        String internal = "jdbc:mysql://127.0.0.1/private?password=DO_NOT_EXPOSE";
        ResponseEntity<R<Void>> unknownArgument = handler.invalidCommand(new IllegalArgumentException(internal));
        equal(400, unknownArgument.getStatusCode().value(), "unknown asset argument uses bounded client rejection");
        check(!unknownArgument.getBody().getMsg().contains(internal), "unknown asset argument does not expose exception detail");
        ResponseEntity<R<Void>> unknownState = handler.invalidState(new IllegalStateException(internal));
        equal(500, unknownState.getStatusCode().value(), "unknown asset state remains a server failure");
        check(unknownState.getBody().getMsg().startsWith("服务异常，请联系管理员，traceId=") && !unknownState.getBody().getMsg().contains(internal), "unknown asset state returns trace without internal detail");
    }
}
