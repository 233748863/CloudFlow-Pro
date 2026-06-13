import { useState } from "react";
import { Move } from "lucide-react";
import { workflowConnectorLineClassName } from "./constants";

interface ConnectorDropZoneProps {
  parentId: string;
  isDraggingGlobal: boolean;
  draggingNodeId: string | null;
  onDrop: (dragId: string, dropId: string) => void;
  selfNodeId?: string;
}

export const ConnectorDropZone = ({
  parentId,
  isDraggingGlobal,
  draggingNodeId,
  onDrop,
  selfNodeId,
}: ConnectorDropZoneProps) => {
  const [isOver, setIsOver] = useState(false);

  if (!isDraggingGlobal) {
    return (
      <div className="flex flex-col items-center">
        <div className={`h-10 w-0.5 ${workflowConnectorLineClassName}`}></div>
      </div>
    );
  }

  // 杜绝节点紧挨自身的错误拖拽区域亮起（无论是拖到自己的父亲下面，还是拖到自己的身上指向孩子的线）
  const isInvalidSelfDrop =
    draggingNodeId === parentId || draggingNodeId === selfNodeId;

  if (isInvalidSelfDrop) {
    return (
      <div className="flex flex-col items-center">
        <div className={`h-10 w-0.5 opacity-50 ${workflowConnectorLineClassName}`}></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center relative py-1">
      <div
        className={`h-10 w-0.5 transition-all ${isOver ? "bg-slate-500 dark:bg-slate-300" : "bg-slate-300 dark:bg-slate-700"}`}
      ></div>
      <div
        className={`workflow-studio-dropzone absolute left-1/2 top-1/2 z-20 flex h-8 w-28 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed transition-colors ${
          isOver
            ? "border-cyan-300 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950/20"
            : "border-slate-300 bg-white hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-cyan-800 dark:hover:bg-cyan-950/20"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOver(false);
          const dragId = e.dataTransfer.getData("nodeId");
          if (dragId) onDrop(dragId, parentId);
        }}
      >
        <Move
          size={14}
          className={isOver ? "text-cyan-700 dark:text-cyan-200" : "text-slate-400 dark:text-slate-500"}
        />
        <span
          className={`text-[11px] font-medium ${isOver ? "text-cyan-700 dark:text-cyan-200" : "text-slate-400 dark:text-slate-500"}`}
        >
          {isOver ? "松开放置" : "拖入空位"}
        </span>
      </div>
    </div>
  );
};
