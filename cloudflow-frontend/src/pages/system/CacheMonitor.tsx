import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Server, Database, Activity, Key, Loader2, ChevronRight, ChevronDown, Search, Trash2, Eye, FolderOpen, Folder, X, Copy, Clock, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { getCacheInfo, getCacheKeys, getCacheKeyValue, deleteCacheKey, deleteCacheByPrefix, CacheKeyDetail } from '../../services/api/system';
import { Input } from '../../components/ui/input';

// ==================== 类型定义 ====================

/** 树节点结构 */
interface TreeNode {
  /** 节点名称（当前层级的片段） */
  name: string;
  /** 完整的 key 路径（仅叶子节点有值） */
  fullKey?: string;
  /** 子节点 */
  children: TreeNode[];
  /** 该前缀下的 key 数量 */
  count: number;
}

// ==================== 工具函数 ====================

/**
 * 将扁平的 key 列表构建为树结构
 * 按冒号 ":" 分隔层级
 */
const buildKeyTree = (keys: string[]): TreeNode[] => {
  const root: TreeNode = { name: 'root', children: [], count: 0 };

  for (const key of keys) {
    const parts = key.split(':');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      let child = current.children.find(c => c.name === part);
      if (!child) {
        child = {
          name: part,
          children: [],
          count: 0,
          // 最后一层才设置 fullKey
          fullKey: i === parts.length - 1 ? key : undefined,
        };
        current.children.push(child);
      }
      child.count++;
      current = child;
    }
  }

  // 按名称排序
  const sortTree = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach(n => sortTree(n.children));
  };
  sortTree(root.children);

  return root.children;
};

/**
 * 格式化 TTL 显示
 */
const formatTTL = (ttl: number): string => {
  if (ttl === -1) return '永不过期';
  if (ttl === -2) return 'Key 不存在';
  if (ttl < 60) return `${ttl} 秒`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)} 分 ${ttl % 60} 秒`;
  if (ttl < 86400) return `${Math.floor(ttl / 3600)} 时 ${Math.floor((ttl % 3600) / 60)} 分`;
  return `${Math.floor(ttl / 86400)} 天 ${Math.floor((ttl % 86400) / 3600)} 时`;
};

/**
 * 格式化值显示（尝试 JSON 美化）
 */
const formatValue = (value: any): string => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    // 尝试解析 JSON
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
};

// ==================== 子组件 ====================

/** 统计卡片 */
const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; color: string }> = ({ icon, label, value, color }) => (
  <div className="bg-white rounded-lg shadow-sm p-5 flex items-center gap-4">
    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  </div>
);

/** 树节点组件 - 递归渲染 */
const KeyTreeNode: React.FC<{
  node: TreeNode;
  depth: number;
  onSelectKey: (key: string) => void;
  onDeletePrefix: (prefix: string) => void;
  selectedKey: string | null;
}> = ({ node, depth, onSelectKey, onDeletePrefix, selectedKey }) => {
  const [expanded, setExpanded] = useState(false);
  const isLeaf = node.children.length === 0 && node.fullKey;
  const isSelected = isLeaf && node.fullKey === selectedKey;

  // 计算当前节点的前缀路径（用于批量删除）
  const getPrefix = (): string => {
    if (node.fullKey) return node.fullKey;
    // 非叶子节点：从子节点推断前缀
    const firstLeaf = findFirstLeaf(node);
    if (firstLeaf) {
      const parts = firstLeaf.split(':');
      return parts.slice(0, depth + 1).join(':');
    }
    return node.name;
  };

  const findFirstLeaf = (n: TreeNode): string | null => {
    if (n.fullKey) return n.fullKey;
    for (const child of n.children) {
      const result = findFirstLeaf(child);
      if (result) return result;
    }
    return null;
  };

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 px-2 rounded cursor-pointer text-sm group transition-colors ${
          isSelected ? 'bg-pink-50 text-pink-700' : 'hover:bg-slate-50 text-slate-700'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (isLeaf && node.fullKey) {
            onSelectKey(node.fullKey);
          } else {
            setExpanded(!expanded);
          }
        }}
      >
        {/* 展开/折叠图标 */}
        {!isLeaf ? (
          expanded ? <ChevronDown size={14} className="text-slate-400 shrink-0" /> : <ChevronRight size={14} className="text-slate-400 shrink-0" />
        ) : (
          <Key size={14} className="text-pink-400 shrink-0" />
        )}

        {/* 文件夹/Key 图标 */}
        {!isLeaf && (expanded ? <FolderOpen size={14} className="text-amber-500 shrink-0" /> : <Folder size={14} className="text-amber-400 shrink-0" />)}

        {/* 名称 */}
        <span className="truncate flex-1 font-mono text-xs">{node.name}</span>

        {/* 数量标签 */}
        {!isLeaf && (
          <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{node.count}</span>
        )}

        {/* 批量删除按钮（非叶子节点 hover 显示） */}
        {!isLeaf && (
          <button
            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 shrink-0 transition-opacity"
            title={`删除 ${getPrefix()}:* 下所有 Key`}
            onClick={(e) => {
              e.stopPropagation();
              onDeletePrefix(getPrefix());
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* 子节点 */}
      {expanded && node.children.map((child, idx) => (
        <KeyTreeNode
          key={`${child.name}-${idx}`}
          node={child}
          depth={depth + 1}
          onSelectKey={onSelectKey}
          onDeletePrefix={onDeletePrefix}
          selectedKey={selectedKey}
        />
      ))}
    </div>
  );
};

// ==================== 主组件 ====================

export const CacheMonitor = () => {
  // 监控数据
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<Record<string, string>>({});
  const [dbSize, setDbSize] = useState(0);
  const [commandStats, setCommandStats] = useState<{ name: string; value: number }[]>([]);
  const [keyGroups, setKeyGroups] = useState<{ prefix: string; count: number }[]>([]);

  // Key 浏览器
  const [activeTab, setActiveTab] = useState<'overview' | 'browser'>('overview');
  const [keyTree, setKeyTree] = useState<TreeNode[]>([]);
  const [keySearch, setKeySearch] = useState('');
  const [keysLoading, setKeysLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [keyDetail, setKeyDetail] = useState<CacheKeyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => { fetchCacheInfo(); }, []);

  // 切换到浏览器 tab 时自动加载 key 列表
  useEffect(() => {
    if (activeTab === 'browser' && keyTree.length === 0) {
      fetchKeys();
    }
  }, [activeTab]);

  /** 获取缓存监控信息 */
  const fetchCacheInfo = async () => {
    setLoading(true);
    try {
      const res: any = await getCacheInfo();
      if (res) {
        setInfo(res.info || {});
        setDbSize(res.dbSize || 0);
        setCommandStats(res.commandStats || []);
        setKeyGroups(res.keyGroups || []);
      }
    } catch (e) {
      console.error(e);
      toast.error('获取缓存信息失败');
    } finally {
      setLoading(false);
    }
  };

  /** 获取 Key 列表并构建树 */
  const fetchKeys = useCallback(async (pattern?: string) => {
    setKeysLoading(true);
    try {
      const keys: any = await getCacheKeys(pattern || '*');
      const keyList = Array.isArray(keys) ? keys : [];
      setKeyTree(buildKeyTree(keyList));
    } catch (e) {
      console.error(e);
      toast.error('获取 Key 列表失败');
    } finally {
      setKeysLoading(false);
    }
  }, []);

  /** 搜索 Key */
  const handleSearch = () => {
    const pattern = keySearch.trim() ? `*${keySearch.trim()}*` : '*';
    fetchKeys(pattern);
  };

  /** 选中 Key 查看详情 */
  const handleSelectKey = async (key: string) => {
    setSelectedKey(key);
    setDetailLoading(true);
    try {
      const detail: any = await getCacheKeyValue(key);
      setKeyDetail(detail);
    } catch (e) {
      console.error(e);
      toast.error('获取 Key 详情失败');
      setKeyDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  /** 删除单个 Key */
  const handleDeleteKey = async (key: string) => {
    if (!confirm(`确认删除 Key: ${key} ?`)) return;
    try {
      await deleteCacheKey(key);
      toast.success('删除成功');
      // 刷新列表和详情
      if (selectedKey === key) {
        setSelectedKey(null);
        setKeyDetail(null);
      }
      fetchKeys(keySearch.trim() ? `*${keySearch.trim()}*` : '*');
      fetchCacheInfo();
    } catch (e) {
      toast.error('删除失败');
    }
  };

  /** 按前缀批量删除 */
  const handleDeletePrefix = async (prefix: string) => {
    if (!confirm(`确认删除前缀 "${prefix}:*" 下的所有 Key？此操作不可撤销！`)) return;
    try {
      const count: any = await deleteCacheByPrefix(prefix + ':');
      toast.success(`已删除 ${count || 0} 个 Key`);
      setSelectedKey(null);
      setKeyDetail(null);
      fetchKeys(keySearch.trim() ? `*${keySearch.trim()}*` : '*');
      fetchCacheInfo();
    } catch (e) {
      toast.error('批量删除失败');
    }
  };

  /** 复制到剪贴板 */
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('已复制'));
  };

  // 从 Redis info 中提取关键指标
  const redisVersion = info['redis_version'] || '-';
  const usedMemory = info['used_memory'] || '0';
  const usedMemoryHuman = info['used_memory_human'] || '-';
  const connectedClients = info['connected_clients'] || '0';
  const uptimeInDays = info['uptime_in_days'] || '0';
  const totalCommandsProcessed = info['total_commands_processed'] || '0';
  const usedMemoryPeak = info['used_memory_peak_human'] || '-';
  const maxmemory = info['maxmemory_human'] || info['maxmemory'] || '-';
  const role = info['role'] || '-';

  /** 数据类型颜色映射 */
  const typeColor: Record<string, string> = {
    string: 'bg-emerald-100 text-emerald-700',
    list: 'bg-blue-100 text-blue-700',
    set: 'bg-purple-100 text-purple-700',
    zset: 'bg-amber-100 text-amber-700',
    hash: 'bg-pink-100 text-pink-700',
  };

  return (
    <div className="p-6 h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* 标题栏 */}
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h1 className="text-2xl font-bold text-slate-800">缓存监控</h1>
        <div className="flex items-center gap-3">
          {/* Tab 切换 */}
          <div className="flex bg-white rounded-lg border border-slate-200 p-0.5">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${activeTab === 'overview' ? 'bg-pink-500 text-white' : 'text-slate-600 hover:text-slate-800'}`}
            >
              概览
            </button>
            <button
              onClick={() => setActiveTab('browser')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${activeTab === 'browser' ? 'bg-pink-500 text-white' : 'text-slate-600 hover:text-slate-800'}`}
            >
              Key 浏览器
            </button>
          </div>
          <button
            onClick={() => { fetchCacheInfo(); if (activeTab === 'browser') fetchKeys(keySearch.trim() ? `*${keySearch.trim()}*` : '*'); }}
            disabled={loading}
            className="bg-pink-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-pink-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 刷新
          </button>
        </div>
      </div>

      {/* ==================== 概览 Tab ==================== */}
      {activeTab === 'overview' && (
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-pink-500" size={32} />
            </div>
          ) : (
            <>
              {/* 概览卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard icon={<Server size={24} className="text-pink-500" />} label="Redis 版本" value={redisVersion} color="bg-pink-50" />
                <StatCard icon={<Database size={24} className="text-emerald-600" />} label="已用内存" value={usedMemoryHuman} color="bg-emerald-50" />
                <StatCard icon={<Activity size={24} className="text-amber-600" />} label="连接客户端" value={connectedClients} color="bg-amber-50" />
                <StatCard icon={<Key size={24} className="text-rose-600" />} label="Key 数量" value={dbSize} color="bg-rose-50" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* 基本信息 */}
                <div className="bg-white rounded-lg shadow-sm">
                  <div className="p-4 border-b border-slate-100">
                    <h2 className="text-base font-semibold text-slate-800">基本信息</h2>
                  </div>
                  <div className="p-4">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {[
                          ['Redis 版本', redisVersion],
                          ['运行天数', `${uptimeInDays} 天`],
                          ['已用内存', usedMemoryHuman],
                          ['内存峰值', usedMemoryPeak],
                          ['最大内存', maxmemory === '0' ? '无限制' : maxmemory],
                          ['角色', role],
                          ['已处理命令', Number(totalCommandsProcessed).toLocaleString()],
                          ['连接客户端', connectedClients],
                        ].map(([label, value]) => (
                          <tr key={label}>
                            <td className="py-2.5 text-slate-500 w-1/3">{label}</td>
                            <td className="py-2.5 text-slate-800 font-medium">{value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 命令统计 Top 10 */}
                <div className="bg-white rounded-lg shadow-sm">
                  <div className="p-4 border-b border-slate-100">
                    <h2 className="text-base font-semibold text-slate-800">命令统计 (Top 10)</h2>
                  </div>
                  <div className="p-4">
                    {commandStats.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-8">暂无命令统计数据</p>
                    ) : (
                      <div className="space-y-3">
                        {commandStats.slice(0, 10).map((cmd) => {
                          const maxVal = commandStats[0]?.value || 1;
                          const pct = Math.round((cmd.value / maxVal) * 100);
                          return (
                            <div key={cmd.name}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-slate-700 font-mono">{cmd.name}</span>
                                <span className="text-slate-500">{cmd.value.toLocaleString()}</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-2">
                                <div className="bg-pink-400 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Key 分组统计 */}
              <div className="bg-white rounded-lg shadow-sm">
                <div className="p-4 border-b border-slate-100">
                  <h2 className="text-base font-semibold text-slate-800">Key 前缀分组统计</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">前缀</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">数量</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">占比</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {keyGroups.length === 0 ? (
                        <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400 text-sm">暂无 Key 数据</td></tr>
                      ) : keyGroups.map(group => {
                        const pct = dbSize > 0 ? ((group.count / dbSize) * 100).toFixed(1) : '0';
                        return (
                          <tr key={group.prefix} className="hover:bg-slate-50">
                            <td className="px-6 py-3 text-sm font-mono text-slate-800">{group.prefix}*</td>
                            <td className="px-6 py-3 text-sm text-slate-600">{group.count}</td>
                            <td className="px-6 py-3 text-sm">
                              <div className="flex items-center gap-2">
                                <div className="w-24 bg-slate-100 rounded-full h-2">
                                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(parseFloat(pct), 100)}%` }} />
                                </div>
                                <span className="text-slate-500">{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ==================== Key 浏览器 Tab ==================== */}
      {activeTab === 'browser' && (
        <div className="flex-1 flex gap-4 overflow-hidden">
          {/* 左侧：Key 树 */}
          <div className="w-80 shrink-0 bg-white rounded-lg shadow-sm flex flex-col overflow-hidden">
            {/* 搜索栏 */}
            <div className="p-3 border-b border-slate-100">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="搜索 Key..."
                    className="pl-8 text-xs h-8"
                    value={keySearch}
                    onChange={e => setKeySearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="px-2.5 py-1 bg-pink-500 text-white rounded text-xs hover:bg-pink-600 shrink-0"
                >
                  搜索
                </button>
              </div>
            </div>

            {/* Key 树列表 */}
            <div className="flex-1 overflow-y-auto p-1">
              {keysLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="animate-spin text-pink-400" size={20} />
                </div>
              ) : keyTree.length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-400">
                  暂无 Key 数据
                </div>
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

          {/* 右侧：Key 详情 */}
          <div className="flex-1 bg-white rounded-lg shadow-sm flex flex-col overflow-hidden">
            {!selectedKey ? (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                <Eye size={48} className="mb-3 opacity-30" />
                <p className="text-sm">选择左侧的 Key 查看详情</p>
              </div>
            ) : detailLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="animate-spin text-pink-400" size={24} />
              </div>
            ) : keyDetail ? (
              <>
                {/* 详情头部 */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <Key size={16} className="text-pink-500 shrink-0" />
                    <span className="font-mono text-sm text-slate-800 truncate" title={keyDetail.key}>{keyDetail.key}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => copyToClipboard(keyDetail.key)}
                      className="text-slate-400 hover:text-slate-600 p-1"
                      title="复制 Key"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteKey(keyDetail.key)}
                      className="text-red-400 hover:text-red-600 p-1"
                      title="删除此 Key"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      onClick={() => { setSelectedKey(null); setKeyDetail(null); }}
                      className="text-slate-400 hover:text-slate-600 p-1"
                      title="关闭"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* 元信息 */}
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-4 text-xs shrink-0">
                  <span className="flex items-center gap-1">
                    <Tag size={12} className="text-slate-400" />
                    类型：
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${typeColor[keyDetail.type] || 'bg-slate-100 text-slate-600'}`}>
                      {keyDetail.type.toUpperCase()}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-slate-500">
                    <Clock size={12} />
                    TTL：{formatTTL(keyDetail.ttl)}
                  </span>
                  {keyDetail.size !== undefined && (
                    <span className="text-slate-500">
                      元素数：{keyDetail.size}
                    </span>
                  )}
                </div>

                {/* 值内容 */}
                <div className="flex-1 overflow-auto p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-500">值</span>
                    <button
                      onClick={() => copyToClipboard(formatValue(keyDetail.value))}
                      className="text-xs text-pink-500 hover:text-pink-600 flex items-center gap-1"
                    >
                      <Copy size={12} /> 复制值
                    </button>
                  </div>
                  <pre className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs font-mono text-slate-700 whitespace-pre-wrap break-all overflow-auto max-h-[calc(100vh-400px)]">
                    {formatValue(keyDetail.value)}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                加载失败，请重试
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
