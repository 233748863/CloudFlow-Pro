import React from 'react';
import { FormBuilder } from '../components/FormBuilder';
import { FormDefinition } from '../types';
import { saveFormDefinition } from '../services/api/workflow';

export const FormDesign = () => {
  const handleSaveForm = async (form: FormDefinition) => {
    try {
        const payload = {
            formId: form.id.startsWith('form_') ? undefined : form.id,
            formName: form.name,
            fieldsJson: JSON.stringify(form.fields)
        };
        await saveFormDefinition(payload);
        alert("表单保存成功");
    } catch(e) {
        console.error(e);
        alert("表单保存失败");
    }
  };

  return (
    <div className="h-[calc(100vh-140px)]">
      <FormBuilder onSave={handleSaveForm} initialForm={undefined} />
    </div>
  );
};
