import React from 'react';
import { FormDefinition } from '../types';

export const DynamicFormViewer = ({ formDef, data }: { formDef: FormDefinition, data: Record<string, any> }) => {
  return (
    <div className="grid grid-cols-2 gap-4">
      {formDef.fields.map(field => (
        <div key={field.id} className={field.type === 'TEXTAREA' ? 'col-span-2' : ''}>
          <label className="text-xs font-bold text-slate-500 block mb-1">{field.label}</label>
          <div className="p-2 bg-slate-100 rounded text-sm text-slate-800 border border-slate-200 min-h-[38px]">
            {data[field.label] || data[field.id] || <span className="text-slate-400 italic">空</span>}
          </div>
        </div>
      ))}
    </div>
  );
};
