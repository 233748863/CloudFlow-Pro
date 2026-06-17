import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, Coins } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  Input,
  Label,
  TableHead,
  TableHeader,
  Textarea,
} from '@/components/common';
import { TablePageLayout, TableSurfaceCard } from '@/components/layout/TablePageLayout';
import { FilterBar } from '@/components/layout';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  getMyPointAccount,
  listMallItems,
  placeMallOrder,
  type HrMallItem,
  type HrPointAccount,
} from '@/services/api/hr';
import { normalizeRows } from '../hrShared';

interface CartItem {
  item: HrMallItem;
  quantity: number;
}

export const HrMallPage: React.FC = () => {
  const [items, setItems] = useState<HrMallItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [detail, setDetail] = useState<HrMallItem | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [account, setAccount] = useState<HrPointAccount | null>(null);
  const [placing, setPlacing] = useState(false);
  const [shipping, setShipping] = useState({
    receiverName: '',
    receiverPhone: '',
    receiverAddress: '',
    remark: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [itemRes, accRes] = await Promise.all([
        listMallItems({ status: 'ON_SHELF' }),
        getMyPointAccount().catch(() => null),
      ]);
      setItems(normalizeRows<HrMallItem>(itemRes));
      setAccount(accRes);
    } catch (error) {
      toast.error(getErrorMessage(error, '商城加载失败'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => { if (it.category) set.add(it.category); });
    return ['all', ...Array.from(set)];
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (category !== 'all' && it.category !== category) return false;
      if (keyword.trim() && !it.itemName.includes(keyword.trim())) return false;
      return true;
    });
  }, [items, category, keyword]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, c) => sum + (c.item.pointPrice ?? 0) * c.quantity, 0),
    [cart],
  );

  const addToCart = (item: HrMallItem) => {
    setCart((prev) => {
      const exist = prev.find((c) => c.item.id === item.id);
      if (exist) {
        if (exist.quantity + 1 > item.stock) {
          toast.error(`库存仅剩 ${item.stock}`);
          return prev;
        }
        return prev.map((c) => (c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      if (item.stock <= 0) {
        toast.error('商品已售罄');
        return prev;
      }
      return [...prev, { item, quantity: 1 }];
    });
    toast.success(`已加入购物车:${item.itemName}`);
  };

  const updateQty = (id: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.item.id !== id) return c;
          const next = c.quantity + delta;
          if (next > c.item.stock) {
            toast.error(`库存仅剩 ${c.item.stock}`);
            return c;
          }
          return { ...c, quantity: next };
        })
        .filter((c) => c.quantity > 0),
    );
  };

  const removeFromCart = (id: number) => {
    setCart((prev) => prev.filter((c) => c.item.id !== id));
  };

  const placeOrder = async () => {
    if (cart.length === 0) {
      toast.error('购物车为空');
      return;
    }
    if ((account?.availablePoints ?? 0) < cartTotal) {
      toast.error(`积分不足,需 ${cartTotal} 分,当前可用 ${account?.availablePoints ?? 0} 分`);
      return;
    }
    setPlacing(true);
    try {
      await placeMallOrder({
        receiverName: shipping.receiverName,
        receiverPhone: shipping.receiverPhone,
        receiverAddress: shipping.receiverAddress,
        remark: shipping.remark,
        items: cart.map((c) => ({
          itemId: c.item.id,
          itemName: c.item.itemName,
          pointPrice: c.item.pointPrice,
          quantity: c.quantity,
        })),
      });
      toast.success(cartTotal >= 5000 ? '订单已提交审批' : '订单已创建');
      setCart([]);
      setCartOpen(false);
      void load();
    } catch (error) {
      toast.error(getErrorMessage(error, '下单失败'));
    } finally {
      setPlacing(false);
    }
  };

  const filters = (
    <FilterBar
      search={{
        value: keyword,
        onChange: setKeyword,
        placeholder: '搜索商品',
        widthClassName: 'w-full sm:w-[220px]',
      }}
      filters={[
        <div key="category" className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1 text-xs ${
                category === c
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              {c === 'all' ? '全部' : c}
            </button>
          ))}
        </div>,
      ]}
      stats={[{ label: '', value: `共 ${filtered.length} 件` }]}
      actions={[
        <div key="balance" className="rounded-md bg-amber-50 px-3 py-1.5 text-sm dark:bg-amber-950/40">
          <Coins className="mr-1 inline h-4 w-4 text-amber-600" />
          可用 <span className="font-semibold">{Number(account?.availablePoints ?? 0).toLocaleString()}</span> 分
        </div>,
        <Button key="cart" size="sm" onClick={() => setCartOpen(true)}>
          <ShoppingCart className="mr-2 h-4 w-4" />
          购物车 ({cart.length})
        </Button>,
      ]}
    />
  );

  const grid = (
    loading ? (
      <TableSurfaceCard>
        <div className="py-10 text-center text-sm text-slate-400">加载中…</div>
      </TableSurfaceCard>
    ) : filtered.length === 0 ? (
      <TableSurfaceCard>
        <div className="py-10 text-center text-sm text-slate-400">暂无商品</div>
      </TableSurfaceCard>
    ) : (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {filtered.map((it) => (
          <div
            key={it.id}
            className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/60"
          >
            <button
              type="button"
              onClick={() => setDetail(it)}
              className="aspect-square w-full overflow-hidden bg-slate-100 text-left dark:bg-slate-800"
            >
              {it.coverImage ? (
                <img src={it.coverImage} alt={it.itemName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">无图</div>
              )}
            </button>
            <div className="flex flex-1 flex-col justify-between p-3">
              <div>
                <div className="line-clamp-2 text-sm font-medium">{it.itemName}</div>
                <div className="mt-1 text-xs text-slate-400">{it.category ?? '-'}</div>
              </div>
              <div className="mt-2 flex items-end justify-between">
                <div>
                  <div className="text-lg font-semibold text-amber-600">{it.pointPrice} <span className="text-xs font-normal">分</span></div>
                  <div className="text-xs text-slate-400">库存 {it.stock}</div>
                </div>
                <Button size="sm" onClick={() => addToCart(it)} disabled={it.stock <= 0}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  );

  return (
    <div className="space-y-4">
      <TablePageLayout filters={filters} table={grid} />

      {/* 商品详情 Drawer */}
      {detail && (
        <BaseDialog
          open={Boolean(detail)}
          title={detail.itemName}
          width="wide"
          onClose={() => setDetail(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDetail(null)}>关闭</Button>
              <Button onClick={() => { addToCart(detail); setDetail(null); }} disabled={detail.stock <= 0}>
                <ShoppingCart className="mr-2 h-4 w-4" />加入购物车
              </Button>
            </div>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="aspect-square overflow-hidden rounded-md bg-slate-100">
              {detail.coverImage ? (
                <img src={detail.coverImage} alt={detail.itemName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">无图</div>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <div className="text-xs text-slate-500">编号 {detail.itemNo}</div>
              <div className="text-2xl font-semibold text-amber-600">{detail.pointPrice} 分</div>
              <div className="text-xs text-slate-500">分类:{detail.category ?? '-'}</div>
              <div className="text-xs text-slate-500">库存:{detail.stock}</div>
              <div className="text-xs text-slate-500">已售:{detail.salesCount ?? 0}</div>
              {Number(detail.approvalThreshold ?? 0) > 0 && (
                <div className="text-xs text-amber-700">
                  ⚠ 单笔订单 ≥ {detail.approvalThreshold} 分触发审批
                </div>
              )}
              {detail.detailHtml && (
                <div
                  className="prose prose-sm mt-3 max-w-none text-sm text-slate-600"
                  dangerouslySetInnerHTML={{ __html: detail.detailHtml }}
                />
              )}
            </div>
          </div>
        </BaseDialog>
      )}

      {/* 购物车 Drawer */}
      <BaseDialog
        open={cartOpen}
        title="购物车 / 提交订单"
        width="wide"
        onClose={() => setCartOpen(false)}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <div className="text-sm">
              合计 <span className="text-lg font-semibold text-amber-600">{cartTotal.toLocaleString()}</span> 分
              {cartTotal >= 5000 && <span className="ml-2 text-xs text-amber-700">(超过 5000 将走审批)</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCartOpen(false)}>继续选购</Button>
              <Button onClick={() => void placeOrder()} disabled={placing || cart.length === 0}>
                {placing ? '提交中…' : '提交订单'}
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <TableHeader>
                <tr>
                  <TableHead>商品</TableHead>
                  <TableHead>单价</TableHead>
                  <TableHead>数量</TableHead>
                  <TableHead>小计</TableHead>
                  <TableHead></TableHead>
                </tr>
              </TableHeader>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-sm text-slate-400">购物车为空</td>
                  </tr>
                ) : (
                  cart.map((c) => (
                    <tr key={c.item.id}>
                      <td className="px-4 py-2 text-sm font-medium">{c.item.itemName}</td>
                      <td className="px-4 py-2 text-sm">{c.item.pointPrice} 分</td>
                      <td className="px-4 py-2 text-sm">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" onClick={() => updateQty(c.item.id, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center">{c.quantity}</span>
                          <Button size="sm" variant="outline" onClick={() => updateQty(c.item.id, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-sm font-semibold">{((c.item.pointPrice ?? 0) * c.quantity).toLocaleString()}</td>
                      <td className="px-4 py-2 text-sm">
                        <Button size="sm" variant="outline" onClick={() => removeFromCart(c.item.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
            <div>
              <Label>收货人</Label>
              <Input value={shipping.receiverName} onChange={(e) => setShipping({ ...shipping, receiverName: e.target.value })} />
            </div>
            <div>
              <Label>联系电话</Label>
              <Input value={shipping.receiverPhone} onChange={(e) => setShipping({ ...shipping, receiverPhone: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>收货地址</Label>
              <Textarea rows={2} value={shipping.receiverAddress} onChange={(e) => setShipping({ ...shipping, receiverAddress: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>订单备注</Label>
              <Input value={shipping.remark} onChange={(e) => setShipping({ ...shipping, remark: e.target.value })} />
            </div>
          </div>
        </div>
      </BaseDialog>
    </div>
  );
};

export default HrMallPage;
