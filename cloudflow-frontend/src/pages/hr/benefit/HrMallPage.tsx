import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, Minus, PackageCheck, Plus, RefreshCcw, Search, ShoppingBag, ShoppingCart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  Input,
  Label,
  Textarea,
} from '@/components/common';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  getMyPointAccount,
  listMallItems,
  placeMallOrder,
  type HrMallItem,
  type HrPointAccount,
} from '@/services/api/hr';
import { normalizeRows } from '../hrShared';
import { TablePageLayout, InnerTableSurface } from '@/components/layout/TablePageLayout';
import './HrMallPage.css';

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

  const pageActions = (
    <>
      <header className="admin-source-header">
          <div>
            <p className="admin-source-kicker">POINT MALL</p>
            <h2>积分商城</h2>
            <span>按分类筛选在架商品、查看库存价格，并通过购物车提交兑换订单。</span>
          </div>
          <div className="admin-source-controls">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCcw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />刷新
            </Button>
            <Button size="sm" onClick={() => setCartOpen(true)}>
              <ShoppingCart className="h-4 w-4" />购物车 ({cart.length})
            </Button>
          </div>
        </header>

        <section className="card admin-mall-status-strip">
          <article className="admin-mall-status-cell tone-blue">
            <span className="admin-mall-status-icon"><ShoppingBag size={18} /></span>
            <div><p>在架商品</p><strong>{items.length}</strong><span>当前可兑换商品</span></div>
          </article>
          <article className="admin-mall-status-cell tone-green">
            <span className="admin-mall-status-icon"><PackageCheck size={18} /></span>
            <div><p>筛选结果</p><strong>{filtered.length}</strong><span>{category === 'all' ? '全部分类' : category}</span></div>
          </article>
          <article className="admin-mall-status-cell tone-amber">
            <span className="admin-mall-status-icon"><Coins size={18} /></span>
            <div><p>可用积分</p><strong>{Number(account?.availablePoints ?? 0).toLocaleString()}</strong><span>本人账户余额</span></div>
          </article>
          <article className="admin-mall-status-cell tone-violet">
            <span className="admin-mall-status-icon"><ShoppingCart size={18} /></span>
            <div><p>购物车</p><strong>{cart.length}</strong><span>{cartTotal.toLocaleString()} 分</span></div>
          </article>
        </section>
    </>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
          <form
            className="admin-users-filter-grid"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <label>
              <span>商品名称</span>
              <div className="admin-source-search-field">
                <Search size={16} />
                <Input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  className="cf-control"
                  placeholder="搜索商品"
                />
              </div>
            </label>
            <label>
              <span>分类</span>
              <div className="flex min-h-[42px] flex-wrap items-center gap-2">
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={`min-h-[42px] rounded-md border px-3 py-2 text-xs font-medium transition ${
 category === c
 ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40'
 : 'border-slate-200 text-cf-muted hover:bg-[var(--cf-surface-muted)] dark:border-slate-700 '
 }`}
                  >
                    {c === 'all' ? '全部' : c}
                  </button>
                ))}
              </div>
            </label>
            <div className="admin-users-toolbar-actions">
              <Button type="button" variant="outline" size="sm" onClick={() => { setKeyword(''); setCategory('all'); }}>
                清空条件
              </Button>
              <span className="admin-users-filter-count">共 {filtered.length} 件</span>
            </div>
          </form>
        </section>
  );

  const pageTable = (
        <div className="admin-mall-workbench-grid">
          <InnerTableSurface className="admin-mall-table-surface flex min-h-0 flex-1 flex-col">
            {loading ? (
              <div className="py-10 text-center text-sm text-cf-faint">加载中...</div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-cf-faint">暂无商品</div>
            ) : (
              <table className="unity-data-table admin-source-table admin-mall-table min-w-[740px]">
                <thead>
                  <tr>
                    <th>商品</th>
                    <th>分类</th>
                    <th>积分</th>
                    <th>库存</th>
                    <th>已兑</th>
                    <th className="w-36 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <button type="button" className="admin-mall-product-cell" onClick={() => setDetail(it)}>
                          <span className="admin-mall-product-thumb">
                            {it.coverImage ? (
                              <img src={it.coverImage} alt={it.itemName} />
                            ) : (
                              <ShoppingBag size={16} />
                            )}
                          </span>
                          <span className="min-w-0">
                            <strong>{it.itemName}</strong>
                            <small>编号 {it.itemNo ?? it.id}</small>
                          </span>
                        </button>
                      </td>
                      <td>{it.category ?? '-'}</td>
                      <td><span className="admin-mall-price">{Number(it.pointPrice ?? 0).toLocaleString()} 分</span></td>
                      <td>{Number(it.stock ?? 0).toLocaleString()}</td>
                      <td>{Number(it.salesCount ?? 0).toLocaleString()}</td>
                      <td>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => setDetail(it)}>详情</Button>
                          <Button size="sm" onClick={() => addToCart(it)} disabled={it.stock <= 0}>
                            <Plus className="h-3 w-3" />加入
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </InnerTableSurface>

          <section className="table-scroll-container admin-inner-table-surface admin-mall-cart-panel">
            <div className="admin-source-section-head border-b border-slate-200 px-4 py-3 dark:border-slate-800">
              <div>
                <strong>购物车</strong>
                <span>{cart.length} 件商品 / {cartTotal.toLocaleString()} 分</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setCartOpen(true)}>编辑</Button>
            </div>
            <div className="admin-mall-cart-body">
              <div className="admin-mall-account-row">
                <span>可用积分</span>
                <strong>{Number(account?.availablePoints ?? 0).toLocaleString()}</strong>
              </div>
              {cart.length ? (
                <div className="admin-mall-cart-list">
                  {cart.slice(0, 5).map((c) => (
                    <div key={c.item.id} className="admin-mall-cart-row">
                      <div className="min-w-0">
                        <strong>{c.item.itemName}</strong>
                        <span>{Number(c.item.pointPrice ?? 0).toLocaleString()} 分 x {c.quantity}</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => removeFromCart(c.item.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="admin-mall-cart-empty">暂无已选商品</div>
              )}
              <Button className="w-full" onClick={() => setCartOpen(true)} disabled={cart.length === 0}>
                <ShoppingCart className="h-4 w-4" />提交兑换
              </Button>
            </div>
          </section>
        </div>
  );

  return (
    <>
      <section className="admin-source-page">
        <TablePageLayout
          actions={pageActions}
          filters={pageFilters}
          table={pageTable}
        />
      </section>

      {/* 商品详情 Drawer */}
      {detail && (
        <BaseDialog
          open={Boolean(detail)}
          title={detail.itemName}
          width="wide"
          onClose={() => setDetail(null)}
          bodyClassName="admin-dialog-stack"
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
            <div className="aspect-square overflow-hidden rounded-md bg-[var(--cf-surface-muted)]">
              {detail.coverImage ? (
                <img src={detail.coverImage} alt={detail.itemName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-cf-faint">无图</div>
              )}
            </div>
            <div className="grid gap-2 text-sm">
              <div className="text-xs text-cf-subtle">编号 {detail.itemNo}</div>
              <div className="text-xl font-semibold text-amber-600">{detail.pointPrice} 分</div>
              <div className="text-xs text-cf-subtle">分类:{detail.category ?? '-'}</div>
              <div className="text-xs text-cf-subtle">库存:{detail.stock}</div>
              <div className="text-xs text-cf-subtle">已售:{detail.salesCount ?? 0}</div>
              {Number(detail.approvalThreshold ?? 0) > 0 && (
                <div className="text-xs text-amber-700">
                  ⚠ 单笔订单 ≥ {detail.approvalThreshold} 分触发审批
                </div>
              )}
              {detail.detailHtml && (
                <div
                  className="prose prose-sm mt-3 max-w-none text-sm text-cf-muted dark:prose-invert"
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
        bodyClassName="admin-dialog-stack"
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
          <div className="admin-horizontal-scroll">
            <table className="unity-data-table admin-source-table min-w-[480px]">
              <thead>
                <tr>
                  <th>商品</th>
                  <th>单价</th>
                  <th>数量</th>
                  <th>小计</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-sm text-cf-faint">购物车为空</td>
                  </tr>
                ) : (
                  cart.map((c) => (
                    <tr key={c.item.id}>
                      <td className="text-sm font-medium">{c.item.itemName}</td>
                      <td className="text-sm">{c.item.pointPrice} 分</td>
                      <td className="text-sm">
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
                      <td className="text-sm font-semibold">{((c.item.pointPrice ?? 0) * c.quantity).toLocaleString()}</td>
                      <td className="text-sm">
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

          <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="admin-dialog-field">
              <Label>收货人</Label>
              <Input value={shipping.receiverName} onChange={(e) => setShipping({ ...shipping, receiverName: e.target.value })} />
            </div>
            <div className="admin-dialog-field">
              <Label>联系电话</Label>
              <Input value={shipping.receiverPhone} onChange={(e) => setShipping({ ...shipping, receiverPhone: e.target.value })} />
            </div>
            <div className="admin-dialog-field col-span-2">
              <Label>收货地址</Label>
              <Textarea rows={2} value={shipping.receiverAddress} onChange={(e) => setShipping({ ...shipping, receiverAddress: e.target.value })} />
            </div>
            <div className="admin-dialog-field col-span-2">
              <Label>订单备注</Label>
              <Input value={shipping.remark} onChange={(e) => setShipping({ ...shipping, remark: e.target.value })} />
            </div>
          </div>
      </BaseDialog>
    </>
  );
};

export default HrMallPage;
