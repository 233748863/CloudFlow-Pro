import React, { useState, useEffect } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui'
import { Plus, QrCode, Printer } from 'lucide-react';
import { getAssetList, getAssetQrCodeUrl, Asset } from '@/services/api/admin';
import AssetForm from './AssetForm';
import { useMount } from '@/hooks/useMount';

const AssetList: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);

  const loadData = async () => {
    try {
      const res = await getAssetList();
      // @ts-ignore: Axios response structure might need adjustment based on request.ts
      setAssets(res.data || res); 
    } catch (error) {
      console.error("Failed to load assets", error);
    }
  };

  useMount(() => {
    loadData();
  });

  const handleAddSuccess = () => {
    setIsFormOpen(false);
    loadData();
  };

  const handleShowQr = (asset: Asset) => {
    setSelectedAsset(asset);
    setIsQrOpen(true);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow && selectedAsset && selectedAsset.assetId) {
      printWindow.document.write(`
        <html>
          <head><title>Print Asset Label</title></head>
          <body style="text-align: center;">
            <h2>${selectedAsset.name}</h2>
            <img src="${getAssetQrCodeUrl(selectedAsset.assetId)}" width="200" />
            <p>${selectedAsset.assetCode || ''}</p>
            <script>
              window.onload = function() { window.print(); }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">固定资产管理</h1>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> 新增资产</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增资产</DialogTitle>
            </DialogHeader>
            <AssetForm onSuccess={handleAddSuccess} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>资产编码</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>价格</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((asset) => (
              <TableRow key={asset.assetId}>
                <TableCell>{asset.assetCode}</TableCell>
                <TableCell>{asset.name}</TableCell>
                <TableCell>{asset.category}</TableCell>
                <TableCell>
                  {asset.status === '1' && <span className="text-green-600">闲置</span>}
                  {asset.status === '2' && <span className="text-blue-600">在用</span>}
                  {asset.status === '3' && <span className="text-yellow-600">维修</span>}
                  {asset.status === '4' && <span className="text-red-600">报废</span>}
                </TableCell>
                <TableCell>{asset.price}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => handleShowQr(asset)}>
                    <QrCode className="w-4 h-4 mr-1" /> 二维码
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isQrOpen} onOpenChange={setIsQrOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>资产标签</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-4">
            {selectedAsset && selectedAsset.assetId && (
              <>
                <h3 className="text-lg font-bold mb-2">{selectedAsset.name}</h3>
                <img 
                  src={getAssetQrCodeUrl(selectedAsset.assetId)} 
                  alt="Asset QR Code" 
                  className="w-48 h-48 border"
                />
                <p className="mt-2 text-sm text-gray-500">{selectedAsset.assetCode}</p>
                <Button className="mt-4 w-full" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-2" /> 打印标签
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AssetList;
