import React from "react";
import { ArrowLeft, FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/common";
import { TEXT } from "./config";

interface TemplateLibraryHeaderProps {
  title: string;
  description: string;
  total: number;
  categoryCount: number;
  activeFilterCount: number;
  viewModeLabel: string;
  fromCreateFlow: boolean;
  canManageTemplates: boolean;
  onBackToCreateFlow: () => void;
  onStartBlankWorkflow: () => void;
  onManageTemplates: () => void;
}

export const TemplateLibraryHeader: React.FC<TemplateLibraryHeaderProps> = ({
  title,
  description,
  total,
  categoryCount,
  activeFilterCount,
  viewModeLabel,
  fromCreateFlow,
  canManageTemplates,
  onBackToCreateFlow,
  onStartBlankWorkflow,
  onManageTemplates,
}) => (
  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
    <div className="min-w-0 flex-1">
      {fromCreateFlow ? (
        <button
          type="button"
          onClick={onBackToCreateFlow}
          className="mb-2 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {TEXT.backToCreate}
        </button>
      ) : null}

      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
        {title}
      </h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
        {description}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
        <span>
          {TEXT.currentResults}{" "}
          <span className="font-medium text-slate-700">{total}</span>
        </span>
        <span>
          {TEXT.categoryCount}{" "}
          <span className="font-medium text-slate-700">{categoryCount}</span>
        </span>
        <span>
          {TEXT.activeFilters}{" "}
          <span className="font-medium text-slate-700">{activeFilterCount}</span>
        </span>
        <span>
          {TEXT.currentView}{" "}
          <span className="font-medium text-slate-700">{viewModeLabel}</span>
        </span>
      </div>
    </div>

    <div className="flex w-full flex-wrap items-center justify-start gap-2 lg:w-auto lg:justify-end">
      {fromCreateFlow ? (
        <Button onClick={onStartBlankWorkflow} className="gap-2">
          <Plus className="h-4 w-4" />
          {TEXT.createBlank}
        </Button>
      ) : null}

      {canManageTemplates ? (
        <Button variant="outline" onClick={onManageTemplates} className="gap-2">
          <FolderOpen className="h-4 w-4" />
          {"\u7ba1\u7406\u6a21\u677f"}
        </Button>
      ) : null}
    </div>
  </div>
);
