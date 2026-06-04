package com.cloudflow.auth.domain.dto;

import com.cloudflow.auth.domain.SysDictData;
import com.cloudflow.auth.domain.SysDictType;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DictChangeApprovalPayload {

    private String changeScope;

    private String actionType;

    private String dictType;

    private SysDictType oldDictType;

    private SysDictType newDictType;

    private List<SysDictData> oldDictDataList = new ArrayList<>();

    private List<SysDictData> newDictDataList = new ArrayList<>();
}
