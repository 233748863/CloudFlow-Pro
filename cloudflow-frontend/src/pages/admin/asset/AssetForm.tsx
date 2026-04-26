import React, { useState, useEffect } from 'react';
import { addAsset, updateAsset, Asset } from '@/services/api/admin';
import { DatePicker, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from '@/components/common';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';

interface AssetFormProps {
  /** 编辑时传入已有资产数据 */
  initialData?: Asset | null;
  formId?: string;
  onSuccess: () => void;
  onSubmittingChange?: (submitting: boolean) => void;
}

const AssetForm: React.FC<AssetFormProps> = ({
  initialData,
  formId,
  onSuccess,
  onSubmittingChange,
}) => {
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
    if (!formData.name.trim() || !formData.assetCode?.trim()) {
      toast.error('请填写资产名称和资产编码');
      return;
    }

    setLoading(true);
    onSubmittingChange?.(true);
    try {
      if (isEdit) {
        await updateAsset(formData);
        toast.success('保存成功');
      } else {
        await addAsset(formData);
        toast.success('创建成功');
      }
      onSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存资产失败'));
    } finally {
      setLoading(false);
      onSubmittingChange?.(false);
    }
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="name">资产名称 <span className="text-red-500">*</span></Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            required
            className="h-11"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="assetCode">资产编码 <span className="text-red-500">*</span></Label>
          <Input
            id="assetCode"
            value={formData.assetCode}
            onChange={(e) => handleChange('assetCode', e.target.value)}
            required
            className="h-11"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="category">分类</Label>
          <Input
            id="category"
            value={formData.category}
            onChange={(e) => handleChange('category', e.target.value)}
            className="h-11"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="model">规格型号</Label>
          <Input
            id="model"
            value={formData.model}
            onChange={(e) => handleChange('model', e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="status">状态</Label>
          <Select
            value={formData.status}
            onValueChange={(val) => handleChange('status', val)}
          >
            <SelectTrigger className="h-11">
              <SelectValue />
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
            className="h-11"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="location">存放位置</Label>
          <Input
            id="location"
            value={formData.location || ''}
            onChange={(e) => handleChange('location', e.target.value)}
            className="h-11"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="purchaseDate">购入日期</Label>
          <DatePicker
            type="date"
            value={formData.purchaseDate || ''}
            onChange={(e) => handleChange('purchaseDate', e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="remark">备注</Label>
        <Textarea
          id="remark"
          value={formData.remark || ''}
          onChange={(e) => handleChange('remark', e.target.value)}
          rows={3}
        />
      </div>
    </form>
  );
};

export default AssetForm;
