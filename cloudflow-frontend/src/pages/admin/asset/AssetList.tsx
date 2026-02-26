import React, { useState, useCallback } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui'
import {
  Plus, QrCode, Printer, Search, Edit, Trash2, UserCheck, RotateCcw,
  Wrench, Ban, History, Package, CheckCircle, AlertTriangle, XCircle,
  ChevronLeft, ChevronRight, BarChart3
} from 'lucide-react';
import {
  getAssetList, getAssetQrCodeUrl, deleteAsset, borrowAsset, returnAsset,
  repairAsset, scrapAsset, getAssetLogs, getAssetStatistics, getAssetCategories,
  Asset, AssetLog, AssetQueryParams, AssetStatistics
} from '@/services/api/admin';
import AssetForm from './AssetForm';
import { useMount } from '@/hooks/useMount';

// 状态映射
const STATUS_MAP: Record<string, { label: string; color: string; bgColor: string }> = {
  '1': { label: '闲置', color: 'text-green-700', bgColor: 'bg-green-50 border-green-200' },
  '2': { label: '在用', color: 'text-pink-600', bgColor: 'bg-pink-50 border-pink-100' },
  '3': { label: '维修', color: 'text-yellow-700', bgColor: 'bg-yellow-50 border-yellow-200' },
  '4': { label: '报废', color: 'text-red-700', bgColor: 'bg-red-50 border-red-200' },
};

const AssetList: React.FC = () => {
  // 资产列表数据
  const [assets, setAssets] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize] = useState(10);

  // 搜索筛选
  const [searchName, setSearchName] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  // 统计数据
  const [stats, setStats] = useState<AssetStatistics | null>(null);
  const [showStats, setShowStats] = useState(true);

  // 弹窗状态
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [assetLogs, setAssetLogs] = useState<AssetLog[]>([]);
  const [isRemarkOpen, setIsRemarkOpen] = useState(false);
  const [remarkAction, setRemarkAction] = useState<'repair' | 'scrap'>('repair');
  const [remarkText, setRemarkText] = useState('');
  const [remarkAssetId, setRemarkAssetId] = useState<number>(0);

  // 加载资产列表
  const loadData = useCallback(async (page?: number) => {
    try {
      const params: AssetQueryParams = {
        pageNum: page || pageNum,
        pageSize,
        name: searchName || undefined,
        assetCode: searchCode || undefined,
        category: filterCategory || undefined,
        status: filterStatus || undefined,
      };
      const res: any = await getAssetList(params);
      const data = res.data || res;
      // 兼容分页和非分页返回
      if (data.records) {
        setAssets(data.records);
        setTotal(data.total || 0);
      } else if (Array.isArray(data)) {
        setAssets(data);
        setTotal(data.length);
      }
    } catch (error) {
      console.error("加载资产列表失败", error);
    }
  }, [pageNum, pageSize, searchName, searchCode, filterCategory, filterStatus]);

  // 加载统计数据
  const loadStats = async () => {
    try {
      const res: any = await getAssetStatistics();
      setStats(res.data || res);
    } catch (error) {
      console.error("加载统计失败", error);
    }
  };

  // 加载分类列表
  const loadCategories = async () => {
    try {
      const res: any = await getAssetCategories();
      setCategories(res.data || res || []);
    } catch (error) {
      console.error("加载分类失败", error);
    }
  };

  useMount(() => {
    loadData();
    loadStats();
    loadCategories();
  });

  // 搜索
  const handleSearch = () => {
    setPageNum(1);
    loadData(1);
  };

  // 重置筛选
  const handleReset = () => {
    setSearchName('');
    setSearchCode('');
    setFilterCategory('');
    setFilterStatus('');
    setPageNum(1);
    // 延迟加载，等状态更新
    setTimeout(() => loadData(1), 0);
  };

  // 翻页
  const handlePageChange = (newPage: number) => {
    setPageNum(newPage);
    loadData(newPage);
  };

  // 新增/编辑成功回调
  const handleFormSuccess = () => {
    setIsFormOpen(false);
    setEditingAsset(null);
    loadData();
    loadStats();
    loadCategories();
  };

  // 打开编辑
  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setIsFormOpen(true);
  };

  // 打开新增
  const handleAdd = () => {
    setEditingAsset(null);
    setIsFormOpen(true);
  };

  // 删除资产
  const handleDelete = async (asset: Asset) => {
    if (!asset.assetId) return;
    if (!window.confirm(`确定要删除资产「${asset.name}」吗？`)) return;
    try {
      await deleteAsset(asset.assetId);
      loadData();
      loadStats();
    } catch (error) {
      console.error("删除失败", error);
    }
  };

  // 领用资产
  const handleBorrow = async (asset: Asset) => {
    if (!asset.assetId) return;
    // 简化处理：使用当前用户ID（实际应弹窗选择领用人）
    const userIdStr = window.prompt('请输入领用人ID：');
    if (!userIdStr) return;
    const userId = Number(userIdStr);
    if (isNaN(userId)) return;
    try {
      await borrowAsset(asset.assetId, userId);
      loadData();
      loadStats();
    } catch (error) {
      console.error("领用失败", error);
    }
  };

  // 归还资产
  const handleReturn = async (asset: Asset) => {
    if (!asset.assetId) return;
    if (!window.confirm(`确定归还资产「${asset.name}」吗？`)) return;
    try {
      await returnAsset(asset.assetId);
      loadData();
      loadStats();
    } catch (error) {
      console.error("归还失败", error);
    }
  };

  // 打开送修/报废备注弹窗
  const openRemarkDialog = (action: 'repair' | 'scrap', assetId: number) => {
    setRemarkAction(action);
    setRemarkAssetId(assetId);
    setRemarkText('');
    setIsRemarkOpen(true);
  };

  // 确认送修/报废
  const handleRemarkConfirm = async () => {
    try {
      if (remarkAction === 'repair') {
        await repairAsset(remarkAssetId, remarkText);
      } else {
        await scrapAsset(remarkAssetId, remarkText);
      }
      setIsRemarkOpen(false);
      loadData();
      loadStats();
    } catch (error) {
      console.error("操作失败", error);
    }
  };

  // 查看二维码
  const handleShowQr = (asset: Asset) => {
    setSelectedAsset(asset);
    setIsQrOpen(true);
  };

  // 打印标签
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow && selectedAsset && selectedAsset.assetId) {
      printWindow.document.write(`
        <html>
          <head><title>打印资产标签</title></head>
          <body style="text-align: center;">
            <h2>${selectedAsset.name}</h2>
            <img src="${getAssetQrCodeUrl(selectedAsset.assetId)}" width="200" />
            <p>${selectedAsset.assetCode || ''}</p>
            <script>window.onload = function() { window.print(); }<\/script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  // 查看变动日志
  const handleShowLogs = async (asset: Asset) => {
    if (!asset.assetId) return;
    setSelectedAsset(asset);
    try {
      const res: any = await getAssetLogs(asset.assetId);
      setAssetLogs(res.data || res || []);
    } catch (error) {
      console.error("加载日志失败", error);
      setAssetLogs([]);
    }
    setIsLogOpen(true);
  };

  // 计算总页数
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">固定资产管理</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowStats(!showStats)}>
            <BarChart3 className="w-4 h-4 mr-1" />
            {showStats ? '隐藏统计' : '显示统计'}
          </Button>
          <Button onClick={handleAdd}>
            <Plus className="w-4 h-4 mr-2" /> 新增资产
          </Button>
        </div>
      </div>

      {/* 统计看板 */}
      {showStats && stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="w-4 h-4" /> 资产总数
            </div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </div>
          <div className="rounded-lg border bg-green-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle className="w-4 h-4" /> 闲置
            </div>
            <p className="text-2xl font-bold mt-1 text-green-700">{stats.statusCount?.idle || 0}</p>
          </div>
          <div className="rounded-lg border bg-pink-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-pink-600">
              <UserCheck className="w-4 h-4" /> 在用
            </div>
            <p className="text-2xl font-bold mt-1 text-pink-600">{stats.statusCount?.inUse || 0}</p>
          </div>
          <div className="rounded-lg border bg-yellow-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-yellow-700">
              <AlertTriangle className="w-4 h-4" /> 维修
            </div>
            <p className="text-2xl font-bold mt-1 text-yellow-700">{stats.statusCount?.repair || 0}</p>
          </div>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              总价值（元）
            </div>
            <p className="text-2xl font-bold mt-1">¥{Number(stats.totalValue || 0).toLocaleString()}</p>
          </div>
        </div>
      )}

      {/* 搜索筛选栏 */}
      <div className="flex flex-wrap gap-3 items-end p-4 rounded-lg border bg-card">
        <div className="grid gap-1.5">
          <Label className="text-xs">资产名称</Label>
          <Input
            placeholder="搜索名称..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="w-40 h-9"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">资产编码</Label>
          <Input
            placeholder="搜索编码..."
            value={searchCode}
            onChange={(e) => setSearchCode(e.target.value)}
            className="w-40 h-9"
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">分类</Label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder="全部分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部分类</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">状态</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-28 h-9">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部</SelectItem>
              <SelectItem value="1">闲置</SelectItem>
              <SelectItem value="2">在用</SelectItem>
              <SelectItem value="3">维修</SelectItem>
              <SelectItem value="4">报废</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={handleSearch} className="h-9">
          <Search className="w-4 h-4 mr-1" /> 搜索
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset} className="h-9">
          重置
        </Button>
      </div>

      {/* 资产表格 */}
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">资产编码</TableHead>
              <TableHead>名称</TableHead>
              <TableHead className="w-[100px]">分类</TableHead>
              <TableHead className="w-[80px]">规格型号</TableHead>
              <TableHead className="w-[80px]">状态</TableHead>
              <TableHead className="w-[100px]">价格</TableHead>
              <TableHead className="w-[100px]">存放位置</TableHead>
              <TableHead className="w-[280px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  暂无资产数据
                </TableCell>
              </TableRow>
            ) : (
              assets.map((asset) => (
                <TableRow key={asset.assetId}>
                  <TableCell className="font-mono text-xs">{asset.assetCode}</TableCell>
                  <TableCell className="font-medium">{asset.name}</TableCell>
                  <TableCell>{asset.category || '-'}</TableCell>
                  <TableCell className="text-xs">{asset.model || '-'}</TableCell>
                  <TableCell>
                    {asset.status && STATUS_MAP[asset.status] && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_MAP[asset.status].bgColor} ${STATUS_MAP[asset.status].color}`}>
                        {STATUS_MAP[asset.status].label}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>¥{Number(asset.price || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{asset.location || '-'}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {/* 编辑 */}
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(asset)} title="编辑">
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      {/* 二维码 */}
                      <Button variant="ghost" size="sm" onClick={() => handleShowQr(asset)} title="二维码">
                        <QrCode className="w-3.5 h-3.5" />
                      </Button>
                      {/* 日志 */}
                      <Button variant="ghost" size="sm" onClick={() => handleShowLogs(asset)} title="变动记录">
                        <History className="w-3.5 h-3.5" />
                      </Button>
                      {/* 领用（仅闲置可用） */}
                      {asset.status === '1' && (
                        <Button variant="ghost" size="sm" onClick={() => handleBorrow(asset)} title="领用" className="text-pink-500 hover:text-pink-600">
                          <UserCheck className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {/* 归还（仅在用可用） */}
                      {asset.status === '2' && (
                        <Button variant="ghost" size="sm" onClick={() => handleReturn(asset)} title="归还" className="text-green-600 hover:text-green-700">
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {/* 送修（非报废可用） */}
                      {asset.status !== '4' && asset.status !== '3' && (
                        <Button variant="ghost" size="sm" onClick={() => asset.assetId && openRemarkDialog('repair', asset.assetId)} title="送修" className="text-yellow-600 hover:text-yellow-700">
                          <Wrench className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {/* 报废（非报废可用） */}
                      {asset.status !== '4' && (
                        <Button variant="ghost" size="sm" onClick={() => asset.assetId && openRemarkDialog('scrap', asset.assetId)} title="报废" className="text-red-600 hover:text-red-700">
                          <Ban className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {/* 删除（非在用可用） */}
                      {asset.status !== '2' && (
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(asset)} title="删除" className="text-red-500 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            共 {total} 条，第 {pageNum}/{totalPages} 页
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={pageNum <= 1}
              onClick={() => handlePageChange(pageNum - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {/* 页码按钮 */}
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) {
                p = i + 1;
              } else if (pageNum <= 3) {
                p = i + 1;
              } else if (pageNum >= totalPages - 2) {
                p = totalPages - 4 + i;
              } else {
                p = pageNum - 2 + i;
              }
              return (
                <Button
                  key={p}
                  variant={p === pageNum ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handlePageChange(p)}
                  className="w-9"
                >
                  {p}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              disabled={pageNum >= totalPages}
              onClick={() => handlePageChange(pageNum + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { setIsFormOpen(open); if (!open) setEditingAsset(null); }}>
        <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAsset ? '编辑资产' : '新增资产'}</DialogTitle>
          </DialogHeader>
          <AssetForm initialData={editingAsset} onSuccess={handleFormSuccess} />
        </DialogContent>
      </Dialog>

      {/* 二维码弹窗 */}
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
                  alt="资产二维码"
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

      {/* 变动日志弹窗 */}
      <Dialog open={isLogOpen} onOpenChange={setIsLogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              资产变动记录 - {selectedAsset?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {assetLogs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">暂无变动记录</p>
            ) : (
              assetLogs.map((log, index) => (
                <div key={log.logId || index} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <History className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{log.type}</span>
                      <span className="text-xs text-muted-foreground">
                        {log.createTime ? new Date(log.createTime).toLocaleString('zh-CN') : ''}
                      </span>
                    </div>
                    {log.remark && (
                      <p className="text-sm text-muted-foreground mt-1">{log.remark}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 送修/报废备注弹窗 */}
      <Dialog open={isRemarkOpen} onOpenChange={setIsRemarkOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{remarkAction === 'repair' ? '资产送修' : '资产报废'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>备注说明（可选）</Label>
              <textarea
                value={remarkText}
                onChange={(e) => setRemarkText(e.target.value)}
                placeholder={remarkAction === 'repair' ? '请输入送修原因...' : '请输入报废原因...'}
                rows={3}
                className="flex min-h-[60px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-pink-400"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setIsRemarkOpen(false)}>取消</Button>
              <Button
                onClick={handleRemarkConfirm}
                variant={remarkAction === 'scrap' ? 'destructive' : 'default'}
              >
                {remarkAction === 'repair' ? '确认送修' : '确认报废'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AssetList;
