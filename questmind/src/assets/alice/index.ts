/**
 * 艾莉丝表情系统
 *
 * 表情文件命名规则：alice-{expression}.png
 * 将对应的表情图片放入 src/assets/alice/ 目录即可
 *
 * 表情列表（8种）：
 * - alice-happy.png    → 开心/微笑
 * - alice-shy.png      → 害羞/温柔
 * - alice-angry.png    → 生气/严肃
 * - alice-surprised.png→ 惊讶
 * - alice-sleepy.png   → 困倦/打盹
 * - alice-thinking.png → 思考/认真
 * - alice-proud.png    → 得意/骄傲
 * - alice-sad.png      → 失落/心疼
 *
 * 无特殊表情时使用默认头像 alice-character.png
 */

// 表情类型（null 表示无特殊表情，使用默认头像）
export type AliceExpression =
  | 'happy'     // 开心/微笑
  | 'shy'       // 害羞/温柔
  | 'angry'     // 生气/严肃
  | 'surprised' // 惊讶
  | 'sleepy'    // 困倦/打盹
  | 'thinking'  // 思考/认真
  | 'proud'     // 得意/骄傲
  | 'sad'       // 失落/心疼

// 表情显示信息
export interface ExpressionInfo {
  id: AliceExpression
  label: string    // 中文描述
  emoji: string    // 对应 emoji
  keywords: string[] // AI 回复中触发此表情的关键词
}

// 所有表情定义
export const ALICE_EXPRESSIONS: Record<AliceExpression, ExpressionInfo> = {
  happy: {
    id: 'happy',
    label: '开心',
    emoji: '😊',
    keywords: ['恭喜', '太好了', '做得好', '出色', '优秀', '完美', '成功', '达成', '嘉奖', '值得', '棒', '厉害', '不错'],
  },
  shy: {
    id: 'shy',
    label: '害羞',
    emoji: '😳',
    keywords: ['收下了', '过奖', '谢谢', '没想到', '嗯……', '能帮到你就好'],
  },
  angry: {
    id: 'angry',
    label: '严肃',
    emoji: '😤',
    keywords: ['不可', '不允许', '偷懒', '必须', '不应该', '不能逃避', '不赞成', '严厉'],
  },
  surprised: {
    id: 'surprised',
    label: '惊讶',
    emoji: '😮',
    keywords: ['竟然', '没想到', '真是', '居然', '出乎意料', '难得'],
  },
  sleepy: {
    id: 'sleepy',
    label: '困倦',
    emoji: '😴',
    keywords: ['晚安', '休息', '熬夜', '该睡了', '早点睡', '已经很晚'],
  },
  thinking: {
    id: 'thinking',
    label: '思考',
    emoji: '🤔',
    keywords: ['整理', '分析', '建议', '考虑', '计划', '优先级', '拆解', '安排'],
  },
  proud: {
    id: 'proud',
    label: '得意',
    emoji: '😏',
    keywords: ['当然', '自然', '毫无疑问', '如我所料', '果然', '做得很好', '很棒'],
  },
  sad: {
    id: 'sad',
    label: '心疼',
    emoji: '🥺',
    keywords: ['失败', '遗憾', '没关系', '不要紧', '重新', '可惜', '辛苦', '不容易'],
  },
}

// 静态导入默认头像
import defaultImg from '@/assets/alice-character.png'

// 使用 import.meta.glob 预加载所有表情图片
const expressionModules = import.meta.glob<{ default: string }>(
  '@/assets/alice/alice-*.png',
  { eager: true }
)

// 解析已加载的表情图片映射
function buildExpressionImageMap(): Record<AliceExpression, string> {
  const images: Record<string, string> = {}

  // 从 glob 结果中提取表情 ID
  for (const [path, module] of Object.entries(expressionModules)) {
    const match = path.match(/alice-(happy|shy|angry|surprised|sleepy|thinking|proud|sad)\.png$/)
    if (match) {
      images[match[1]] = module.default
    }
  }

  // 对没有对应图片的表情，fallback 到默认头像
  const allExpressions: AliceExpression[] = [
    'happy', 'shy', 'angry', 'surprised',
    'sleepy', 'thinking', 'proud', 'sad'
  ]

  for (const id of allExpressions) {
    if (!images[id]) {
      images[id] = defaultImg
    }
  }

  return images as Record<AliceExpression, string>
}

// 预构建表情图片映射（只构建一次）
const EXPRESSION_IMAGES = buildExpressionImageMap()

// 获取表情图片
export function getExpressionImages(): Record<AliceExpression, string> {
  return EXPRESSION_IMAGES
}

// 根据场景/互动行为获取表情（null 表示无特殊表情）
export function getExpressionForAction(action: string): AliceExpression | null {
  const actionMap: Record<string, AliceExpression | null> = {
    feed: 'happy',       // 准备下午茶 → 开心
    play: 'proud',       // 切磋训练 → 得意
    read: 'thinking',    // 一起学习 → 思考
    sleep: 'sleepy',     // 让她休息 → 困倦
    wake: 'surprised',   // 叫醒她 → 惊讶
    chat: null,          // 聊天 → 无特殊表情
    travel: 'proud',     // 巡逻 → 得意
  }
  return actionMap[action] ?? null
}

// 根据 companionState 获取表情
export function getExpressionForState(state: string): AliceExpression | null {
  const stateMap: Record<string, AliceExpression | null> = {
    idle: null,
    sleeping: 'sleepy',
    eating: 'happy',
    reading: 'thinking',
    playing: 'proud',
    traveling: 'proud',
  }
  return stateMap[state] ?? null
}

// 根据 AI 回复内容推断表情（null 表示无匹配关键词）
export function inferExpressionFromReply(reply: string): AliceExpression | null {
  let bestMatch: AliceExpression | null = null
  let bestScore = 0

  for (const [exprId, info] of Object.entries(ALICE_EXPRESSIONS)) {
    let score = 0
    for (const keyword of info.keywords) {
      if (reply.includes(keyword)) {
        score += 1
      }
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = exprId as AliceExpression
    }
  }

  return bestMatch
}

// 表情切换后的自动恢复时间（毫秒）
export const EXPRESSION_RESET_DELAY = 5000

export default {
  ALICE_EXPRESSIONS,
  getExpressionImages,
  getExpressionForAction,
  getExpressionForState,
  inferExpressionFromReply,
  EXPRESSION_RESET_DELAY,
}
