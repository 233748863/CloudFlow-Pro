import React, { useState, useEffect } from 'react';
import { getAttendanceRule, AttendanceRule } from '@/services/api/admin';
import { useMount } from '@/hooks/useMount';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label
} from '@/components/ui'


const AttendanceRulePage: React.FC = () => {
  const [rule, setRule] = useState<AttendanceRule | null>(null);
  const [loading, setLoading] = useState(false);

  useMount(() => {
    setLoading(true);
    getAttendanceRule().then(res => {
        // @ts-ignore
        setRule(res.data || res);
        setLoading(false);
    }).catch(() => setLoading(false));
  });

  if (loading) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>考勤规则配置</CardTitle>
          <CardDescription>配置企业的上下班时间与打卡规则 (当前仅支持查看，修改请联系管理员)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {rule ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>规则名称</Label>
                  <Input value={rule.ruleName} readOnly className="bg-gray-50"/>
                </div>
                <div className="space-y-2">
                  <Label>弹性时间 (分钟)</Label>
                  <Input value={rule.elasticMinutes} readOnly className="bg-gray-50"/>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>上班时间</Label>
                  <div className="flex items-center border rounded-md px-3 py-2 bg-gray-50">
                    <span className="text-lg font-mono">{rule.checkInTime}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>下班时间</Label>
                  <div className="flex items-center border rounded-md px-3 py-2 bg-gray-50">
                    <span className="text-lg font-mono">{rule.checkOutTime}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>打卡范围半径 (米)</Label>
                <Input value={rule.radius || 200} readOnly className="bg-gray-50"/>
              </div>

              <div className="space-y-2">
                <Label>Wi-Fi 配置</Label>
                <textarea 
                  className="w-full min-h-[80px] rounded-md border border-input bg-gray-50 px-3 py-2 text-sm" 
                  readOnly 
                  value={rule.wifiConfigs || '未配置'}
                />
              </div>

              <div className="flex justify-end pt-4">
                <Button variant="outline" disabled>编辑规则</Button>
              </div>
            </>
          ) : (
            <div className="text-center py-10 text-gray-500">
              暂无考勤规则，请联系系统管理员进行初始化配置。
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AttendanceRulePage;
