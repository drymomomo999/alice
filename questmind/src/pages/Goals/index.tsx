/**
 * Goals 页面 — 目标管理主页面
 *
 * 三栏布局：左栏(目标列表) + 中栏(目标详情+AI学习指南) + 右栏(艾莉丝聊天)
 */
import { useState } from 'react'
import { useGoalsStore } from '@/store'
import { generateId, cn } from '@/lib/utils'
import { generateStatusQuestions, generateGoalPlan, generateQuizQuestions, buildGoalContextString, type GoalPlanResult } from '@/services/ai.service'
import { analyzeGoalCourse, projectContinuityPlanToGoal } from '@/course-engine/service'
import { auditGoalPlan, normalizeGoalPlan } from '@/features/goals/planning'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useGoalRuntime } from '@/features/goals/useGoalRuntime'
import type { GoalPriority, GoalCategory, DailyTask, GoalAttachment, QuizQuestion } from '@/types'

// 拆分后的子组件
import { GoalListPanel } from './components/GoalListPanel'
import { GoalDetailPanel } from './components/GoalDetailPanel'
import { AliceChatPanel } from './components/AliceChatPanel'
import { QuizDialog } from './components/QuizDialog'
import { CgDialog } from './components/CgDialog'
import { NewGoalDialog } from './components/NewGoalDialog'
import { SmartCreateDialog } from './components/SmartCreateDialog'
import { FinalExamDialog } from './components/FinalExamDialog'

// ============================================================
// Fallback 题库（AI服务不可用时使用 —— 必须是有实质知识点的客观题，禁止自我评估题）
// ============================================================
function getSubjectFallbackQuestions(topic: string): QuizQuestion[] {
  const lower = topic.toLowerCase()

  // 微观经济学第1-4章
  if ((lower.includes('微观经济') || lower.includes('经济学')) && (lower.includes('1-4') || lower.includes('1~4') || lower.includes('第1') || lower.includes('第2') || lower.includes('第3') || lower.includes('第4'))) {
    return [
      {
        id: 'f1',
        question: '如果某种商品的需求价格弹性系数为0，这意味着该商品是：',
        options: ['完全富有弹性', '单位弹性', '完全缺乏弹性', '富有弹性'],
        correctIndex: 2,
        explanation: '需求价格弹性为0表示完全缺乏弹性（perfectly inelastic），价格变动对需求量完全没有影响。典型例子是必需品如胰岛素。',
        difficulty: 'easy',
      },
      {
        id: 'f2',
        question: '在消费者均衡状态下，无差异曲线的斜率（边际替代率MRS）与预算线斜率的关系是：',
        options: ['MRS大于价格比', 'MRS小于价格比', 'MRS等于两种商品的价格之比（绝对值）', 'MRS等于两种商品价格之和'],
        correctIndex: 2,
        explanation: '消费者均衡条件为 MRS = P₁/P₂，即无差异曲线与预算线相切，此时消费者在既定收入下实现效用最大化。',
        difficulty: 'easy',
      },
      {
        id: 'f3',
        question: '对于正常商品，当价格下降时，替代效应和收入效应分别导致需求量如何变化？',
        options: ['替代效应减少，收入效应减少', '替代效应增加，收入效应增加', '替代效应减少，收入效应增加', '替代效应增加，收入效应减少'],
        correctIndex: 1,
        explanation: '正常商品的替代效应和收入效应都与价格变动方向相反：价格下降 → 替代效应使需求量增加（转向更便宜商品），收入效应也使需求量增加（实际收入上升）。',
        difficulty: 'medium',
      },
      {
        id: 'f4',
        question: '政府对某商品实施最高限价（低于均衡价格），以下哪种后果最可能出现？',
        options: ['市场出现供过于求（过剩）', '市场出现供不应求（短缺）', '价格自动回到均衡水平', '消费者剩余减少'],
        correctIndex: 1,
        explanation: '最高限价低于均衡价格，导致需求量增加而供给量减少，产生供不应求（短缺）。消费者剩余实际上会增加（对买到商品的消费者而言），而非减少。',
        difficulty: 'medium',
      },
      {
        id: 'f5',
        question: '关于无差异曲线的性质，以下说法错误的是：',
        options: ['同一消费者的无差异曲线不相交', '无差异曲线向右下方倾斜', '距原点越远的无差异曲线代表效用水平越高', '无差异曲线在任何偏好下都一定是直线'],
        correctIndex: 3,
        explanation: '无差异曲线的形状取决于偏好；完全替代品时可以是直线，但不能说任何偏好下都一定是直线。',
        difficulty: 'hard',
      },
    ]
  }

  // 微观经济学第5-8章
  if ((lower.includes('微观经济') || lower.includes('经济学')) && (lower.includes('5-8') || lower.includes('5~8') || lower.includes('第5') || lower.includes('第6') || lower.includes('第7') || lower.includes('第8'))) {
    return [
      {
        id: 'f1',
        question: '在短期生产中，当边际产量（MP）开始递减时，总产量（TP）的变化趋势是：',
        options: ['开始下降', '继续上升但增速放缓', '保持不变', '增速加快'],
        correctIndex: 1,
        explanation: '边际报酬递减意味着MP开始下降，但只要MP仍为正数，总产量TP就会继续上升，只是上升的速率变慢了。当MP降为0时，TP达到最大值。',
        difficulty: 'easy',
      },
      {
        id: 'f2',
        question: '在完全竞争市场中，企业的短期供给曲线是哪一部分？',
        options: ['整个边际成本（MC）曲线', '平均总成本（ATC）曲线以上的MC曲线', '平均可变成本（AVC）最低点以上的MC曲线', '平均固定成本（AFC）曲线以上的MC曲线'],
        correctIndex: 2,
        explanation: '完全竞争企业的短期供给曲线是边际成本曲线（MC）高于平均可变成本曲线（AVC）最低点的部分。当价格低于AVC最低点时，企业会选择停产。',
        difficulty: 'easy',
      },
      {
        id: 'f3',
        question: '在成本最小化问题中，最优投入组合满足的条件是：',
        options: ['MRTS等于要素价格之比', 'MRTS等于产量之比', '边际产量相等', '总成本等于总收入'],
        correctIndex: 0,
        explanation: '成本最小化的均衡条件是 MRTS(L,K) = w/r，即边际技术替代率等于劳动价格与资本价格之比，此时等产量线与等成本线相切。',
        difficulty: 'easy',
      },
      {
        id: 'f4',
        question: '以下关于长期平均成本（LAC）曲线的描述，正确的是：',
        options: ['LAC曲线始终低于短期平均成本（SAC）曲线', 'LAC曲线是所有短期平均成本曲线的下包络线', 'LAC曲线在规模报酬递增阶段向上倾斜', 'LAC曲线与长期边际成本（LMC）曲线不相交'],
        correctIndex: 1,
        explanation: 'LAC曲线是所有SAC曲线的下包络线（envelope curve），在每个产量水平上等于最低可能的短期平均成本。规模报酬递增阶段LAC向下倾斜，LMC从LAC最低点穿过。',
        difficulty: 'medium',
      },
      {
        id: 'f5',
        question: '完全竞争行业的长期均衡中，以下哪种情况必然成立？',
        options: ['P = MC = ATC（最低点）', 'P = MR > MC', 'P > ATC', 'P = MC > ATC'],
        correctIndex: 0,
        explanation: '完全竞争行业长期均衡：企业零利润 → P = ATC（最低点），且利润最大化条件 P = MC，因此三者相等，P = MC = min ATC。',
        difficulty: 'medium',
      },
    ]
  }

  // 微观经济学综合 / 全科模拟
  if (lower.includes('微观经济') || lower.includes('经济学')) {
    return [
      {
        id: 'f1',
        question: '囚徒困境中，两个囚徒都选择坦白的结果是：',
        options: ['纳什均衡，且是帕累托最优', '纳什均衡，但不是帕累托最优', '不是纳什均衡，但是帕累托最优', '既不是纳什均衡，也不是帕累托最优'],
        correctIndex: 1,
        explanation: '囚徒困境中（坦白，坦白）是纳什均衡，因为给定对方选择坦白，自己选择坦白是最优反应；但这个结果不是帕累托最优的，因为双方都抵赖可以获得更好的结果。',
        difficulty: 'easy',
      },
      {
        id: 'f2',
        question: '垄断厂商利润最大化时的定价规律是：',
        options: ['P = MC', 'P > MR = MC', 'P < MR = MC', 'P = ATC'],
        correctIndex: 1,
        explanation: '垄断厂商的边际收益MR小于价格P（因为需求曲线向下倾斜），利润最大化条件是MR=MC，因此定价满足 P > MR = MC。完全竞争才是 P=MC。',
        difficulty: 'easy',
      },
      {
        id: 'f3',
        question: '公共品导致市场失灵的根本原因是：',
        options: ['边际成本递减', '非排他性和非竞争性导致搭便车问题', '政府干预过多', '信息不对称'],
        correctIndex: 1,
        explanation: '公共品具有非排他性（无法排除他人使用）和非竞争性（一个人使用不影响他人使用），导致私人市场难以有效供给，出现搭便车问题，需要政府介入。',
        difficulty: 'easy',
      },
      {
        id: 'f4',
        question: '当正外部性存在时，自由市场的均衡产量与社会最优产量相比：',
        options: ['高于社会最优产量', '等于社会最优产量', '低于社会最优产量', '无法比较'],
        correctIndex: 2,
        explanation: '正外部性使社会边际收益（SMB）高于私人边际收益（PMB），自由市场只考虑私人收益，因此均衡产量低于社会最优产量。政府可通过补贴来纠正这一低效率。',
        difficulty: 'medium',
      },
      {
        id: 'f5',
        question: '逆向选择（Adverse Selection）问题产生的根本原因是：',
        options: ['买卖双方存在信息不对称，且拥有信息优势的一方在交易前隐瞒信息', '政府监管不力导致市场混乱', '买卖双方风险偏好不同', '商品供不应求导致价格上涨'],
        correctIndex: 0,
        explanation: '逆向选择源于交易前（事前）的信息不对称：拥有私人信息的一方（如保险中的高风险者）更愿意参与交易，导致市场中低质量商品或高风险者比例过高，如"柠檬市场"问题。',
        difficulty: 'medium',
      },
    ]
  }

  // 数据库 / SQL
  if (lower.includes('数据库') || lower.includes('sql')) {
    return [
      {
        id: 'f1',
        question: '在关系数据库中，第二范式（2NF）要求满足哪些条件？',
        options: ['仅满足1NF', '满足1NF且不存在非主属性对主键的部分函数依赖', '满足1NF且不存在传递函数依赖', '满足1NF且不存在多值依赖'],
        correctIndex: 1,
        explanation: '2NF要求：①满足1NF；②不存在非主属性对主键的部分函数依赖。传递依赖的消除是3NF的要求。',
        difficulty: 'easy',
      },
      {
        id: 'f2',
        question: 'SQL注入攻击的本质是利用了应用程序的什么缺陷？',
        options: ['数据库权限过大', '用户输入未经验证直接拼接进SQL语句', '网络传输未加密', '数据库未打补丁'],
        correctIndex: 1,
        explanation: 'SQL注入的核心原因是应用程序将用户输入直接拼接到SQL查询中，攻击者通过构造恶意输入改变SQL语句的语义。防御方法是参数化查询/预编译语句。',
        difficulty: 'easy',
      },
      {
        id: 'f3',
        question: '以下哪个SQL语句能正确查询每个部门的平均工资，且只显示平均工资大于5000的部门？',
        options: [
          'SELECT dept, AVG(salary) FROM emp WHERE AVG(salary) > 5000 GROUP BY dept',
          'SELECT dept, AVG(salary) FROM emp GROUP BY dept HAVING AVG(salary) > 5000',
          'SELECT dept, AVG(salary) FROM emp HAVING AVG(salary) > 5000',
          'SELECT dept, AVG(salary) FROM emp GROUP BY dept WHERE AVG(salary) > 5000',
        ],
        correctIndex: 1,
        explanation: 'WHERE 不能用于过滤聚合函数（AVG/SUM/COUNT等）的结果，必须用 HAVING。HAVING 在 GROUP BY 之后过滤分组结果。',
        difficulty: 'medium',
      },
      {
        id: 'f4',
        question: '事务的ACID特性中，"隔离性"（Isolation）的含义是：',
        options: ['事务一旦提交不可回滚', '事务执行中间状态不影响其他并发事务', '事务执行结果永久保存', '事务必须将数据库从一致状态转到另一致状态'],
        correctIndex: 1,
        explanation: '隔离性指并发执行的事务彼此隔离，一个事务的中间状态（未提交数据）对其他事务不可见。持久性=提交后永久保存，原子性=全或无，一致性=数据约束不被破坏。',
        difficulty: 'medium',
      },
      {
        id: 'f5',
        question: 'B+树索引与哈希索引相比，B+树的主要优势在于：',
        options: ['等值查询速度更快', '支持范围查询（如 age BETWEEN 20 AND 30）', '存储空间更小', '插入操作更快'],
        correctIndex: 1,
        explanation: '哈希索引的等值查询是O(1)，比B+树的O(log n)更快；但哈希索引不支持范围查询（因为哈希打乱了顺序），而B+树的叶子节点有序链表，天然支持范围查询。',
        difficulty: 'hard',
      },
    ]
  }

  // 编程 / 算法
  if (lower.includes('算法') || lower.includes('数据结构') || lower.includes('编程')) {
    return [
      {
        id: 'f1',
        question: '一个算法的时间复杂度为O(n log n)，以下哪种排序算法在最坏情况下能达到该复杂度？',
        options: ['冒泡排序', '快速排序', '归并排序', '选择排序'],
        correctIndex: 2,
        explanation: '归并排序在最坏、平均和最好情况下的时间复杂度都是O(n log n)。快速排序最坏是O(n²)，平均是O(n log n)。冒泡和选择排序最坏都是O(n²)。',
        difficulty: 'easy',
      },
      {
        id: 'f2',
        question: '在二叉搜索树（BST）中，中序遍历（In-order）得到的序列具有什么性质？',
        options: ['随机顺序', '降序排列', '升序排列', '按层排列'],
        correctIndex: 2,
        explanation: 'BST的中序遍历顺序是：左子树 → 根节点 → 右子树，这恰好会得到一个升序排列的序列。这是BST的重要性质。',
        difficulty: 'easy',
      },
      {
        id: 'f3',
        question: '动态规划与贪心算法的核心区别是：',
        options: ['动态规划更快，贪心算法更慢', '动态规划考虑所有子问题的最优解，贪心算法每步做局部最优选择', '贪心算法需要状态转移方程', '动态规划只能解决整数规划问题'],
        correctIndex: 1,
        explanation: '动态规划通过保存子问题的最优解（记忆化/递推表）保证全局最优；贪心算法每步做局部最优选择，不保证全局最优（但在满足贪心选择性质时全局最优）。',
        difficulty: 'medium',
      },
      {
        id: 'f4',
        question: '哈希表在理想情况下的平均查找时间复杂度是：',
        options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'],
        correctIndex: 0,
        explanation: '哈希表通过哈希函数直接定位存储位置，理想（冲突极少）情况下查找、插入、删除的平均时间复杂度均为O(1)。最坏情况（所有元素哈希冲突）退化为O(n)。',
        difficulty: 'easy',
      },
      {
        id: 'f5',
        question: '以下哪种图算法用于求带权图的单源最短路径，且要求所有边权重非负？',
        options: ['BFS', 'Dijkstra算法', 'Bellman-Ford算法', 'Floyd-Warshall算法'],
        correctIndex: 1,
        explanation: 'Dijkstra算法适用于边权非负的图，求单源最短路径，时间复杂度O((V+E)logV)。Bellman-Ford可处理负权边。Floyd-Warshall求所有点对最短路。BFS适合无权图。',
        difficulty: 'medium',
      },
    ]
  }

  // 未知主题不能伪造“看起来像测验”的通用题。
  return []
}

// ============================================================
// Types
// ============================================================
type AIWizardStep = 'goal' | 'status' | 'plan'

interface AIWizardState {
  step: AIWizardStep
  goalTitle: string
  goalContext: string
  attachments: GoalAttachment[]
  goalCategory?: GoalCategory          // 新增 Step 5：推断的目标分类
  extractedInfo?: Record<string, string> // 新增 Step 5：从提问回答中提取的结构化信息
  questions: string[]
  statusAnswers: string[]
  planResult: GoalPlanResult | null
  isLoading: boolean
  error: string | null
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 根据目标标题和上下文自动推断 GoalCategory
 * Step 5 新增
 */
function inferGoalCategory(goalTitle: string, goalContext?: string): GoalCategory {
  const text = `${goalTitle} ${goalContext || ''}`.toLowerCase()
  if (/考试|备考|复习迎考|冲刺|期末|期中|升学|考证/.test(text)) return 'exam'
  if (/健身|跑步|减脂|增肌|体脂|体能|运动|马拉松/.test(text)) return 'fitness'
  if (/英语|日语|法语|德语|韩语|西班牙语|口语|听力|词汇|背单词|语言/.test(text)) return 'language'
  if (/读书|阅读|看书|书籍|读完|书单/.test(text)) return 'reading'
  if (/求职|晋升|跳槽|职场|升职|加薪|职业/.test(text)) return 'career'
  if (/编程|python|java|前端|后端|代码|开发|算法|机器学习/.test(text)) return 'skill'
  if (/学习|课程|教材|课本|章节|上课|学期|学分/.test(text)) return 'study'
  return 'other'
}

/**
 * 从目标标题中提取时间约束天数（Bug 修复）
 * 优先从用户标题直接提取，不再完全依赖 AI 返回的 totalDays
 */
function extractDaysFromTitle(goalTitle: string, goalContext?: string): number | null {
  const text = `${goalTitle} ${goalContext || ''}`

  // 精确匹配："一周"、"两周"、"三天"、"一个月"等
  const weekMatch = text.match(/(\d+|[一二两三四五六七八九十])\s*个?\s*(星期|周)/)
  if (weekMatch) {
    const cn = '一二两三四五六七八九十'.indexOf(weekMatch[1])
    const num = cn >= 0 ? (cn === 2 ? 2 : cn + 1) : parseInt(weekMatch[1], 10)
    if (!isNaN(num) && num > 0) return num * 7
  }

  const dayMatch = text.match(/(\d+|[一二两三四五六七八九十])\s*个?\s*天/)
  if (dayMatch) {
    const cn = '一二两三四五六七八九十'.indexOf(dayMatch[1])
    const num = cn >= 0 ? (cn === 2 ? 2 : cn + 1) : parseInt(dayMatch[1], 10)
    if (!isNaN(num) && num > 0) return num
  }

  const monthMatch = text.match(/(\d+|[一二两三四五六七八九十])\s*个?\s*(月|个月)/)
  if (monthMatch) {
    const cn = '一二两三四五六七八九十'.indexOf(monthMatch[1])
    const num = cn >= 0 ? (cn === 2 ? 2 : cn + 1) : parseInt(monthMatch[1], 10)
    if (!isNaN(num) && num > 0) return num * 30
  }

  // 特殊关键词
  if (/暑假|暑期|夏天/.test(text)) return 60
  if (/寒假/.test(text)) return 30
  if (/半年/.test(text)) return 180
  if (/一年/.test(text)) return 365
  if (/学期末|期末考试前/.test(text)) return 30

  return null
}

// ============================================================
// Main Page
// ============================================================
export function GoalsPage() {
  const {
    goals, addGoal, updateGoal, deleteGoal,
    toggleSubGoal, resetDailyTasks,
    stopDailyTask, syncError, clearSyncError,
  } = useGoalsStore()

  // State
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const goalsVersion = useGoalRuntime({ goals, stopDailyTask, resetDailyTasks })

  // Dialog
  const [showNewGoalDialog, setShowNewGoalDialog] = useState(false)
  const [showSmartCreateDialog, setShowSmartCreateDialog] = useState(false)
  const [newGoal, setNewGoal] = useState({
    title: '', description: '', context: '', category: 'study' as GoalCategory,
    priority: 'medium' as GoalPriority, endDate: '',
    subGoals: [{ title: '' }],
    attachments: [] as GoalAttachment[],
  })

  // AI wizard
  const [wizardState, setWizardState] = useState<AIWizardState>({
    step: 'goal', goalTitle: '', goalContext: '', attachments: [],
    questions: [], statusAnswers: [],
    planResult: null, isLoading: false, error: null,
  })

  // 移动端适配
  const isMobile = useIsMobile()
  const [mobileTab, setMobileTab] = useState<'list' | 'detail' | 'alice'>('list')

  // CG 展示状态
  const [cgState, setCgState] = useState<{ open: boolean; goalTitle: string }>({ open: false, goalTitle: '' })

  /** 目标完成时的统一回调：CG 展示 */
  const handleGoalComplete = (goalId: string, goalTitle: string) => {
    updateGoal(goalId, { status: 'completed', progress: 100 })
    setCgState({ open: true, goalTitle })
  }

  // 考核验证
  const [quizState, setQuizState] = useState<{
    open: boolean
    goalId: string
    subGoalId: string
    subGoalTitle: string
    questions: QuizQuestion[]
    currentIdx: number
    answers: number[]
    isLoading: boolean
    error: string | null
    result: 'pass' | 'fail' | null
  }>({
    open: false, goalId: '', subGoalId: '', subGoalTitle: '',
    questions: [], currentIdx: 0, answers: [],
    isLoading: false, error: null, result: null,
  })

  // 最终测验状态
  const [finalExamOpen, setFinalExamOpen] = useState(false)
  const [finalExamGoalId, setFinalExamGoalId] = useState<string | null>(null)

  // Selected goal
  const selectedGoal = goals.find(g => g.id === selectedGoalId) || null

  // Handlers
  const handleStartQuiz = async (goalId: string, subGoalId: string, subGoalTitle: string) => {
    setQuizState({
      open: true, goalId, subGoalId, subGoalTitle,
      questions: [], currentIdx: 0, answers: [],
      isLoading: true, error: null, result: null,
    })
    try {
      const goal = goals.find(g => g.id === goalId) || null
      const goalContext = goal ? buildGoalContextString(goal) : ''
      const raw = await generateQuizQuestions({ topic: subGoalTitle, difficulty: 'easy', count: 5, goalContext, goalCategory: goal?.category })
      const parsed = JSON.parse(raw) as { questions?: QuizQuestion[] }
      const questions: QuizQuestion[] = (parsed.questions || []).map((q, i: number) => ({
        id: q.id || `q${i}`,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        difficulty: 'easy' as const,
      }))
      if (questions.length === 0) throw new Error('未生成题目')
      setQuizState(prev => ({ ...prev, questions, isLoading: false }))
    } catch {
      // Fallback：当AI服务不可用时，根据子目标标题提供有实质知识点的硬编码题目，杜绝自我评估题
      const fallbackQuestions = getSubjectFallbackQuestions(subGoalTitle)
      setQuizState(prev => ({
        ...prev,
        questions: fallbackQuestions,
        isLoading: false,
        error: fallbackQuestions.length > 0 ? null : '当前无法生成可靠题目，请稍后重试。你的子目标状态不会被修改。',
      }))
    }
  }

  const handleQuizComplete = () => {
    const { goalId, subGoalId, answers, questions } = quizState
    const correctCount = answers.filter((a, i) => a === questions[i]?.correctIndex).length
    const passed = correctCount >= Math.ceil(questions.length * 0.6)
    if (passed) {
      const goal = goals.find(g => g.id === goalId)
      if (goal) {
        toggleSubGoal(goalId, subGoalId)
        const updated = goal.subGoals.map(sg => sg.id === subGoalId ? { ...sg, completed: true } : sg)
        const completedCount = updated.filter(sg => sg.completed).length
        const newProgress = updated.length > 0 ? Math.round((completedCount / updated.length) * 100) : 0
        if (newProgress === 100 && goal.progress < 100) {
          handleGoalComplete(goalId, goal.title)
        } else {
          updateGoal(goalId, { progress: newProgress })
        }
      }
      setQuizState(prev => ({ ...prev, result: 'pass' }))
    } else {
      setQuizState(prev => ({ ...prev, result: 'fail' }))
    }
  }

  const handleGenerateFinalExam = (goalId: string) => {
    setFinalExamGoalId(goalId)
    setFinalExamOpen(true)
  }

  const handleCreateGoal = async () => {    if (!newGoal.title || !newGoal.endDate) return
    const subGoals = newGoal.subGoals.filter(sg => sg.title.trim()).map(sg => ({
      id: generateId(), goalId: '', title: sg.title, completed: false,
    }))
    const createdGoal = await addGoal({
      title: newGoal.title, description: newGoal.description,
      context: newGoal.context || undefined,
      attachments: newGoal.attachments,
      status: 'active', priority: newGoal.priority,
      startDate: new Date().toISOString(),
      endDate: new Date(newGoal.endDate).toISOString(),
      subGoals, category: newGoal.category,
    })
    if (createdGoal && newGoal.attachments.some(attachment => attachment.type === 'document' && attachment.extractedText)) {
      const sourceGoal = { ...createdGoal, attachments: newGoal.attachments }
      const courseModel = analyzeGoalCourse(sourceGoal, createdGoal.userId || 'local-user')
      updateGoal(createdGoal.id, projectContinuityPlanToGoal(courseModel, sourceGoal))
    }
    setNewGoal({ title: '', description: '', context: '', category: 'study', priority: 'medium', endDate: '', subGoals: [{ title: '' }], attachments: [] })
    setShowNewGoalDialog(false)
  }

  // 从附件中提取文字内容，供 AI 函数使用
  const extractAttachmentTexts = (attachments: GoalAttachment[]): string[] => {
    return attachments
      .filter(a => a.type === 'document' && a.extractedText)
      .map(a => `[${a.name}]\n${a.extractedText}`)
  }

  const handleSubmitGoalForSmartCreate = async () => {
    if (!wizardState.goalTitle.trim()) return
    setWizardState(prev => ({ ...prev, isLoading: true, error: null }))
    try {
      const attachmentTexts = extractAttachmentTexts(wizardState.attachments)
      // Step 5: 自动推断分类，并在提问时传入
      const inferredCategory = inferGoalCategory(wizardState.goalTitle, wizardState.goalContext)
      const result = await generateStatusQuestions(
        wizardState.goalTitle,
        wizardState.goalContext || undefined,
        attachmentTexts.length > 0 ? attachmentTexts : undefined,
        inferredCategory,
      )
      setWizardState(prev => ({
        ...prev,
        step: 'status',
        goalCategory: inferredCategory,
        extractedInfo: result.extractedInfo,
        questions: result.questions,
        statusAnswers: new Array(result.questions.length).fill(''),
        isLoading: false,
      }))
    } catch {
      setWizardState(prev => ({ ...prev, isLoading: false, error: '生成问题失败，请重试' }))
    }
  }

  const handleSubmitStatusAnswers = async () => {
    // 将问题和答案配对，构建结构化状态文本（避免 AI 无法区分哪个问题对应哪个答案）
    const qaPairs = wizardState.questions.map((q, i) => {
      const answer = wizardState.statusAnswers[i]?.trim() || '（未回答）'
      return `【${q}】\n→ ${answer}`
    })
    const statusText = qaPairs.join('\n\n')
    if (!wizardState.statusAnswers.some(a => a.trim())) return
    setWizardState(prev => ({ ...prev, isLoading: true, error: null }))
    try {
      const attachmentTexts = extractAttachmentTexts(wizardState.attachments)
      // Step 5: 传入推断的分类和提取的结构化信息
      const result = await generateGoalPlan(
        wizardState.goalTitle,
        statusText,
        wizardState.goalContext || undefined,
        attachmentTexts.length > 0 ? attachmentTexts : undefined,
        wizardState.goalCategory,
        wizardState.extractedInfo,
      )
      setWizardState(prev => ({ ...prev, step: 'plan', planResult: result, isLoading: false }))
    } catch (err: unknown) {
      console.error('[SmartCreate] 生成计划失败:', err)
      const msg = err instanceof Error ? err.message : String(err)
      // 如果错误信息包含 JSON 或 token/截断等关键词，给出更具体的提示
      const isTruncated = msg.includes('JSON') || msg.includes('Unexpected') || msg.includes('token')
      setWizardState(prev => ({
        ...prev,
        isLoading: false,
        error: isTruncated
          ? 'AI 生成的计划不完整（内容过长被截断），请减少附件数量后重试'
          : '生成计划失败，请重试',
      }))
    }
  }

  const handleConfirmAndCreateGoal = async () => {
    if (!wizardState.planResult) return
    let checkedPlan: GoalPlanResult
    try {
      checkedPlan = normalizeGoalPlan(wizardState.planResult)
      const blockingIssues = auditGoalPlan(
        checkedPlan,
        wizardState.attachments.some(item => item.type === 'document' && Boolean(item.extractedText)),
      ).filter(issue => issue.severity === 'error')
      if (blockingIssues.length > 0) {
        setWizardState(prev => ({ ...prev, error: blockingIssues[0].message }))
        return
      }
    } catch (error) {
      setWizardState(prev => ({ ...prev, error: error instanceof Error ? error.message : '计划校验失败，请修改后重试' }))
      return
    }
    // Bug 修复：endDate 从标题提取时间约束作为首选，不再完全依赖 AI 返回的 totalDays
    const titleExtractedDays = extractDaysFromTitle(wizardState.goalTitle, wizardState.goalContext)
    const totalDays = titleExtractedDays ?? checkedPlan.totalDays ?? 30
    const endDate = new Date(); endDate.setDate(endDate.getDate() + totalDays)
    // Step 5: 写入所有 AI 增强字段（dayIndex / subGoalIndex / difficultyLevel / resourceReference / checklist）
    const subGoals = checkedPlan.subGoals.map(sg => ({
      id: generateId(), goalId: '',
      title: sg.title, completed: false,
      // 额外字段（description / dayRange）通过其他方式存储，或暂时记录在 description 中
      ...(sg.description ? { description: sg.description } : {}),
      ...(sg.dayRange ? { dayRange: sg.dayRange } : {}),
    }))
    const dailyTasks: DailyTask[] = checkedPlan.dailyTasks.map((task, idx) => ({
      id: generateId(), goalId: '',
      title: task.title,
      description: task.description,
      duration: task.duration,
      // AI 计划中的 dayIndex 表示一次性日程，不是每天重复任务。
      frequency: 'custom',
      completed: false, orderIndex: idx,
      // Step 5 新增字段
      dayIndex: task.dayIndex,
      subGoalIndex: task.subGoalIndex,
      difficultyLevel: (task.difficultyLevel as 'easy' | 'medium' | 'hard') || undefined,
      resourceReference: task.resourceReference,
      checklist: task.checklist,
    }))
    const createdGoal = await addGoal({
      title: wizardState.goalTitle,
      description: `当前状态：${checkedPlan.currentStatus}`,
      context: wizardState.goalContext || undefined,
      attachments: wizardState.attachments.length > 0 ? wizardState.attachments : undefined,
      status: 'active', priority: 'medium' as GoalPriority,
      category: wizardState.goalCategory || 'other',
      startDate: new Date().toISOString(), endDate: endDate.toISOString(),
      subGoals, currentStatus: checkedPlan.currentStatus, dailyTasks,
    })
    if (createdGoal && wizardState.attachments.some(attachment => attachment.type === 'document' && attachment.extractedText)) {
      const sourceGoal = { ...createdGoal, attachments: wizardState.attachments, subGoals, dailyTasks }
      const courseModel = analyzeGoalCourse(sourceGoal, createdGoal.userId || 'local-user')
      updateGoal(createdGoal.id, projectContinuityPlanToGoal(courseModel, sourceGoal))
    }
    setShowSmartCreateDialog(false)
    setWizardState({ step: 'goal', goalTitle: '', goalContext: '', attachments: [], questions: [], statusAnswers: [], planResult: null, isLoading: false, error: null })
  }

  const formatTimeDisplay = (seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const mobileTabClass = (tab: string) =>
    cn(
      'flex-1 py-3 text-center text-sm font-medium transition-colors border-b-2',
      mobileTab === tab
        ? 'border-sakura text-sakura'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    )

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <>
      {syncError && (
        <div
          role="alert"
          className="fixed right-5 top-5 z-[100] flex max-w-sm items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg"
        >
          <span className="mt-0.5" aria-hidden="true">⚠️</span>
          <span className="flex-1">{syncError}</span>
          <button type="button" onClick={clearSyncError} className="text-amber-700 hover:text-amber-950" aria-label="关闭同步提示">×</button>
        </div>
      )}
      {isMobile ? (
        /* ========== 移动端单栏布局 ========== */
        <div className="h-[calc(100vh-7.5rem)] flex flex-col animate-in">
          {/* Mobile Tab Switcher */}
          <div className="flex bg-white/80 backdrop-blur-sm border-b border-pink-200/20 shrink-0">
            <button onClick={() => setMobileTab('list')} className={mobileTabClass('list')}>
              目标列表
            </button>
            <button
              onClick={() => selectedGoal && setMobileTab('detail')}
              className={cn(mobileTabClass('detail'), !selectedGoal && 'opacity-40')}
            >
              详情
            </button>
            <button onClick={() => setMobileTab('alice')} className={mobileTabClass('alice')}>
              艾莉丝
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            {mobileTab === 'list' && (
              <GoalListPanel
                goals={goals}
                selectedGoalId={selectedGoalId}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onSelectGoal={(id) => { setSelectedGoalId(id); setMobileTab('detail') }}
                onNewGoal={() => setShowNewGoalDialog(true)}
                onSmartCreate={() => {
                  setShowSmartCreateDialog(true)
                  setWizardState({ step: 'goal', goalTitle: '', goalContext: '', attachments: [], questions: [], statusAnswers: [], planResult: null, isLoading: false, error: null })
                }}
              />
            )}

            {mobileTab === 'detail' && (
              selectedGoal ? (
                <GoalDetailPanel
                  selectedGoal={selectedGoal}
                  goalsVersion={goalsVersion}
                  onStartQuiz={handleStartQuiz}
                  onShowNewGoal={() => setShowNewGoalDialog(true)}
                  onShowSmartCreate={() => {
                    setShowSmartCreateDialog(true)
                    setWizardState({ step: 'goal', goalTitle: '', goalContext: '', attachments: [], questions: [], statusAnswers: [], planResult: null, isLoading: false, error: null })
                  }}
                  onDeleteGoal={(goalId) => {
                    deleteGoal(goalId)
                    setSelectedGoalId(null)
                    setMobileTab('list')
                  }}
                  onGoalComplete={handleGoalComplete}
                  formatTimeDisplay={formatTimeDisplay}
                  onGenerateFinalExam={handleGenerateFinalExam}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 px-4">
                  <span className="text-5xl">📋</span>
                  <p className="text-sm">请先在「目标列表」中选择一个目标</p>
                  <button
                    onClick={() => setMobileTab('list')}
                    className="text-sm text-sakura underline underline-offset-2"
                  >
                    前往列表
                  </button>
                </div>
              )
            )}

            {mobileTab === 'alice' && (
              <AliceChatPanel selectedGoal={selectedGoal} />
            )}
          </div>
        </div>
      ) : (
        /* ========== 桌面端三栏布局 ========== */
        <div className="h-[calc(100vh-7.5rem)] flex gap-4 animate-in goals-dashboard">
          {/* LEFT — 目标列表 */}
          <GoalListPanel
            goals={goals}
            selectedGoalId={selectedGoalId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectGoal={setSelectedGoalId}
            onNewGoal={() => setShowNewGoalDialog(true)}
            onSmartCreate={() => {
              setShowSmartCreateDialog(true)
              setWizardState({ step: 'goal', goalTitle: '', goalContext: '', attachments: [], questions: [], statusAnswers: [], planResult: null, isLoading: false, error: null })
            }}
          />

          {/* CENTER — 目标详情 */}
          <GoalDetailPanel
            selectedGoal={selectedGoal}
            goalsVersion={goalsVersion}
            onStartQuiz={handleStartQuiz}
            onShowNewGoal={() => setShowNewGoalDialog(true)}
            onShowSmartCreate={() => {
              setShowSmartCreateDialog(true)
              setWizardState({ step: 'goal', goalTitle: '', goalContext: '', attachments: [], questions: [], statusAnswers: [], planResult: null, isLoading: false, error: null })
            }}
            onDeleteGoal={(goalId) => {
              deleteGoal(goalId)
              setSelectedGoalId(null)
            }}
            onGoalComplete={handleGoalComplete}
            formatTimeDisplay={formatTimeDisplay}
            onGenerateFinalExam={handleGenerateFinalExam}
          />

          {/* RIGHT — 艾莉丝聊天 */}
          <AliceChatPanel selectedGoal={selectedGoal} />
        </div>
      )}

      {/* ====== DIALOGS（移动端/桌面端共享） ====== */}

      {/* New Goal Dialog */}
      <NewGoalDialog
        open={showNewGoalDialog}
        onOpenChange={setShowNewGoalDialog}
        newGoal={newGoal}
        setNewGoal={setNewGoal}
        onCreateGoal={handleCreateGoal}
      />

      {/* Smart Create Dialog */}
      <SmartCreateDialog
        open={showSmartCreateDialog}
        onOpenChange={setShowSmartCreateDialog}
        wizardState={wizardState}
        setWizardState={setWizardState}
        onSubmitGoal={handleSubmitGoalForSmartCreate}
        onSubmitStatus={handleSubmitStatusAnswers}
        onConfirmAndCreate={handleConfirmAndCreateGoal}
      />

      {/* Quiz Dialog */}
      <QuizDialog
        quizState={quizState}
        setQuizState={setQuizState}
        onStartQuiz={handleStartQuiz}
        onQuizComplete={handleQuizComplete}
      />

      {/* CG Complete Dialog */}
      <CgDialog
        open={cgState.open}
        onClose={() => setCgState({ open: false, goalTitle: '' })}
        goalTitle={cgState.goalTitle}
      />

      {/* Final Exam Dialog */}
      {finalExamGoalId && (() => {
        const examGoal = goals.find(g => g.id === finalExamGoalId)
        return examGoal ? (
          <FinalExamDialog
            open={finalExamOpen}
            onOpenChange={(open) => {
              setFinalExamOpen(open)
              if (!open) setFinalExamGoalId(null)
            }}
            goalTitle={examGoal.title}
            goalContext={examGoal.context}
            goalCategory={examGoal.category}
            attachments={examGoal.attachments}
          />
        ) : null
      })()}
    </>
  )
}
