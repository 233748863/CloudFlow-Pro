package com.cloudflow.oa.service.impl;

import com.cloudflow.oa.domain.OaProjectDependency;
import com.cloudflow.oa.domain.OaProjectTask;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class OaProjectTaskGraph {
    private OaProjectTaskGraph() { }

    public static void assignPaths(List<OaProjectTask> tasks) {
        Map<Long,OaProjectTask> lookup = new HashMap<>();
        for (OaProjectTask task : tasks) if (lookup.put(task.getTaskId(), task) != null) throw new IllegalArgumentException("任务ID重复");
        for (OaProjectTask task : tasks) {
            List<Long> path = new ArrayList<>(); Set<Long> seen = new HashSet<>(); OaProjectTask current = task;
            while (current != null) {
                if (!seen.add(current.getTaskId())) throw new IllegalArgumentException("任务树存在循环引用");
                path.add(0, current.getTaskId());
                if (path.size() > 5) throw new IllegalArgumentException("项目任务最多五层");
                Long parentId = current.getParentTaskId();
                if (parentId == null) break;
                OaProjectTask parent = lookup.get(parentId);
                if (parent == null || !parent.getProjectId().equals(task.getProjectId())) throw new IllegalArgumentException("父任务不存在或不属于本项目");
                if (!Integer.valueOf(1).equals(parent.getIsGroupFlag())) throw new IllegalArgumentException("只有分组任务可以包含子任务");
                current = parent;
            }
            task.setLevelPath("/" + path.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining("/")) + "/");
        }
    }

    public static void validateDependencies(List<OaProjectDependency> dependencies) {
        Map<Long,List<Long>> graph = new HashMap<>();
        for (OaProjectDependency edge : dependencies) {
            if (edge.getPredecessorTaskId().equals(edge.getSuccessorTaskId())) throw new IllegalArgumentException("任务不能依赖自身");
            graph.computeIfAbsent(edge.getPredecessorTaskId(), ignored -> new ArrayList<>()).add(edge.getSuccessorTaskId());
        }
        Map<Long, Integer> inDegree = new HashMap<>();
        graph.forEach((predecessor, successors) -> {
            inDegree.putIfAbsent(predecessor, 0);
            for (Long successor : successors) inDegree.merge(successor, 1, Integer::sum);
        });
        java.util.Deque<Long> ready = new java.util.ArrayDeque<>();
        inDegree.forEach((taskId, degree) -> { if (degree == 0) ready.add(taskId); });
        int visited = 0;
        while (!ready.isEmpty()) {
            Long taskId = ready.remove(); visited++;
            for (Long successor : graph.getOrDefault(taskId, List.of())) {
                int remaining = inDegree.merge(successor, -1, Integer::sum);
                if (remaining == 0) ready.add(successor);
            }
        }
        if (visited != inDegree.size()) throw new IllegalArgumentException("任务依赖形成循环");
    }
}
