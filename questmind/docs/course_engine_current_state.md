# QuestMind 课程理解系统现状映射

## 结论

QuestMind 已有目标附件上传、PDF 和 DOCX 文字提取、AI 讲解、测验、学习任务、Supabase 同步等能力，但此前附件只作为通用文本上下文使用，没有区分教材、课件、作业和试卷，也没有持久的知识节点、证据、掌握度与复习队列。本次在不改动非学习层模块的前提下，新增独立 `src/course-engine` 学习基础设施，并在目标详情页接入。

## 现有能力映射

| 能力 | 现有入口 | 本次复用方式 |
| --- | --- | --- |
| 附件上传与存储 | `src/pages/Goals/components/NewGoalDialog.tsx`、`SmartCreateDialog.tsx`、`GoalDetailPanel.tsx`、`src/services/supabase.ts` | 上传完成后增量补充课程资料分类，不更换存储桶 |
| PDF 和 DOCX 解析 | `src/lib/fileExtractor.ts` | 继续使用现有提取文本，课程引擎按页分隔符生成教学块 |
| 目标与附件持久化 | `src/store/index.ts`、`src/services/syncService.ts`、`goals.attachments` | 分类结果兼容保存在附件 JSON；课程模型通过仓库接口管理 |
| AI 调用封装 | `src/services/ai.service.ts`、`supabase/functions/ai-chat` | 旧讲解与测验保持兼容；确定性的分类、评分和调度不依赖远端模型 |
| 文档讲解页 | `src/pages/LectureRoom` | 保留旧讲解入口，后续可消费结构化 `study_context` |
| 学习任务与测验 | `DailyTaskCard.tsx`、`QuizDialog.tsx`、`FinalExamDialog.tsx` | 掌握度事件模型提供可接入的正确、错误、提示和完成信号 |
| 数据库 | `supabase/schema.sql` | 新增 `supabase/add_course_engine.sql`，不重写已有表 |

## 新增学习层模块

- `documentClassifier.ts`：资料类型、课程名、章节、语言、页数与置信度。
- `pedagogicalExtractor.ts`：标题、正文、公式、例题、练习、警告、总结、推导教学块。
- `engine.ts`：Teacher Signal、证据、知识节点、多源对齐、重要度、Study Map、掌握度、复习队列与学习上下文。
- `repository.ts`：课程模型 CRUD 边界；当前提供本地持久化实现，数据库迁移提供云端表结构。
- `service.ts`：面向现有 Goal 和 GoalAttachment 的适配层。
- `CourseLearningPanel.tsx`：资料类型修正、模式切换、Study Map、证据、掌握度与今日复习入口。

## 兼容与边界

旧的知识大纲、AI 讲解、学习指南和最终测验仍可使用。课程引擎不读取 Alice 关系、对话人格、运营或其他非学习层状态。长期学习问答应改为消费 `buildStudyContext` 的结构化结果，硬上限 2000 tokens，不再拼接整份历史资料。
