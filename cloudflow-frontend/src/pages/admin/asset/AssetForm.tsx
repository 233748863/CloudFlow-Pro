import React, { useState, useEffect } from 'react';
import { addAsset, updateAsset, Asset } from '@/services/api/admin';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui'

interface AssetFormProps {
  /** 编辑时传入已有资产数据 */
  initialData?: Asset | null;
  onSuccess: () => void;
}

const AssetForm: React.FC<AssetFormProps> = ({ initialData, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const isEdit = !!initialData?.assetId;

  const [formData, setFormData] = useState<Asset>({
    name: '',
    assetCode: '',
    category: '',
    model: '',
    status: '1',
    price: 0,
    location: '',
    purchaseDate: '',
    remark: ''
  });

  // 编辑模式下填充表单
  useEffect(() => {
    if (initialData) {
      setFormData({
        ...initialData,
        price: initialData.price || 0,
        purchaseDate: initialData.purchaseDate
          ? String(initialData.purchaseDate).substring(0, 10)
          : ''
      });
    }
  }, [initialData]);

  const handleChange = (field: keyof Asset, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setLoading(true);
    try {
      if (isEdit) {
        await updateAsset(formData);
      } else {
        await addAsset(formData);
      }
      onSuccess();
    } catch (error) {
      console.error("操作失败", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 资产名称 */}
      <div className="grid gap-2">
        <Label htmlFor="name">资产名称 <span className="text-red-500">*</span></Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="请输入资产名称"
          required
        />
      </div>

      {/* 资产编码 */}
      <div className="grid gap-2">
        <Label htmlFor="assetCode">资产编码 <span className="text-red-500">*</span></Label>
        <Input
          id="assetCode"
          value={formData.assetCode}
          onChange={(e) => handleChange('assetCode', e.target.value)}
          placeholder="请输入资产编码"
          required
        />
      </div>

      {/* 分类 + 规格型号 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="category">分类</Label>
          <Input
            id="category"
            value={formData.category}
            onChange={(e) => handleChange('category', e.target.value)}
            placeholder="如：电子设备、办公家具"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="model">规格型号</Label>
          <Input
            id="model"
            value={formData.model}
            onChange={(e) => handleChange('model', e.target.value)}
            placeholder="如：MacBook Pro 14"
          />
        </div>
      </div>

      {/* 状态 + 价格 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="status">状态</Label>
          <Select
            value={formData.status}
            onValueChange={(val) => handleChange('status', val)}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">闲置</SelectItem>
              <SelectItem value="2">在用</SelectItem>
              <SelectItem value="3">维修</SelectItem>
              <SelectItem value="4">报废</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="price">价格（元）</Label>
          <Input
            id="price"
            type="number"
            min="0"
            step="0.01"
            value={formData.price}
            onChange={(e) => handleChange('price', Number(e.target.value))}
          />
        </div>
      </div>

      {/* 存放位置 + 购入日期 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="location">存放位置</Label>
          <Input
            id="location"
            value={formData.location || ''}
            onChange={(e) => handleChange('location', e.target.value)}
            placeholder="如：3楼A区"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="purchaseDate">购入日期</Label>
          <Input
            id="purchaseDate"
            type="date"
            value={formData.purchaseDate || ''}
            onChange={(e) => handleChange('purchaseDate', e.target.value)}
          />
        </div>
      </div>

      {/* 备注 */}
      <div className="grid gap-2">
        <Label htmlFor="remark">备注</Label>
        <textarea
          id="remark"
          value={formData.remark || ''}
          onChange={(e) => handleChange('remark', e.target.value)}
          placeholder="可选备注信息"
          rows={3}
          className="flex min-h-[60px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-pink-400 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? '提交中...' : isEdit ? '保存修改' : '确认新增'}
      </Button>
    </form>
  );
};

export default AssetForm;
