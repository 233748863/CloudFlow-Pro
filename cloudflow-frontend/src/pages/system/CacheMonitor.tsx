import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Database,
  Eye,
  Folder,
  FolderOpen,
  Key,
  Loader2,
  RefreshCw,
  Search,
  Server,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getCacheInfo,
  getCacheKeys,
  getCacheKeyValue,
  deleteCacheKey,
  deleteCacheByPrefix,
  CacheKeyDetail,
} from '../../services/api/system';
import { Button, Card, Input, TableHead, TableHeader } from '@/components/ui';
import {
  WorkspaceBackdrop,
  WorkspacePageContent,
  WorkspaceInlineState,
  WorkspaceTableStateRow,
} from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceHeroCard,
  WorkspaceMetricCard,
  WorkspaceResultCard,
  WorkspaceSectionCard,
  WorkspaceWorkbenchCard,
  workspaceGlassSurfaceClassName,
} from '@/components/workspace/WorkspacePanels';

interface TreeNode {
  name: string;
  fullKey?: string;
  children: TreeNode[];
  count: number;
}

const buildKeyTree = (keys: string[]): TreeNode[] => {
  const root: TreeNode = { name: 'root', children: [], count: 0 };

  // 将扁平 Redis Key 转成按冒号分层的树结构，便于左侧浏览器逐层展开。
  for (const key of keys) {
    const parts = key.split(':');
    let current = root;

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      let child = current.children.find((item) => item.name === part);
      if (!child) {
        child = {
          name: part,
          children: [],
          count: 0,
          fullKey: i === parts.length - 1 ? key : undefined,
        };
        current.children.push(child);
      }
      child.count += 1;
      current = child;
    }
  }

  const sortTree = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((node) => sortTree(node.children));
  };

  sortTree(root.children);
  return root.children;
};

const formatTTL = (ttl: number): string => {
  if (ttl === -1) return '永不过期';
  if (ttl === -2) return 'Key 不存在';
  if (ttl < 60) return `${ttl} 秒`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)} 分 ${ttl % 60} 秒`;
  if (ttl < 86400) return `${Math.floor(ttl / 3600)} 小时 ${Math.floor((ttl % 3600) / 60)} 分`;
  return `${Math.floor(ttl / 86400)} 天 ${Math.floor((ttl % 86400) / 3600)} 小时`;
};

const formatValue = (value: any): string => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
};

const formatDateCN = (date: Date) => {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdays[date.getDay()]}`;
};

const KeyTreeNode: React.FC<{
  node: TreeNode;
  depth: number;
  onSelectKey: (key: string) => void;
  onDeletePrefix: (prefix: string) => void;
  selectedKey: string | null;
}> = ({ node, depth, onSelectKey, onDeletePrefix, selectedKey }) => {
  const [expanded, setExpanded] = useState(false);
  const isLeaf = node.children.length === 0 && Boolean(node.fullKey);
  const isSelected = isLeaf && node.fullKey === selectedKey;

  const findFirstLeaf = (current: TreeNode): string | null => {
    if (current.fullKey) return current.fullKey;
    for (const child of current.children) {
      const result = findFirstLeaf(child);
      if (result) return result;
    }
    return null;
  };

  const getPrefix = () => {
    if (node.fullKey) return node.fullKey;
    const firstLeaf = findFirstLeaf(node);
    if (!firstLeaf) return node.name;
    return firstLeaf.split(':').slice(0, depth + 1).join(':');
  };

  return (
    <div>
      <div
        className={`group flex cursor-pointer items-center gap-2 rounded-[16px] px-2 py-1.5 text-sm transition ${
          isSelected ? 'border border-cyan-200 bg-cyan-50 text-cyan-700' : 'text-slate-700 hover:bg-white hover:text-cyan-700'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (isLeaf && node.fullKey) {
            onSelectKey(node.fullKey);
          } else {
            setExpanded((prev) => !prev);
          }
        }}
      >
        {!isLeaf ? (
          expanded ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />
        ) : (
          <Key size={14} className="shrink-0 text-pink-400" />
        )}

        {!isLeaf ? (
          expanded ? <FolderOpen size={14} className="shrink-0 text-amber-500" /> : <Folder size={14} className="shrink-0 text-amber-400" />
        ) : null}

        <span className="flex-1 truncate font-mono text-xs">{node.name}</span>

        {!isLeaf ? (
          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">
            {node.count}
          </span>
        ) : null}

        {!isLeaf ? (
          <button
            type="button"
            className="shrink-0 opacity-0 transition group-hover:opacity-100"
            title={`删除 ${getPrefix()}:* 下所有 Key`}
            onClick={(event) => {
              event.stopPropagation();
              onDeletePrefix(getPrefix());
            }}
          >
            <Trash2 size={13} className="text-rose-500" />
          </button>
        ) : null}
      </div>

      {expanded ? node.children.map((child, idx) => (
        <KeyTreeNode
          key={`${child.name}-${idx}`}
          node={child}
          depth={depth + 1}
          onSelectKey={onSelectKey}
          onDeletePrefix={onDeletePrefix}
          selectedKey={selectedKey}
        />
      )) : null}
    </div>
  );
};

export const CacheMonitor = () => {
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<Record<string, string>>({});
  const [dbSize, setDbSize] = useState(0);
  const [commandStats, setCommandStats] = useState<{ name: string; value: number }[]>([]);
  const [keyGroups, setKeyGroups] = useState<{ prefix: string; count: number }[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'browser'>('overview');
  const [keyTree, setKeyTree] = useState<TreeNode[]>([]);
  const [keySearch, setKeySearch] = useState('');
  const [keysLoading, setKeysLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keyDetail, setKeyDetail] = useState<CacheKeyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchCacheInfo = async () => {
    setLoading(true);
    try {
      const response: any = await getCacheInfo();
      if (response) {
        setInfo(response.info || {});
        setDbSize(response.dbSize || 0);
        setCommandStats(response.commandStats || []);
        setKeyGroups(response.keyGroups || []);
      }
    } catch (error) {
      console.error(error);
      toast.error('获取缓存信息失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchKeys = useCallback(async (pattern?: string) => {
    setKeysLoading(true);
    try {
      const keys: any = await getCacheKeys(pattern || '*');
      const keyList = Array.isArray(keys) ? keys : [];
      setKeyTree(buildKeyTree(keyList));
    } catch (error) {
      console.error(error);
      toast.error('获取 Key 列表失败');
    } finally {
      setKeysLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCacheInfo();
  }, []);

  useEffect(() => {
    if (activeTab === 'browser' && keyTree.length === 0) {
      void fetchKeys();
    }
  }, [activeTab, keyTree.length, fetchKeys]);

  const handleSearch = () => {
    const pattern = keySearch.trim() ? `*${keySearch.trim()}*` : '*';
    void fetchKeys(pattern);
  };

  const handleSelectKey = async (key: string) => {
    setSelectedKey(key);
    setDetailLoading(true);
    try {
      const detail: any = await getCacheKeyValue(key);
      setKeyDetail(detail);
    } catch (error) {
      console.error(error);
      toast.error('获取 Key 详情失败');
      setKeyDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDeleteKey = async (key: string) => {
    if (!window.confirm(`确认删除 Key: ${key} ?`)) return;
    try {
      await deleteCacheKey(key);
      toast.success('删除成功');
      if (selectedKey === key) {
        setSelectedKey(null);
        setKeyDetail(null);
      }
      void fetchKeys(keySearch.trim() ? `*${keySearch.trim()}*` : '*');
      void fetchCacheInfo();
    } catch (error) {
      console.error(error);
      toast.error('删除失败');
    }
  };

  const handleDeletePrefix = async (prefix: string) => {
    if (!window.confirm(`确认删除前缀 "${prefix}:*" 下的所有 Key 吗？此操作不可撤销。`)) return;
    try {
      const count: any = await deleteCacheByPrefix(`${prefix}:`);
      toast.success(`已删除 ${count || 0} 个 Key`);
      setSelectedKey(null);
      setKeyDetail(null);
      void fetchKeys(keySearch.trim() ? `*${keySearch.trim()}*` : '*');
      void fetchCacheInfo();
    } catch (error) {
      console.error(error);
      toast.error('批量删除失败');
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => toast.success('已复制'));
  };

  const redisVersion = info.redis_version || '-';
  const usedMemoryHuman = info.used_memory_human || '-';
  const connectedClients = info.connected_clients || '0';
  const uptimeInDays = info.uptime_in_days || '0';
  const totalCommandsProcessed = info.total_commands_processed || '0';
  const usedMemoryPeak = info.used_memory_peak_human || '-';
  const maxmemory = info.maxmemory_human || info.maxmemory || '-';
  const role = info.role || '-';
  const todayLabel = formatDateCN(new Date());
  const timeLabel = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  const overviewItems = [
    { label: 'Redis 角色', value: role },
    { label: '运行天数', value: `${uptimeInDays} 天` },
    { label: '峰值内存', value: usedMemoryPeak },
    { label: '当前页签', value: activeTab === 'overview' ? '概览' : 'Key 浏览器' },
  ];

  const maxCommandValue = commandStats[0]?.value || 1;

  const typeColor: Record<string, string> = {
    string: 'bg-emerald-100 text-emerald-700',
    list: 'bg-blue-100 text-blue-700',
    set: 'bg-purple-100 text-purple-700',
    zset: 'bg-amber-100 text-amber-700',
    hash: 'bg-pink-100 text-pink-700',
  };

  return (
    <div className="relative min-h-screen pb-6">
      <WorkspaceBackdrop />

      <WorkspacePageContent>
        <WorkspaceHeroCard
          badge={(
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-cyan-700">
                <Database size={14} />
                {todayLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{timeLabel}</span>
            </div>
          )}
          title="缓存监控"
          description="统一缓存概览、Key 浏览器、详情查看和删除动作，让监控页也具备和业务页一致的工作台层次。"
          actions={(
            <Button
              variant="outline"
              onClick={() => {
                void fetchCacheInfo();
                if (activeTab === 'browser') {
                  void fetchKeys(keySearch.trim() ? `*${keySearch.trim()}*` : '*');
                }
              }}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              刷新缓存
            </Button>
          )}
          contentClassName="p-4 sm:p-5"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceMetricCard
              label="Redis 版本"
              value={redisVersion}
              hint="当前缓存服务版本"
              aside={<Server size={18} className="text-pink-500" />}
            />
            <WorkspaceMetricCard
              label="已用内存"
              value={usedMemoryHuman}
              hint={`内存峰值 ${usedMemoryPeak}`}
              aside={<Database size={18} className="text-emerald-500" />}
            />
            <WorkspaceMetricCard
              label="客户端连接"
              value={connectedClients}
              hint="当前连接中的客户端数量"
              aside={<Activity size={18} className="text-amber-500" />}
            />
            <WorkspaceMetricCard
              label="Key 数量"
              value={dbSize}
              hint={`总命令数 ${Number(totalCommandsProcessed).toLocaleString()}`}
              aside={<Key size={18} className="text-sky-500" />}
            />
          </div>
        </WorkspaceHeroCard>

        <Card className={`${workspaceGlassSurfaceClassName} p-3.5`}>
          <div className="flex flex-col gap-3">
            <WorkspaceWorkbenchCard
              title="缓存工作台"
              total={dbSize}
              hasActiveFilters={Boolean(keySearch.trim())}
              overviewItems={overviewItems}
              quickFilters={[
                { label: '概览', value: 'overview' },
                { label: 'Key 浏览器', value: 'browser' },
              ]}
              activeQuickFilter={activeTab}
              onQuickFilterChange={(value) => setActiveTab(value as 'overview' | 'browser')}
              quickFilterAside={activeTab === 'browser' ? (
                <Button variant="outline" size="sm" onClick={() => { setKeySearch(''); void fetchKeys('*'); }}>
                  清空搜索
                </Button>
              ) : (
                <span className="rounded-full bg-white/82 px-3 py-1.5 text-[11px] font-medium text-slate-400 ring-1 ring-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
                  当前展示 Redis 概览信息
                </span>
              )}
              filterBar={activeTab === 'browser' ? (
                <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="搜索 Key"
                      className="pl-10"
                      value={keySearch}
                      onChange={(event) => setKeySearch(event.target.value)}
                      onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
                    />
                  </div>
                  <Button type="button" onClick={handleSearch}>
                    <Search size={15} />
                    搜索 Key
                  </Button>
                </div>
              ) : undefined}
            />

            <WorkspaceResultCard
              total={dbSize}
              title={activeTab === 'overview' ? '缓存概览' : 'Key 浏览器'}
              description={activeTab === 'overview' ? '集中查看 Redis 基本信息、命令统计与 Key 分组情况。' : '在树状 Key 浏览器中查看具体 Key 的类型、TTL 和内容。'}
            >
              {activeTab === 'overview' ? (
                <div className="space-y-4 p-4">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <WorkspaceSectionCard title="基本信息" description="展示 Redis 运行状态、内存和角色信息。">
                      <table className="w-full text-sm">
                        <tbody className="divide-y divide-slate-100">
                          {[
                            ['Redis 版本', redisVersion],
                            ['运行天数', `${uptimeInDays} 天`],
                            ['已用内存', usedMemoryHuman],
                            ['峰值内存', usedMemoryPeak],
                            ['最大内存', maxmemory === '0' ? '无限制' : maxmemory],
                            ['角色', role],
                            ['处理命令数', Number(totalCommandsProcessed).toLocaleString()],
                            ['客户端连接数', connectedClients],
                          ].map(([label, value]) => (
                            <tr key={label}>
                              <td className="py-2.5 text-slate-500 w-1/3">{label}</td>
                              <td className="py-2.5 font-medium text-slate-800">{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </WorkspaceSectionCard>

                    <WorkspaceSectionCard title="命令统计 Top 10" description="按调用次数排序展示最常用的 Redis 命令。">
                      {commandStats.length === 0 ? (
                        <WorkspaceInlineState title="暂无命令统计数据" className="py-8" />
                      ) : (
                        <div className="space-y-3">
                          {commandStats.slice(0, 10).map((cmd) => {
                            const percent = Math.round((cmd.value / maxCommandValue) * 100);
                            return (
                              <div key={cmd.name}>
                                <div className="mb-1 flex justify-between text-sm">
                                  <span className="font-mono text-slate-700">{cmd.name}</span>
                                  <span className="text-slate-500">{cmd.value.toLocaleString()}</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-100">
                                  <div className="h-2 rounded-full bg-pink-400 transition-all" style={{ width: `${percent}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </WorkspaceSectionCard>
                  </div>

                  <WorkspaceSectionCard title="Key 分组统计" description="按前缀分组，便于判断当前 Redis 内数据域分布。">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px]">
                        <TableHeader>
                          <tr>
                            <TableHead>前缀</TableHead>
                            <TableHead>数量</TableHead>
                            <TableHead>占比</TableHead>
                          </tr>
                        </TableHeader>
                        <tbody className="divide-y divide-white/60">
                          {keyGroups.length === 0 ? (
                            <WorkspaceTableStateRow colSpan={3} title="暂无 Key 数据" />
                          ) : keyGroups.map((group) => {
                            const percent = dbSize > 0 ? ((group.count / dbSize) * 100).toFixed(1) : '0';
                            return (
                              <tr key={group.prefix} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                                <td className="px-4 py-3 font-mono text-sm text-slate-800">{group.prefix}*</td>
                                <td className="px-4 py-3 text-sm text-slate-600">{group.count}</td>
                                <td className="px-4 py-3 text-sm">
                                  <div className="flex items-center gap-2">
                                    <div className="h-2 w-24 rounded-full bg-slate-100">
                                      <div
                                        className="h-2 rounded-full bg-emerald-500"
                                        style={{ width: `${Math.min(parseFloat(percent), 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-slate-500">{percent}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </WorkspaceSectionCard>
                </div>
              ) : (
                <div className="grid gap-4 p-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Key 树</div>
                    <div className="max-h-[68vh] overflow-y-auto p-2">
                      {keysLoading ? (
                        <WorkspaceInlineState type="loading" title="正在加载 Key 列表..." className="py-12" />
                      ) : keyTree.length === 0 ? (
                        <WorkspaceInlineState title="暂无 Key 数据" className="py-12" />
                      ) : (
                        keyTree.map((node, idx) => (
                          <KeyTreeNode
                            key={`${node.name}-${idx}`}
                            node={node}
                            depth={0}
                            onSelectKey={handleSelectKey}
                            onDeletePrefix={handleDeletePrefix}
                            selectedKey={selectedKey}
                          />
                        ))
                      )}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    {!selectedKey ? (
                      <WorkspaceInlineState icon={<Eye size={28} />} title="选择左侧的 Key 查看详情" className="m-6 py-16" />
                    ) : detailLoading ? (
                      <WorkspaceInlineState type="loading" title="正在加载 Key 详情..." className="m-6 py-16" />
                    ) : keyDetail ? (
                      <>
                        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <Key size={16} className="shrink-0 text-pink-500" />
                            <span className="truncate font-mono text-sm text-slate-800" title={keyDetail.key}>{keyDetail.key}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => copyToClipboard(keyDetail.key)} className="rounded-full p-2 text-slate-400 transition hover:bg-white hover:text-slate-700" title="复制 Key">
                              <Copy size={14} />
                            </button>
                            <button type="button" onClick={() => handleDeleteKey(keyDetail.key)} className="rounded-full p-2 text-rose-500 transition hover:bg-white hover:text-rose-600" title="删除 Key">
                              <Trash2 size={14} />
                            </button>
                            <button type="button" onClick={() => { setSelectedKey(null); setKeyDetail(null); }} className="rounded-full p-2 text-slate-400 transition hover:bg-white hover:text-slate-700" title="关闭">
                              <X size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 px-4 py-3 text-xs">
                          <span className="flex items-center gap-1 text-slate-500">
                            <Tag size={12} />
                            类型：
                            <span className={`rounded-full px-2 py-0.5 font-medium ${typeColor[keyDetail.type] || 'bg-slate-100 text-slate-600'}`}>
                              {keyDetail.type.toUpperCase()}
                            </span>
                          </span>
                          <span className="flex items-center gap-1 text-slate-500">
                            <Clock size={12} />
                            TTL：{formatTTL(keyDetail.ttl)}
                          </span>
                          {keyDetail.size !== undefined ? <span className="text-slate-500">元素数：{keyDetail.size}</span> : null}
                        </div>

                        <div className="p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500">值</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(formatValue(keyDetail.value))}
                              className="inline-flex items-center gap-1 text-xs text-cyan-600 transition hover:text-cyan-700"
                            >
                              <Copy size={12} />
                              复制值
                            </button>
                          </div>
                          <pre className="max-h-[52vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-mono whitespace-pre-wrap break-all text-slate-700">
                            {formatValue(keyDetail.value)}
                          </pre>
                        </div>
                      </>
                    ) : (
                      <WorkspaceInlineState title="加载失败，请重试" className="m-6 py-16" />
                    )}
                  </div>
                </div>
              )}
            </WorkspaceResultCard>
          </div>
        </Card>
      </WorkspacePageContent>
    </div>
  );
};

export default CacheMonitor;
