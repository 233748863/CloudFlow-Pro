import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, Edit, Plus, Search, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  dictDataApi,
  dictTypeApi,
  SysDictData,
  SysDictType,
} from "../../services/api/dict";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableActionHead,
  TableHead,
  TableHeader,
  Textarea,
} from "@/components/ui";
import { TableRowActions } from "@/components/ui/table-row-actions";
import {
  WorkspaceInlineState,
  WorkspaceBackdrop,
} from "@/components/workspace/WorkspacePrimitives";
import {
  WorkspaceDialogShell,
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceResultCard,
  WorkspaceSectionCard,
  WorkspaceWorkbenchCard,
} from "@/components/workspace/WorkspacePanels";
import { cn } from "@/utils/cn";

interface DictTypeFormState {
  dictName: string;
  dictType: string;
  status: string;
  remark: string;
}

interface DictDataFormState {
  dictLabel: string;
  dictValue: string;
  dictSort: number;
  listClass: string;
  isDefault: string;
  status: string;
  remark: string;
}

const createTypeForm = (): DictTypeFormState => ({
  dictName: "",
  dictType: "",
  status: "0",
  remark: "",
});

const createDataForm = (): DictDataFormState => ({
  dictLabel: "",
  dictValue: "",
  dictSort: 0,
  listClass: "",
  isDefault: "N",
  status: "0",
  remark: "",
});

const listClassColors: Record<string, string> = {
  default: "bg-slate-100 text-slate-700",
  primary: "bg-pink-100 text-pink-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  info: "bg-sky-100 text-sky-700",
};

/** 字典管理页面 */
export const DictPage: React.FC = () => {
  const [dictTypes, setDictTypes] = useState<SysDictType[]>([]);
  const [selectedType, setSelectedType] = useState<SysDictType | null>(null);
  const [typeLoading, setTypeLoading] = useState(false);
  const [dictDataList, setDictDataList] = useState<SysDictData[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [dataModalOpen, setDataModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<SysDictType | null>(null);
  const [editingData, setEditingData] = useState<SysDictData | null>(null);
  const [typeForm, setTypeForm] = useState<DictTypeFormState>(createTypeForm);
  const [dataForm, setDataForm] = useState<DictDataFormState>(createDataForm);
  const [typeKeyword, setTypeKeyword] = useState("");

  useEffect(() => {
    void loadDictTypes();
  }, []);

  useEffect(() => {
    if (selectedType) {
      void loadDictData(selectedType.dictType);
    }
  }, [selectedType]);

  // 类型列表刷新后，同步当前选中项，避免引用旧对象造成展示状态不一致。
  useEffect(() => {
    if (!selectedType) {
      return;
    }
    const matched = dictTypes.find(
      (item) => item.dictId === selectedType.dictId,
    );
    if (matched) {
      setSelectedType(matched);
      return;
    }
    setSelectedType(null);
    setDictDataList([]);
  }, [dictTypes]);

  const loadDictTypes = async () => {
    setTypeLoading(true);
    try {
      const res = await dictTypeApi.list();
      setDictTypes(Array.isArray(res) ? res : []);
    } catch (error) {
      console.error("获取字典类型失败:", error);
      toast.error("获取字典类型失败");
    } finally {
      setTypeLoading(false);
    }
  };

  const loadDictData = async (dictType: string) => {
    setDataLoading(true);
    try {
      const res = await dictDataApi.list(dictType);
      setDictDataList(Array.isArray(res) ? res : []);
    } catch (error) {
      console.error("获取字典数据失败:", error);
      toast.error("获取字典数据失败");
    } finally {
      setDataLoading(false);
    }
  };

  const openTypeModal = (item?: SysDictType) => {
    if (item) {
      setEditingType(item);
      setTypeForm({
        dictName: item.dictName,
        dictType: item.dictType,
        status: item.status || "0",
        remark: item.remark || "",
      });
    } else {
      setEditingType(null);
      setTypeForm(createTypeForm());
    }
    setTypeModalOpen(true);
  };

  const closeTypeModal = () => {
    setTypeModalOpen(false);
    setEditingType(null);
    setTypeForm(createTypeForm());
  };

  const saveType = async () => {
    if (!typeForm.dictName || !typeForm.dictType) {
      toast.error("请填写字典名称和类型标识");
      return;
    }

    try {
      if (editingType) {
        await dictTypeApi.edit({ ...editingType, ...typeForm });
        toast.success("修改成功");
      } else {
        await dictTypeApi.add(typeForm as SysDictType);
        toast.success("新增成功");
      }
      closeTypeModal();
      await loadDictTypes();
    } catch (error) {
      console.error("保存字典类型失败:", error);
      toast.error("保存失败");
    }
  };

  const deleteType = async (item: SysDictType) => {
    if (
      !window.confirm(
        `确认删除字典类型“${item.dictName}”？将同时删除关联的字典数据。`,
      )
    ) {
      return;
    }

    try {
      await dictTypeApi.remove([item.dictId!]);
      toast.success("删除成功");
      if (selectedType?.dictId === item.dictId) {
        setSelectedType(null);
        setDictDataList([]);
      }
      await loadDictTypes();
    } catch (error) {
      console.error("删除字典类型失败:", error);
      toast.error("删除失败");
    }
  };

  const openDataModal = (item?: SysDictData) => {
    if (!selectedType && !item) {
      toast.error("请先选择字典类型");
      return;
    }

    if (item) {
      setEditingData(item);
      setDataForm({
        dictLabel: item.dictLabel,
        dictValue: item.dictValue,
        dictSort: item.dictSort || 0,
        listClass: item.listClass || "",
        isDefault: item.isDefault || "N",
        status: item.status || "0",
        remark: item.remark || "",
      });
    } else {
      setEditingData(null);
      setDataForm(createDataForm());
    }
    setDataModalOpen(true);
  };

  const closeDataModal = () => {
    setDataModalOpen(false);
    setEditingData(null);
    setDataForm(createDataForm());
  };

  const saveData = async () => {
    if (!dataForm.dictLabel || !dataForm.dictValue) {
      toast.error("请填写标签和键值");
      return;
    }

    try {
      if (editingData) {
        await dictDataApi.edit({ ...editingData, ...dataForm });
        toast.success("修改成功");
      } else {
        await dictDataApi.add({
          ...dataForm,
          dictType: selectedType!.dictType,
        } as SysDictData);
        toast.success("新增成功");
      }
      closeDataModal();
      await loadDictData(selectedType!.dictType);
    } catch (error) {
      console.error("保存字典数据失败:", error);
      toast.error("保存失败");
    }
  };

  const deleteData = async (item: SysDictData) => {
    if (!window.confirm(`确认删除字典数据“${item.dictLabel}”？`)) {
      return;
    }
    try {
      await dictDataApi.remove([item.dictCode!]);
      toast.success("删除成功");
      await loadDictData(selectedType!.dictType);
    } catch (error) {
      console.error("删除字典数据失败:", error);
      toast.error("删除失败");
    }
  };

  const filteredTypes = useMemo(
    () =>
      dictTypes.filter(
        (item) =>
          !typeKeyword ||
          item.dictName.includes(typeKeyword) ||
          item.dictType.includes(typeKeyword),
      ),
    [dictTypes, typeKeyword],
  );

  const activeTypeCount = useMemo(
    () => dictTypes.filter((item) => (item.status || "0") === "0").length,
    [dictTypes],
  );

  const activeDataCount = useMemo(
    () => dictDataList.filter((item) => (item.status || "0") === "0").length,
    [dictDataList],
  );

  const now = new Date();
  const todayLabel = `${now.getMonth() + 1}/${now.getDate()}`;
  const timeLabel = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const overviewItems = [
    { label: "当前类型", value: selectedType?.dictName || "未选择" },
    { label: "类型总数", value: `${dictTypes.length} 个` },
    { label: "搜索结果", value: `${filteredTypes.length} 个` },
    { label: "数据项", value: `${dictDataList.length} 条` },
  ];

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />
      <div className="relative z-10 space-y-3">
        <WorkspaceHeroCard
          badge={
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-1 text-pink-600 ring-1 ring-pink-100">
                <BookOpen className="h-3.5 w-3.5" />
                {todayLabel}
              </span>
              <span className="rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-slate-200/80">
                {timeLabel}
              </span>
            </div>
          }
          title="字典管理"
          description="把字典类型、字典数据和维护入口统一收口到工作台结构中，便于横向对齐后台管理页的视觉与操作节奏。"
          actions={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => openTypeModal()}>
                <Plus className="h-4 w-4" />
                新增字典类型
              </Button>
              <Button onClick={() => openDataModal()} disabled={!selectedType}>
                <Tag className="h-4 w-4" />
                新增字典数据
              </Button>
            </div>
          }
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="字典类型"
              value={dictTypes.length}
              hint={`正常状态 ${activeTypeCount} 个`}
              aside={<BookOpen className="h-[18px] w-[18px] text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="当前数据项"
              value={dictDataList.length}
              hint={`正常状态 ${activeDataCount} 条`}
              aside={<Tag className="h-[18px] w-[18px] text-sky-500" />}
            />
            <WorkspaceMetricCard
              label="当前选择"
              value={selectedType?.dictName || "未选择"}
              hint={selectedType?.dictType || "从左侧选择字典类型后查看数据"}
              aside={<Search className="h-[18px] w-[18px] text-amber-500" />}
            />
            <WorkspaceMetricCard
              label="筛选结果"
              value={filteredTypes.length}
              hint={
                typeKeyword ? `关键词：${typeKeyword}` : "当前未启用搜索筛选"
              }
              aside={<Search className="h-[18px] w-[18px] text-emerald-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <WorkspaceWorkbenchCard
          title="字典工作台"
          total={dictTypes.length}
          hasActiveFilters={Boolean(typeKeyword)}
          overviewItems={overviewItems}
          quickFilterAside={
            typeKeyword ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTypeKeyword("")}
              >
                清空筛选
              </Button>
            ) : (
              <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                当前显示全部字典类型
              </span>
            )
          }
          filterBar={
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="搜索字典名称或类型标识"
                value={typeKeyword}
                onChange={(event) => setTypeKeyword(event.target.value)}
                className="pl-10"
              />
            </div>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <WorkspaceSectionCard
            eyebrow="Types"
            title="字典类型"
            description="左侧维护字典类型，右侧联动展示对应字典数据。"
            headerAside={
              <Button
                variant="outline"
                size="sm"
                onClick={() => openTypeModal()}
              >
                <Plus className="h-4 w-4" />
                新增
              </Button>
            }
          >
            <div className="space-y-3">
              {typeLoading ? (
                <WorkspaceInlineState
                  type="loading"
                  title="正在加载字典类型..."
                  className="py-10"
                />
              ) : filteredTypes.length === 0 ? (
                <WorkspaceInlineState
                  icon={<BookOpen size={22} />}
                  title="暂无字典类型"
                  className="py-10"
                />
              ) : (
                filteredTypes.map((item) => (
                  <div
                    key={item.dictId}
                    onClick={() => setSelectedType(item)}
                    className={cn(
                      "group cursor-pointer rounded-[22px] border px-4 py-3 transition-all",
                      selectedType?.dictId === item.dictId
                        ? "border-pink-200 bg-pink-50/90 shadow-[0_12px_24px_rgba(244,114,182,0.08)]"
                        : "border-white/70 bg-white/72 hover:bg-white hover:shadow-[0_12px_24px_rgba(15,23,42,0.05)]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800">
                          {item.dictName}
                        </div>
                        <div className="mt-1 font-mono text-xs text-slate-500">
                          {item.dictType}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-medium",
                              (item.status || "0") === "0"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-rose-100 text-rose-700",
                            )}
                          >
                            {(item.status || "0") === "0" ? "正常" : "停用"}
                          </span>
                        </div>
                      </div>
                      <TableRowActions
                        wrap={false}
                        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                        actions={[
                          {
                            label: "编辑",
                            icon: <Edit size={13} />,
                            onClick: (event) => {
                              event.stopPropagation();
                              openTypeModal(item);
                            },
                            tone: "primary",
                          },
                          {
                            label: "删除",
                            icon: <Trash2 size={13} />,
                            onClick: (event) => {
                              event.stopPropagation();
                              void deleteType(item);
                            },
                            tone: "danger",
                          },
                        ]}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </WorkspaceSectionCard>

          <WorkspaceResultCard
            total={dictDataList.length}
            title={
              selectedType ? `${selectedType.dictName} 的字典数据` : "字典数据"
            }
            description={
              selectedType
                ? `当前类型标识：${selectedType.dictType}`
                : "先从左侧选择一个字典类型，再查看或维护对应的字典数据。"
            }
          >
            <div className="overflow-x-auto">
              {!selectedType ? (
                <WorkspaceInlineState
                  icon={<Tag size={28} />}
                  title="请先选择一个字典类型"
                  className="py-20"
                />
              ) : dataLoading ? (
                <WorkspaceInlineState
                  type="loading"
                  title="正在加载字典数据..."
                  className="py-16"
                />
              ) : dictDataList.length === 0 ? (
                <WorkspaceInlineState
                  icon={<Tag size={26} />}
                  title="暂无字典数据"
                  className="py-16"
                />
              ) : (
                <table className="w-full">
                  <TableHeader>
                    <tr>
                      <TableHead className="px-4 py-3">排序</TableHead>
                      <TableHead className="px-4 py-3">标签</TableHead>
                      <TableHead className="px-4 py-3">键值</TableHead>
                      <TableHead className="px-4 py-3">样式</TableHead>
                      <TableHead className="px-4 py-3">状态</TableHead>
                      <TableHead className="px-4 py-3">备注</TableHead>
                      <TableActionHead className="w-48 px-4 py-3">
                        操作
                      </TableActionHead>
                    </tr>
                  </TableHeader>
                  <tbody>
                    {dictDataList.map((item) => (
                      <tr
                        key={item.dictCode}
                        className="border-t border-slate-100 transition-colors hover:bg-white/70"
                      >
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {item.dictSort}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${listClassColors[item.listClass || "default"] || listClassColors.default}`}
                          >
                            {item.dictLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm text-slate-700">
                          {item.dictValue}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {item.listClass || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded px-2 py-0.5 text-xs ${item.status === "0" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                          >
                            {item.status === "0" ? "正常" : "停用"}
                          </span>
                        </td>
                        <td className="max-w-[140px] truncate px-4 py-3 text-xs text-slate-500">
                          {item.remark || "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <TableRowActions
                            align="end"
                            actions={[
                              {
                                label: "编辑",
                                icon: <Edit size={14} />,
                                onClick: () => openDataModal(item),
                                tone: "primary",
                              },
                              {
                                label: "删除",
                                icon: <Trash2 size={14} />,
                                onClick: () => void deleteData(item),
                                tone: "danger",
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </WorkspaceResultCard>
        </div>

        {typeModalOpen ? (
          <WorkspaceDialogShell
            title={editingType ? "编辑字典类型" : "新增字典类型"}
            description="维护字典类型的名称、类型标识、状态和备注信息。"
            onClose={closeTypeModal}
            maxWidthClassName="max-w-xl"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  字典名称 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={typeForm.dictName}
                  onChange={(event) =>
                    setTypeForm({ ...typeForm, dictName: event.target.value })
                  }
                  placeholder="如：用户性别"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  类型标识 <span className="text-red-500">*</span>
                </label>
                <Input
                  className="font-mono"
                  value={typeForm.dictType}
                  onChange={(event) =>
                    setTypeForm({ ...typeForm, dictType: event.target.value })
                  }
                  placeholder="如：sys_user_sex"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  状态
                </label>
                <Select
                  value={typeForm.status}
                  onValueChange={(value) =>
                    setTypeForm({ ...typeForm, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="请选择状态" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">正常</SelectItem>
                    <SelectItem value="1">停用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  备注
                </label>
                <Textarea
                  rows={3}
                  value={typeForm.remark}
                  onChange={(event) =>
                    setTypeForm({ ...typeForm, remark: event.target.value })
                  }
                  placeholder="备注说明"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={closeTypeModal}>
                  取消
                </Button>
                <Button onClick={saveType}>确定</Button>
              </div>
            </div>
          </WorkspaceDialogShell>
        ) : null}

        {dataModalOpen ? (
          <WorkspaceDialogShell
            title={editingData ? "编辑字典数据" : "新增字典数据"}
            description="维护字典标签、键值、排序、样式和默认项设置。"
            onClose={closeDataModal}
            maxWidthClassName="max-w-xl"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  数据标签 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={dataForm.dictLabel}
                  onChange={(event) =>
                    setDataForm({ ...dataForm, dictLabel: event.target.value })
                  }
                  placeholder="如：男"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  数据键值 <span className="text-red-500">*</span>
                </label>
                <Input
                  className="font-mono"
                  value={dataForm.dictValue}
                  onChange={(event) =>
                    setDataForm({ ...dataForm, dictValue: event.target.value })
                  }
                  placeholder="如：0"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    排序号
                  </label>
                  <Input
                    type="number"
                    value={dataForm.dictSort}
                    onChange={(event) =>
                      setDataForm({
                        ...dataForm,
                        dictSort: Number(event.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    样式
                  </label>
                  <Select
                    value={dataForm.listClass}
                    onValueChange={(value) =>
                      setDataForm({ ...dataForm, listClass: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="默认" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">默认</SelectItem>
                      <SelectItem value="primary">主要</SelectItem>
                      <SelectItem value="success">成功</SelectItem>
                      <SelectItem value="warning">警告</SelectItem>
                      <SelectItem value="danger">危险</SelectItem>
                      <SelectItem value="info">信息</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    状态
                  </label>
                  <Select
                    value={dataForm.status}
                    onValueChange={(value) =>
                      setDataForm({ ...dataForm, status: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="请选择状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">正常</SelectItem>
                      <SelectItem value="1">停用</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    是否默认
                  </label>
                  <Select
                    value={dataForm.isDefault}
                    onValueChange={(value) =>
                      setDataForm({ ...dataForm, isDefault: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="N">否</SelectItem>
                      <SelectItem value="Y">是</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  备注
                </label>
                <Textarea
                  rows={3}
                  value={dataForm.remark}
                  onChange={(event) =>
                    setDataForm({ ...dataForm, remark: event.target.value })
                  }
                  placeholder="备注说明"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={closeDataModal}>
                  取消
                </Button>
                <Button onClick={saveData}>确定</Button>
              </div>
            </div>
          </WorkspaceDialogShell>
        ) : null}
      </div>
    </div>
  );
};

export default DictPage;
