import React from "react";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { BaseDialog } from "@/components/common/BaseDialog";
import { TEXT } from "./config";

interface TemplateLibraryCreateDialogProps {
  open: boolean;
  workflowName: string;
  workflowDescription: string;
  onWorkflowNameChange: (value: string) => void;
  onWorkflowDescriptionChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export const TemplateLibraryCreateDialog: React.FC<TemplateLibraryCreateDialogProps> = ({
  open,
  workflowName,
  workflowDescription,
  onWorkflowNameChange,
  onWorkflowDescriptionChange,
  onClose,
  onSubmit,
}) =>
  open ? (
    <BaseDialog
      open={open}
      title={TEXT.createWorkflowFromTemplate}
      description={TEXT.createWorkflowDesc}
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="workflow-name">{`${TEXT.workflowName} *`}</Label>
          <Input
            id="workflow-name"
            value={workflowName}
            onChange={(event) => onWorkflowNameChange(event.target.value)}
            placeholder={TEXT.workflowNamePlaceholder}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="workflow-description">{TEXT.workflowDescriptionLabel}</Label>
          <Textarea
            id="workflow-description"
            value={workflowDescription}
            onChange={(event) => onWorkflowDescriptionChange(event.target.value)}
            placeholder={TEXT.workflowDescriptionPlaceholder}
            rows={4}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            {TEXT.cancel}
          </Button>
          <Button onClick={onSubmit}>{TEXT.create}</Button>
        </div>
      </div>
    </BaseDialog>
  ) : null;
