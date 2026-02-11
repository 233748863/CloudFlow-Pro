package cn.joywon.poco.knowledge.support.handler.source;

import cn.hutool.core.date.DateUtil;
import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.gitee.sdk.gitee5j.ApiClient;
import com.gitee.sdk.gitee5j.ApiException;
import com.gitee.sdk.gitee5j.api.IssuesApi;
import com.gitee.sdk.gitee5j.model.Issue;
import com.gitee.sdk.gitee5j.model.Note;
import cn.joywon.poco.admin.api.feign.RemoteFileService;
import cn.joywon.poco.common.core.constant.enums.YesNoEnum;
import cn.joywon.poco.knowledge.config.properties.AiKnowledgeProperties;
import cn.joywon.poco.knowledge.config.properties.GiteeIssueApiProperties;
import cn.joywon.poco.knowledge.dto.AiDocumentDTO;
import cn.joywon.poco.knowledge.entity.AiDatasetEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentEntity;
import cn.joywon.poco.knowledge.entity.AiDocumentIssueEntity;
import cn.joywon.poco.knowledge.entity.AiSliceEntity;
import cn.joywon.poco.knowledge.mapper.AiDatasetMapper;
import cn.joywon.poco.knowledge.mapper.AiDocumentIssueMapper;
import cn.joywon.poco.knowledge.mapper.AiDocumentMapper;
import cn.joywon.poco.knowledge.mapper.AiSliceMapper;
import cn.joywon.poco.knowledge.support.constant.IssueTypeEnums;
import cn.joywon.poco.knowledge.support.constant.SliceStatusEnums;
import cn.joywon.poco.knowledge.support.constant.SourceTypeEnums;
import cn.joywon.poco.knowledge.support.constant.SummaryStatusEnums;
import lombok.RequiredArgsConstructor;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.kohsuke.github.*;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.util.List;
import java.util.Optional;

/**
 * EXCEL 问答类型处理
 *
 * @author poco
 * @date 2024/10/3
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class IssueSourceTypeHandler extends AbstractFileSourceTypeHandler {

	private final AiKnowledgeProperties aiKnowledgeProperties;

	private final RemoteFileService remoteFileService;

	private final AiDocumentIssueMapper documentIssueMapper;

	private final AiDatasetMapper datasetMapper;

	private final AiDocumentMapper documentMapper;

	private final AiSliceMapper sliceMapper;

	/**
	 * 支持的源类型
	 * @param sourceType 源类型
	 * @return boolean
	 */
	@Override
	public boolean supports(String sourceType) {
		return SourceTypeEnums.ISSUE.getType().equals(sourceType);
	}

	/**
	 * 处理
	 * @param aiDocumentDTO AI 文档 DTO
	 */
	@Async
	@Override
	public void handle(AiDocumentDTO aiDocumentDTO) {
		AiDocumentEntity documentEntity = saveDocument(aiDocumentDTO);
		saveSlice(documentEntity, aiDocumentDTO);
	}

	/**
	 * 保存文档
	 * @param documentDTO 文档 DTO
	 * @return {@link List }<{@link AiDocumentEntity }>
	 */
	@Override
	public AiDocumentEntity saveDocument(AiDocumentDTO documentDTO) {
		// 保存文档
		AiDocumentEntity document = new AiDocumentEntity();
		document.setId(documentDTO.getId());
		document.setDatasetId(documentDTO.getDatasetId());
		document.setFileStatus(documentDTO.getFileStatus());
		document.setSourceType(documentDTO.getSourceType());
		// 文件类型 仓库类型/仓库拥有者/仓库名称 GITHUB/OWNER/REPO
		document.setName(String.format("%s/%s/%s", documentDTO.getRepoType(), documentDTO.getRepoOwner(),
				documentDTO.getRepoName()));
		document.setFileType("md");
		document.setSliceStatus(SliceStatusEnums.SLICED.getStatus());
		// 工单类型设置为已总结
		document.setSummaryStatus(SummaryStatusEnums.SUMMARYED.getStatus());
		document.setSummary(StrUtil.EMPTY);
		document.setDocumentConfig(JSONUtil.createObj()
			.set(AiDocumentDTO.Fields.repoType, documentDTO.getRepoType())
			.set(AiDocumentDTO.Fields.repoOwner, documentDTO.getRepoOwner())
			.set(AiDocumentDTO.Fields.repoName, documentDTO.getRepoName())
			.set(AiDocumentDTO.Fields.accessToken, documentDTO.getAccessToken())
			.toStringPretty());
		documentMapper.insertOrUpdate(document);
		return document;
	}

	/**
	 * 保存切片
	 * @param documentEntity Document 实体
	 * @param documentDTO 文档 DTO
	 */
	@Override
	@SneakyThrows
	public void saveSlice(AiDocumentEntity documentEntity, AiDocumentDTO documentDTO) {

		// 保存切片
		GiteeIssueApiProperties issueQueryDTO = aiKnowledgeProperties.getGitee();
		try {
			if (IssueTypeEnums.GITHUB.getType().equals(documentDTO.getRepoType())) {
				handleGithubIssues(documentEntity, documentDTO, issueQueryDTO);
			}
			else {
				handleGiteeIssues(documentEntity, documentDTO, issueQueryDTO);
			}
		}
		catch (Exception e) {
			handleSaveIssueError(documentEntity, e);
		}
	}

	/**
	 * 处理 GitHub 问题
	 * @param document 公文
	 * @param aiDocumentDTO AI 文档 DTO
	 * @param issueQueryDTO Issue query DTO
	 * @throws IOException io异常
	 */
	private void handleGithubIssues(AiDocumentEntity document, AiDocumentDTO aiDocumentDTO,
			GiteeIssueApiProperties issueQueryDTO) throws IOException {
		GitHub github = new GitHubBuilder().withOAuthToken(aiDocumentDTO.getAccessToken()).build();
		GHRepository repo = github.getOrganization(aiDocumentDTO.getRepoOwner())
			.getRepository(aiDocumentDTO.getRepoName());
		GHIssueQueryBuilder queryBuilder = repo.queryIssues()
			.state(GHIssueState.ALL)
			.pageSize(issueQueryDTO.getPage())
			.direction(GHDirection.ASC);

		// 根据最后一次更新时间查询
		Optional.ofNullable(documentIssueMapper.selectOne(Wrappers.<AiDocumentIssueEntity>lambdaQuery()
			.eq(AiDocumentIssueEntity::getDocumentId, document.getId())
			.eq(AiDocumentIssueEntity::getDatasetId, document.getDatasetId())
			.orderByDesc(AiDocumentIssueEntity::getCreateAt)
			.last("limit 1"))).map(AiDocumentIssueEntity::getCreateAt).ifPresent(lastDate -> {
				queryBuilder.since(DateUtil.parseDate(lastDate));
			});

		queryBuilder.list().forEach(ghIssue -> processGithubIssue(document, ghIssue));
	}

	/**
	 * 处理 GitHub 问题
	 * @param document 公文
	 * @param ghIssue GH 问题
	 */
	private void processGithubIssue(AiDocumentEntity document, GHIssue ghIssue) {
		if (issueExists(document, String.valueOf(ghIssue.getNumber()))) {
			return;
		}

		String content = buildGithubIssueContent(ghIssue);
		saveSlices(document, ghIssue.getTitle(), content);
		try {
			saveDocumentIssue(document, String.valueOf(ghIssue.getNumber()),
					DateUtil.formatDate(ghIssue.getCreatedAt()), 0);
		}
		catch (IOException e) {
			throw new RuntimeException(e);
		}
	}

	/**
	 * 处理 Gitee 问题
	 * @param document 公文
	 * @param aiDocumentDTO AI 文档 DTO
	 * @param issueQueryDTO Issue query DTO
	 * @throws ApiException API 异常
	 */
	private void handleGiteeIssues(AiDocumentEntity document, AiDocumentDTO aiDocumentDTO,
			GiteeIssueApiProperties issueQueryDTO) throws ApiException {
		ApiClient defaultClient = new ApiClient();
		defaultClient.setAccessToken(aiDocumentDTO.getAccessToken());
		IssuesApi apiInstance = new IssuesApi(defaultClient);

		int startPageNum = Optional
			.ofNullable(documentIssueMapper.selectOne(Wrappers.<AiDocumentIssueEntity>lambdaQuery()
				.eq(AiDocumentIssueEntity::getDocumentId, document.getId())
				.eq(AiDocumentIssueEntity::getDatasetId, document.getDatasetId())
				.orderByDesc(AiDocumentIssueEntity::getPageNum)
				.last("limit 1")))
			.map(AiDocumentIssueEntity::getPageNum)
			.orElse(1);

		for (int pageNum = startPageNum; pageNum < Integer.MAX_VALUE; pageNum++) {
			List<Issue> issueList = apiInstance.getReposOwnerRepoIssues(aiDocumentDTO.getRepoOwner(),
					aiDocumentDTO.getRepoName(), issueQueryDTO.getState(), issueQueryDTO.getLabels(),
					issueQueryDTO.getSort(), issueQueryDTO.getDirection(), issueQueryDTO.getSince(), pageNum,
					issueQueryDTO.getPerPage(), issueQueryDTO.getSchedule(), issueQueryDTO.getDeadline(),
					issueQueryDTO.getCreatedAt(), issueQueryDTO.getFinishedAt(), issueQueryDTO.getMilestone(),
					issueQueryDTO.getAssignee(), issueQueryDTO.getCreator(), issueQueryDTO.getProgram());
			if (issueList.isEmpty()) {
				break;
			}

			processGiteeIssues(document, apiInstance, issueList, aiDocumentDTO, issueQueryDTO, pageNum);
		}
	}

	/**
	 * 处理 Gitee 问题
	 * @param document 公文
	 * @param apiInstance API 实例
	 * @param issueList 问题列表
	 * @param aiDocumentDTO
	 * @param issueQueryDTO Issue query DTO
	 * @param pageNum 页码
	 */
	private void processGiteeIssues(AiDocumentEntity document, IssuesApi apiInstance, List<Issue> issueList,
			AiDocumentDTO aiDocumentDTO, GiteeIssueApiProperties issueQueryDTO, int pageNum) {
		issueList.stream().filter(issue -> !issueExists(document, issue.getNumber())).forEach(issue -> {
			try {
				String content = buildGiteeIssueContent(apiInstance, issue, aiDocumentDTO, issueQueryDTO);
				saveSlices(document, issue.getTitle(), content);
				saveDocumentIssue(document, issue.getNumber(), issue.getCreatedAt().toString(), pageNum);
			}
			catch (ApiException e) {
				log.error("Error processing Gitee issue", e);
			}
		});
	}

	/**
	 * 构建 GitHub Issue 内容
	 * @param ghIssue GH 问题
	 * @return {@link String }
	 */
	private String buildGithubIssueContent(GHIssue ghIssue) {
		try {
			StringBuilder contentBuilder = new StringBuilder().append("Issue: ")
				.append(ghIssue.getTitle())
				.append("\n")
				.append("Body: ")
				.append(StrUtil.removeAllLineBreaks(ghIssue.getBody()))
				.append("\n");

			List<GHIssueComment> comments = ghIssue.getComments();
			if (!comments.isEmpty()) {
				contentBuilder.append("Comments: ");
				comments.forEach(
						comment -> contentBuilder.append(StrUtil.removeAllLineBreaks(comment.getBody())).append("\n"));
			}

			return contentBuilder.toString();
		}
		catch (IOException e) {
			throw new RuntimeException(e);
		}
	}

	/**
	 * 存在问题
	 * @param document 公文
	 * @param issueNumber 问题号
	 * @return boolean
	 */
	private boolean issueExists(AiDocumentEntity document, String issueNumber) {
		return documentIssueMapper.exists(Wrappers.<AiDocumentIssueEntity>lambdaQuery()
			.eq(AiDocumentIssueEntity::getDocumentId, document.getId())
			.eq(AiDocumentIssueEntity::getDatasetId, document.getDatasetId())
			.eq(AiDocumentIssueEntity::getIssueId, issueNumber));
	}

	/**
	 * 构建问题内容
	 * @param apiInstance API 实例
	 * @param issue 问题
	 * @param aiDocumentDTO
	 * @param issueQueryDTO Issue query DTO
	 * @return {@link String }
	 * @throws ApiException API 异常
	 */
	private String buildGiteeIssueContent(IssuesApi apiInstance, Issue issue, AiDocumentDTO aiDocumentDTO,
			GiteeIssueApiProperties issueQueryDTO) throws ApiException {
		StringBuilder contentBuilder = new StringBuilder().append("Issue: ")
			.append(issue.getTitle())
			.append("\n")
			.append("Body: ")
			.append(StrUtil.removeAllLineBreaks(issue.getBody()))
			.append("\n");

		List<Note> commentList = apiInstance.getReposOwnerRepoIssuesNumberComments(aiDocumentDTO.getRepoOwner(),
				aiDocumentDTO.getRepoName(), issue.getNumber(), issueQueryDTO.getSince(), issueQueryDTO.getPage(),
				issueQueryDTO.getPerPage(), issueQueryDTO.getSort());

		if (!commentList.isEmpty()) {
			contentBuilder.append("Comments: ");
			commentList
				.forEach(comment -> contentBuilder.append(StrUtil.removeAllLineBreaks(comment.getBody())).append("\n"));
		}

		return contentBuilder.toString();
	}

	/**
	 * 保存切片
	 * @param document 公文
	 * @param issueTitle 问题标题
	 * @param content 内容
	 * @return int
	 */
	private int saveSlices(AiDocumentEntity document, String issueTitle, String content) {
		AiDatasetEntity datasetEntity = datasetMapper.selectById(document.getDatasetId());
		String[] fragments = StrUtil.split(content, datasetEntity.getFragmentSize());

		List<AiSliceEntity> slices = java.util.Arrays.stream(fragments).map(fragment -> {
			AiSliceEntity slice = new AiSliceEntity();
			slice.setDocumentId(document.getId());
			slice.setContent(fragment);
			slice.setName(issueTitle);
			slice.setSliceStatus(YesNoEnum.NO.getCode());
			slice.setCharCount((long) fragment.length());
			return slice;
		}).toList();

		slices.forEach(sliceMapper::insert);
		// 向量化
		embedSlice(document);
		return slices.size();
	}

	/**
	 * 保存文档问题
	 * @param document 公文
	 * @param issueNumber 问题号
	 * @param createAt 创建时间
	 * @param pageNum 页码
	 */
	private void saveDocumentIssue(AiDocumentEntity document, String issueNumber, String createAt, int pageNum) {
		AiDocumentIssueEntity documentIssueEntity = new AiDocumentIssueEntity();
		documentIssueEntity.setDocumentId(document.getId());
		documentIssueEntity.setDatasetId(document.getDatasetId());
		documentIssueEntity.setIssueId(issueNumber);
		documentIssueEntity.setPageNum(pageNum);
		documentIssueEntity.setCreateAt(createAt);
		documentIssueMapper.insert(documentIssueEntity);
	}

	/**
	 * 处理保存问题错误
	 * @param document 公文
	 * @param e e
	 */
	private void handleSaveIssueError(AiDocumentEntity document, Exception e) {
		log.error("API initialization failed", e);
		document.setSliceStatus(SliceStatusEnums.FAILED.getStatus());
		document.setSliceFailReason("API initialization failed: " + e.getMessage());
		documentMapper.updateById(document);
	}

}
