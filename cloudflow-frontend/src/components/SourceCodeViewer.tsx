import React, { useState } from 'react';
import { Loader2, Code } from 'lucide-react';
import { WorkflowDefinition } from '../types';
import { generateBackendArtifacts } from '../services/geminiService';
import { BACKEND_SOURCE } from '../backend_data';

export const SourceCodeViewer = ({ workflow }: { workflow: WorkflowDefinition }) => {
  const [activeTab, setActiveTab] = useState<'sql' | 'java'>('java');
  const [generatedCode, setGeneratedCode] = useState<{sql: string, java: string, loading: boolean}>({
    sql: BACKEND_SOURCE.sql,
    java: BACKEND_SOURCE.java_workflow,
    loading: false
  });

  const handleGenerate = async () => {
    setGeneratedCode(prev => ({ ...prev, loading: true }));
    try {
      const [sql, java] = await Promise.all([
        generateBackendArtifacts(workflow, 'SQL'),
        generateBackendArtifacts(workflow, 'JAVA_ENGINE')
      ]);
      setGeneratedCode({ sql, java, loading: false });
    } catch (e) {
      alert("生成失败，请检查 API Key");
      setGeneratedCode(prev => ({ ...prev, loading: false }));
    }
  };
  
  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">后端工程生成中心 (AI 驱动)</h2>
          <p className="text-slate-500 mt-1">集成 Redis Pub/Sub、动态表单解析、组织架构适配的完整代码。</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleGenerate}
            disabled={generatedCode.loading}
            className="flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-lg text-sm font-medium hover:bg-pink-600 disabled:opacity-50 transition-all shadow-md"
          >
            {generatedCode.loading ? <Loader2 size={16} className="animate-spin"/> : <Code size={16} />}
            {generatedCode.loading ? 'AI 正在编写代码...' : '生成代码'}
          </button>
        </div>
      </div>

      <div className="flex-1 bg-[#1e1e1e] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-700">
        <div className="flex bg-[#252526] border-b border-[#333]">
          <button 
            onClick={() => setActiveTab('java')}
            className={`px-4 py-3 text-sm flex items-center gap-2 border-r border-[#333] transition-colors ${activeTab === 'java' ? 'bg-[#1e1e1e] text-white border-t-2 border-t-pink-400' : 'text-slate-400 hover:bg-[#2d2d2d]'}`}
          >
            <span className="w-2 h-2 rounded-full bg-orange-500"/> WorkflowService.java
          </button>
          <button 
            onClick={() => setActiveTab('sql')}
            className={`px-4 py-3 text-sm flex items-center gap-2 border-r border-[#333] transition-colors ${activeTab === 'sql' ? 'bg-[#1e1e1e] text-white border-t-2 border-t-pink-400' : 'text-slate-400 hover:bg-[#2d2d2d]'}`}
          >
            <span className="w-2 h-2 rounded-full bg-pink-400"/> schema.sql
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-4 relative">
          <pre className="font-mono text-sm leading-relaxed">
            <code className={activeTab === 'java' ? 'text-pink-200' : 'text-emerald-300'}>
              {activeTab === 'java' ? generatedCode.java : generatedCode.sql}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
};
