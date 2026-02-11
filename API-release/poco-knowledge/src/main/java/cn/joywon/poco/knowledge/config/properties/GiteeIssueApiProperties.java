package cn.joywon.poco.knowledge.config.properties;

import lombok.Data;

/**
 * issue 查询
 *
 * @author poco
 * @date 2024/9/21
 */
@Data
public class GiteeIssueApiProperties {

	/**
	 * 所有者 The owner of the repository. This can be the address path of an enterprise,
	 * organization, or individual.
	 */
	private String owner = "log4j";

	/**
	 * 仓库路径 The repository path.
	 */
	private String repo = "pig";

	/**
	 * Issue的状态 The state of the issue. Possible values are: - open: The issue is open. -
	 * progressing: The issue is in progress. - closed: The issue is closed. - rejected:
	 * The issue is rejected. - all: All issues. Default is open.
	 */
	private String state = "all";

	/**
	 * 当前的页码 The current page number.
	 */
	private Integer page = 1;

	/**
	 * 每页的数量 The number of items per page. The maximum value is 100.
	 */
	private Integer perPage = 100;

	/**
	 * 排序方式 The sorting order. Possible values are: - asc: Ascending order. - desc:
	 * Descending order. Default is desc.
	 */
	private String direction = "asc";

	/**
	 * 用逗号分开的标签 A comma-separated list of labels. For example: bug,performance.
	 */
	private String labels;

	/**
	 * 排序依据 The sorting criteria. Possible values are: - created: Sort by creation time. -
	 * updated_at: Sort by update time. Default is created_at.
	 */
	private String sort;

	/**
	 * 起始的更新时间 The starting update time in ISO 8601 format.
	 */
	private String since;

	/**
	 * 计划开始日期 The scheduled start date. The format can be: - Interval:
	 * 20181006T173008+80-20181007T173008+80 - Less than: -20181007T173008+80 - Greater
	 * than: 20181006T173008+80- The required time format is 20181006T173008+80.
	 */
	private String schedule;

	/**
	 * 计划截止日期 The scheduled deadline date. The format is the same as the schedule.
	 */
	private String deadline;

	/**
	 * 任务创建时间 The task creation time. The format is the same as the schedule.
	 */
	private String createdAt;

	/**
	 * 任务完成时间 The task completion time, i.e., the last time the task was marked as
	 * completed. The format is the same as the schedule.
	 */
	private String finishedAt;

	/**
	 * 根据里程碑标题 The milestone title. Use 'none' for no milestone, '*' for all milestones.
	 */
	private String milestone;

	/**
	 * 用户的username The username of the assignee. Use 'none' for no assignee, '*' for all
	 * assignees.
	 */
	private String assignee;

	/**
	 * 创建Issues的用户username The username of the issue creator.
	 */
	private String creator;

	/**
	 * 所属项目名称 The name of the project. Use 'none' for no project, '*' for all projects.
	 */
	private String program;

}
