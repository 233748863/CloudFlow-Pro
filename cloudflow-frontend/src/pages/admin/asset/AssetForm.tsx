import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addAsset, Asset } from '@/services/api/admin';

interface AssetFormProps {
  onSuccess: () => void;
}

const AssetForm: React.FC<AssetFormProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Asset>({
    name: '',
    assetCode: '',
    category: '',
    model: '',
    status: '1',
    price: 0
  });

  const handleChange = (field: keyof Asset, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await addAsset(formData);
      onSuccess();
    } catch (error) {
      console.error("Failed to add asset", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="name">资产名称</Label>
        <Input 
          id="name" 
          value={formData.name} 
          onChange={(e) => handleChange('name', e.target.value)} 
          required 
        />
      </div>
      
      <div className="grid gap-2">
        <Label htmlFor="assetCode">资产编码</Label>
        <Input 
          id="assetCode" 
          value={formData.assetCode} 
          onChange={(e) => handleChange('assetCode', e.target.value)} 
          required 
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="category">分类</Label>
          <Input 
            id="category" 
            value={formData.category} 
            onChange={(e) => handleChange('category', e.target.value)} 
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="model">规格型号</Label>
          <Input 
            id="model" 
            value={formData.model} 
            onChange={(e) => handleChange('model', e.target.value)} 
          />
        </div>
      </div>

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
        <Label htmlFor="price">价格</Label>
        <Input 
          id="price" 
          type="number"
          value={formData.price} 
          onChange={(e) => handleChange('price', Number(e.target.value))} 
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? '提交中...' : '确认新增'}
      </Button>
    </form>
  );
};

export default AssetForm;
