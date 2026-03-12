import React, { useState, useEffect } from 'react';
import { getAttendanceRule, saveAttendanceRule, AttendanceRule } from '@/services/api/admin';
import { useMount } from '@/hooks/useMount';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, DatePicker, Input, Label, Switch, Textarea } from '@/components/ui';
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
        const data = (res as any).data || res;
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
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!rule && !editing) {
    return (
      <div className="p-6">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="text-center py-10">
            <p className="text-gray-500 mb-4">暂无考勤规则</p>
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
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Card className="max-w-4xl mx-auto">
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-3 gap-4">
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
    </div>
  );
};

export default AttendanceRulePage;
