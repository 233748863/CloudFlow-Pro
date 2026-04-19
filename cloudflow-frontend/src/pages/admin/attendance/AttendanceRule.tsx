import React, { useState } from 'react';
import { getAttendanceRule, saveAttendanceRule, AttendanceRule } from '@/services/api/admin';
import { useMount } from '@/hooks/useMount';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, DatePicker, Input, Label, Switch, Textarea } from '@/components/ui';
import { WorkspaceStatusPanel } from '@/components/workspace/WorkspacePrimitives';
import { toast } from 'sonner';

const WEEKDAYS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' }
];

const AttendanceRulePage: React.FC = () => {
  const [rule, setRule] = useState<AttendanceRule | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);

  useMount(() => {
    loadRule();
  });

  const loadRule = () => {
    setLoading(true);
    getAttendanceRule()
      .then(res => {
        const data = res || null;
        if (data) {
          setRule(data as AttendanceRule);
          if (data.workDays) {
            try {
              setWorkDays(JSON.parse(data.workDays));
            } catch (e) {
              setWorkDays([1, 2, 3, 4, 5]);
            }
          }
        }
      })
      .catch(() => {
        toast.error('加载考勤规则失败');
      })
      .finally(() => setLoading(false));
  };

  const handleSave = async () => {
    if (!rule) return;

    // 验证必填字段
    if (!rule.ruleName?.trim()) {
      toast.error('请输入规则名称');
      return;
    }
    if (!rule.checkInTime) {
      toast.error('请设置上班时间');
      return;
    }
    if (!rule.checkOutTime) {
      toast.error('请设置下班时间');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...rule,
        workDays: JSON.stringify(workDays),
        enabled: rule.enabled ?? 1
      };
      await saveAttendanceRule(payload);
      toast.success('保存成功');
      setEditing(false);
      loadRule();
    } catch (error) {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    loadRule();
  };

  const toggleWorkDay = (day: number) => {
    setWorkDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-full max-w-3xl px-6">
          <WorkspaceStatusPanel title="正在加载考勤规则..." icon={null} className="py-12" iconWrapClassName="hidden" />
        </div>
      </div>
    );
  }

  if (!rule && !editing) {
    return (
      <div className="p-6">
        <Card className="max-w-3xl mx-auto">
          <CardContent className="text-center py-10">
            <WorkspaceStatusPanel
              title="暂无考勤规则"
              description="创建第一套考勤规则后，这里会统一维护上下班时间、工作日、加班与迟到口径。"
              icon={null}
              className="py-12"
              iconWrapClassName="hidden"
              actions={(
                <Button onClick={() => {
                  setRule({
                    ruleName: '默认考勤组',
                    checkInTime: '09:00:00',
                    checkOutTime: '18:00:00',
                    elasticMinutes: 30,
                    workDays: '[1,2,3,4,5]',
                    lunchBreakStart: '12:00:00',
                    lunchBreakEnd: '13:00:00',
                    overtimeEnabled: 0,
                    overtimeMinMinutes: 30,
                    lateToleranceCount: 3,
                    severeLateMinutes: 60,
                    absentMinutes: 240,
                    photoRequired: 0,
                    enabled: 1,
                    radius: 200
                  });
                  setEditing(true);
                }}>
                  创建考勤规则
                </Button>
              )}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedWorkDays = WEEKDAYS.filter(day => workDays.includes(day.value));
  const enabledLabel = rule?.enabled === 1 ? '已启用' : '未启用';
  const modeLabel = editing ? '编辑中' : '只读';

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 页面标题 */}
        <div className="rounded-2xl border border-cyan-100 bg-gradient-to-r from-cyan-50 via-white to-amber-50 p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">考勤规则配置</h1>
              <p className="text-sm text-gray-500 mt-1">配置企业的上下班时间、工作日、加班、迟到等考勤规则</p>
              {rule?.ruleName && (
                <p className="text-xs text-gray-500 mt-2">规则名称：<span className="font-medium text-gray-800">{rule.ruleName}</span></p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`px-3 py-1 rounded-full border ${rule?.enabled === 1 ? 'bg-green-50 text-green-600 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                {enabledLabel}
              </span>
              <span className={`px-3 py-1 rounded-full border ${editing ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-white text-gray-500 border-gray-200'}`}>
                {modeLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>考勤规则配置</CardTitle>
              <CardDescription>
                配置企业的上下班时间、工作日、加班、迟到等考勤规则
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 基本信息 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">基本信息</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>规则名称 *</Label>
                    <Input
                      value={rule?.ruleName || ''}
                      onChange={e => setRule(prev => prev ? { ...prev, ruleName: e.target.value } : null)}
                      disabled={!editing}
                      placeholder="例如：默认考勤组"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>弹性时间（分钟）</Label>
                    <Input
                      type="number"
                      value={rule?.elasticMinutes || 0}
                      onChange={e => setRule(prev => prev ? { ...prev, elasticMinutes: parseInt(e.target.value) || 0 } : null)}
                      disabled={!editing}
                      placeholder="允许迟到的弹性时间"
                    />
                  </div>
                </div>
              </div>

              {/* 上下班时间 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">上下班时间</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>上班时间 *</Label>
                    <DatePicker
                      type="time"
                      value={rule?.checkInTime || ''}
                      onChange={e => setRule(prev => prev ? { ...prev, checkInTime: e.target.value } : null)}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>下班时间 *</Label>
                    <DatePicker
                      type="time"
                      value={rule?.checkOutTime || ''}
                      onChange={e => setRule(prev => prev ? { ...prev, checkOutTime: e.target.value } : null)}
                      disabled={!editing}
                    />
                  </div>
                </div>
              </div>

              {/* 工作日配置 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">工作日配置</h3>
                <div className="flex gap-2 flex-wrap">
                  {WEEKDAYS.map(day => (
                    <Button
                      key={day.value}
                      type="button"
                      onClick={() => editing && toggleWorkDay(day.value)}
                      disabled={!editing}
                      variant={workDays.includes(day.value) ? 'default' : 'outline'}
                      className={workDays.includes(day.value) ? '' : 'text-gray-700 border-gray-300 hover:bg-gray-50'}
                      size="sm"
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* 午休时间 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">午休时间</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>午休开始</Label>
                    <DatePicker
                      type="time"
                      value={rule?.lunchBreakStart || ''}
                      onChange={e => setRule(prev => prev ? { ...prev, lunchBreakStart: e.target.value } : null)}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>午休结束</Label>
                    <DatePicker
                      type="time"
                      value={rule?.lunchBreakEnd || ''}
                      onChange={e => setRule(prev => prev ? { ...prev, lunchBreakEnd: e.target.value } : null)}
                      disabled={!editing}
                    />
                  </div>
                </div>
              </div>

              {/* 加班设置 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">加班设置</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>是否允许加班</Label>
                    <Switch
                      checked={rule?.overtimeEnabled === 1}
                      onCheckedChange={checked => setRule(prev => prev ? { ...prev, overtimeEnabled: checked ? 1 : 0 } : null)}
                      disabled={!editing}
                    />
                  </div>
                  {rule?.overtimeEnabled === 1 && (
                    <div className="space-y-2">
                      <Label>加班最低时长（分钟）</Label>
                      <Input
                        type="number"
                        value={rule?.overtimeMinMinutes || 30}
                        onChange={e => setRule(prev => prev ? { ...prev, overtimeMinMinutes: parseInt(e.target.value) || 30 } : null)}
                        disabled={!editing}
                        placeholder="低于此时长不计加班"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 迟到与旷工设置 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">迟到与旷工设置</h3>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>每月迟到容忍次数</Label>
                    <Input
                      type="number"
                      value={rule?.lateToleranceCount || 0}
                      onChange={e => setRule(prev => prev ? { ...prev, lateToleranceCount: parseInt(e.target.value) || 0 } : null)}
                      disabled={!editing}
                      placeholder="超过后才算迟到"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>严重迟到阈值（分钟）</Label>
                    <Input
                      type="number"
                      value={rule?.severeLateMinutes || 60}
                      onChange={e => setRule(prev => prev ? { ...prev, severeLateMinutes: parseInt(e.target.value) || 60 } : null)}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>旷工阈值（分钟）</Label>
                    <Input
                      type="number"
                      value={rule?.absentMinutes || 240}
                      onChange={e => setRule(prev => prev ? { ...prev, absentMinutes: parseInt(e.target.value) || 240 } : null)}
                      disabled={!editing}
                      placeholder="迟到超过此时长算旷工"
                    />
                  </div>
                </div>
              </div>

              {/* 打卡设置 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">打卡设置</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>是否需要拍照打卡</Label>
                    <Switch
                      checked={rule?.photoRequired === 1}
                      onCheckedChange={checked => setRule(prev => prev ? { ...prev, photoRequired: checked ? 1 : 0 } : null)}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>打卡范围半径（米）</Label>
                    <Input
                      type="number"
                      value={rule?.radius || 200}
                      onChange={e => setRule(prev => prev ? { ...prev, radius: parseInt(e.target.value) || 200 } : null)}
                      disabled={!editing}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Wi-Fi 配置（JSON格式）</Label>
                    <Textarea
                      value={rule?.wifiConfigs || ''}
                      onChange={e => setRule(prev => prev ? { ...prev, wifiConfigs: e.target.value } : null)}
                      disabled={!editing}
                      placeholder='[{"ssid":"Office-WiFi","mac":"AA:BB:CC:DD:EE:FF"}]'
                      className="font-mono text-sm"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* 规则状态 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">规则状态</h3>
                <div className="flex items-center justify-between">
                  <Label>启用此规则</Label>
                  <Switch
                    checked={rule?.enabled === 1}
                    onCheckedChange={checked => setRule(prev => prev ? { ...prev, enabled: checked ? 1 : 0 } : null)}
                    disabled={!editing}
                  />
                </div>
              </div>

              {/* 备注 */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold border-b pb-2">备注说明</h3>
                <Textarea
                  value={rule?.remark || ''}
                  onChange={e => setRule(prev => prev ? { ...prev, remark: e.target.value } : null)}
                  disabled={!editing}
                  placeholder="可选的备注说明"
                  rows={3}
                />
              </div>

              {/* 操作按钮 */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                {editing ? (
                  <>
                    <Button variant="outline" onClick={handleCancel} disabled={saving}>
                      取消
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? '保存中...' : '保存规则'}
                    </Button>
                  </>
                ) : (
                  <Button onClick={() => setEditing(true)}>
                    编辑规则
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 右侧摘要栏 */}
          <div className="space-y-4 lg:sticky lg:top-24 h-fit">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">规则概览</CardTitle>
                <CardDescription>关键设置快速预览</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">规则名称</span>
                  <span className="font-medium text-gray-800">{rule?.ruleName || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">上下班时间</span>
                  <span className="font-medium text-gray-800">{rule?.checkInTime || '--'} / {rule?.checkOutTime || '--'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">弹性时间</span>
                  <span className="font-medium text-gray-800">{rule?.elasticMinutes ?? 0} 分钟</span>
                </div>
                <div>
                  <div className="text-gray-500 mb-2">工作日</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedWorkDays.length > 0 ? selectedWorkDays.map(day => (
                      <span key={day.value} className="px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-700">{day.label}</span>
                    )) : (
                      <span className="text-gray-400 text-xs">未设置</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">午休时间</span>
                  <span className="font-medium text-gray-800">{rule?.lunchBreakStart || '--'} / {rule?.lunchBreakEnd || '--'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">加班允许</span>
                  <span className="font-medium text-gray-800">{rule?.overtimeEnabled === 1 ? '是' : '否'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">打卡范围</span>
                  <span className="font-medium text-gray-800">{rule?.radius ?? 200} 米</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">规则状态</span>
                  <span className={`font-medium ${rule?.enabled === 1 ? 'text-green-600' : 'text-gray-500'}`}>{enabledLabel}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">使用提示</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-gray-600 space-y-2">
                <p>建议先配置上下班时间与工作日，再调整迟到/旷工阈值。</p>
                <p>修改规则后请保存，所有员工将按最新规则进行考勤。</p>
                <p>如需临时停用，可在“规则状态”中切换。</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttendanceRulePage;
