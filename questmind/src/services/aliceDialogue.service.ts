import type {
  AIMessage,
  AliceConversationState,
  AliceDialogueAct,
  AliceLearningMode,
  AliceResponseDepth,
  AliceResponseObjective,
  AliceScene,
  AliceSocialIntent,
  AliceVoiceState,
  DailyTask,
  Goal,
} from '@/types'
import { getCurrentTimeContext } from '@/lib/timeContext'
import {
  buildRelationshipContext,
  type RelationshipContext,
} from '@/services/aliceRelationship.service'

export interface AliceMemory {
  global: string[]
  home: string[]
  goals: Record<string, GoalMemory>
}

export interface GoalMemory {
  currentStage?: string
  currentTopic?: string
  completedTasks: string[]
  pendingTasks: string[]
  knowledgeMastery: Record<string, number>
  mistakes: string[]
  confusionPoints: string[]
  recentAttempts: string[]
  reviewItems: string[]
  nextAction?: string
}

export interface AliceDialogueDecision {
  literalIntent: string
  socialIntent: AliceSocialIntent
  emotion: string
  scene: AliceScene
  dialogueAct: AliceDialogueAct
  goal: string
  returnToGoal: boolean
  learningMode?: AliceLearningMode
  objective: AliceResponseObjective
  responseDepth: AliceResponseDepth
  voiceState: AliceVoiceState
  focus: string
  uncertainty?: string
  initiativeLevel: number
}

export interface AliceContext {
  scene: AliceScene
  user: { id: string; name: string }
  globalMemory: string[]
  sceneMemory: string[] | GoalMemory
  activeGoal?: Goal
  activeTask?: DailyTask
  currentTopic?: string
  recentMessages: AIMessage[]
  conversationState: AliceConversationState
  relationship: RelationshipContext
}

const MEMORY_KEY = 'questmind:alice-memory-v2'
const STATE_KEY = 'questmind:alice-conversation-state-v2'

const emptyGoalMemory = (): GoalMemory => ({
  completedTasks: [], pendingTasks: [], knowledgeMastery: {}, mistakes: [],
  confusionPoints: [], recentAttempts: [], reviewItems: [],
})

export function loadAliceMemory(): AliceMemory {
  try {
    const parsed = JSON.parse(localStorage.getItem(MEMORY_KEY) || '{}') as Partial<AliceMemory>
    return { global: parsed.global || [], home: parsed.home || [], goals: parsed.goals || {} }
  } catch {
    return { global: [], home: [], goals: {} }
  }
}

export function saveAliceMemory(memory: AliceMemory): void {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(memory))
}

function stateKey(scene: AliceScene, goalId?: string): string {
  return scene === 'GOAL' ? `GOAL:${goalId || 'none'}` : 'HOME'
}

export function loadConversationState(scene: AliceScene, goalId?: string): AliceConversationState {
  try {
    const states = JSON.parse(localStorage.getItem(STATE_KEY) || '{}') as Record<string, AliceConversationState>
    return states[stateKey(scene, goalId)] || { scene, goalId }
  } catch {
    return { scene, goalId }
  }
}

export function saveConversationState(state: AliceConversationState): void {
  let states: Record<string, AliceConversationState> = {}
  try { states = JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch { /* reset invalid state */ }
  states[stateKey(state.scene, state.goalId)] = state
  localStorage.setItem(STATE_KEY, JSON.stringify(states))
}

/** 只选择当前场景的历史；GOAL 还必须匹配当前 goalId。 */
export function selectSceneHistory(messages: AIMessage[], scene: AliceScene, goalId?: string, limit = 24): AIMessage[] {
  return messages.filter(message => {
    if (message.scene !== scene) return false
    return scene === 'HOME' || message.goalId === goalId
  }).slice(-limit)
}

export function buildAliceContext(input: {
  scene: AliceScene
  user: { id: string; name: string }
  goal?: Goal
  messages: AIMessage[]
}): AliceContext {
  const memory = loadAliceMemory()
  const goalId = input.goal?.id
  const state = loadConversationState(input.scene, goalId)
  const activeTask = input.goal?.dailyTasks?.find(task => task.isRunning)
    || input.goal?.dailyTasks?.find(task => !task.completed)
  const currentTopic = state.currentTopic
    || input.goal?.subGoals?.find(item => !item.completed)?.title
    || activeTask?.title
  const latestUserMessage = [...input.messages].reverse().find(message => message.isUser)?.content || ''
  const relationship = buildRelationshipContext({
    userId: input.user.id,
    scene: input.scene,
    goalId,
    message: latestUserMessage,
  })

  return {
    scene: input.scene,
    user: input.user,
    globalMemory: memory.global,
    sceneMemory: input.scene === 'HOME' ? memory.home : (memory.goals[goalId || ''] || emptyGoalMemory()),
    activeGoal: input.goal,
    activeTask,
    currentTopic,
    recentMessages: selectSceneHistory(input.messages, input.scene, goalId),
    conversationState: { ...state, scene: input.scene, goalId, currentTopic, progress: input.goal?.progress },
    relationship,
  }
}

export function decideAliceAction(message: string, context: AliceContext): AliceDialogueDecision {
  const text = message.trim()
  const frustrated = /烦|难受|崩溃|不想|累|卡住|不会|没懂|没听懂|不理解/.test(text)
  const next = /懂了|明白了|下一|继续|接着/.test(text)
  const question = /为什么|怎么|如何|哪|什么|？|\?/.test(text)
  const learning = /学习|题|公式|概念|章节|知识|解释|例子|练习|考试|参数化|积分/.test(text)
  // “这里为什么/这一步怎么做”依赖当前目标上下文，不应因未重复知识点名称而被误判为偏题。
  const taskReference = /这里|这个|这一步|上面|刚才|当前|为什么|怎么做|如何做/.test(text)
  const offTopic = context.scene === 'GOAL' && !learning && !next && !frustrated && !taskReference
  const tiny = /^(算了|行|好|嗯|哦|不了|没事|随便|知道了)[。！!…~]*$/.test(text)
  const celebrate = /太好了|成功了|过了|做完了|搞定了|开心|哈哈/.test(text)
  const vent = frustrated || /气死|离谱|无语|糟透|受够|烦死/.test(text)
  const socialIntent: AliceSocialIntent = tiny ? 'SILENCE_FILL'
    : celebrate ? 'CELEBRATE'
      : vent ? (/烦|气|离谱|无语|受够/.test(text) ? 'VENT' : 'SEEK_COMPANY')
        : question ? 'QUESTION'
          : 'SHARE'
  const focus = text.slice(0, 160) || context.conversationState.primaryFocus || context.currentTopic || 'current conversation'

  if (context.scene === 'HOME') {
    return {
      literalIntent: question ? 'question' : 'statement', socialIntent,
      emotion: frustrated ? 'low_or_frustrated' : 'neutral',
      scene: 'HOME', dialogueAct: tiny ? 'ACKNOWLEDGE' : frustrated ? 'EMPATHIZE' : 'CASUAL_CHAT',
      goal: 'maintain_natural_companion_conversation', returnToGoal: false,
      objective: tiny ? 'WAIT' : vent ? 'ACCOMPANY' : celebrate ? 'LIGHTEN' : question ? 'EXPLORE' : 'UNDERSTAND',
      responseDepth: tiny ? 'TINY' : vent ? 'SHORT' : 'NORMAL',
      voiceState: vent ? 'SOFT' : celebrate ? 'HAPPY' : 'RELAXED',
      focus, initiativeLevel: 0.3,
    }
  }
  if (next) return {
    literalIntent: 'continue_learning', socialIntent: 'REQUEST', emotion: 'confident', scene: 'GOAL', dialogueAct: 'TRANSITION',
    goal: 'move_to_next_topic_without_repeating', returnToGoal: false, learningMode: 'EXPLAIN',
    objective: 'ADVANCE', responseDepth: 'NORMAL', voiceState: 'FOCUSED', focus, initiativeLevel: 0.7,
  }
  if (offTopic) return {
    literalIntent: 'casual_chat', socialIntent, emotion: 'neutral', scene: 'GOAL', dialogueAct: 'ACKNOWLEDGE_AND_REDIRECT',
    goal: 'brief_social_response_then_continue_active_task', returnToGoal: true,
    objective: 'ADVANCE', responseDepth: tiny ? 'TINY' : 'SHORT', voiceState: 'FOCUSED', focus, initiativeLevel: 0.7,
  }
  return {
    literalIntent: question || frustrated ? 'learning_help' : 'task_progress', socialIntent,
    emotion: frustrated ? 'mild_frustration' : 'neutral', scene: 'GOAL',
    dialogueAct: frustrated ? 'EMPATHIZE' : question ? 'EXPLAIN' : 'EXECUTE',
    goal: frustrated ? 'identify_and_resolve_exact_confusion' : 'advance_current_task',
    returnToGoal: false, learningMode: question ? 'EXPLAIN' : 'PRACTICE',
    objective: frustrated ? 'UNDERSTAND' : question ? 'TEACH' : 'ADVANCE',
    responseDepth: frustrated ? 'SHORT' : question ? 'DEEP' : 'NORMAL',
    voiceState: frustrated ? 'CONCERNED' : 'FOCUSED', focus, initiativeLevel: 0.7,
  }
}

export function updateConversationState(context: AliceContext, decision: AliceDialogueDecision, userMessage: string): void {
  saveConversationState({
    ...context.conversationState,
    userIntent: decision.literalIntent,
    userEmotion: decision.emotion,
    socialIntent: decision.socialIntent,
    objective: decision.objective,
    responseDepth: decision.responseDepth,
    voiceState: decision.voiceState,
    secondaryFocus: context.conversationState.primaryFocus !== decision.focus
      ? context.conversationState.primaryFocus : context.conversationState.secondaryFocus,
    primaryFocus: decision.focus,
    focusStartedAt: context.conversationState.primaryFocus === decision.focus
      ? context.conversationState.focusStartedAt : new Date().toISOString(),
    attentionIntensity: decision.objective === 'WAIT' ? 0.35 : 0.8,
    belief: decision.socialIntent === 'VENT' ? '用户此刻更需要被接住，而不是立即得到方案' : undefined,
    beliefConfidence: decision.socialIntent === 'VENT' ? 0.78 : undefined,
    lastAliceAction: decision.dialogueAct,
    lastUserFeedback: userMessage.slice(0, 300),
    pendingAction: decision.goal,
    learningMode: decision.learningMode,
    confusionPoint: decision.goal.includes('confusion') ? userMessage.slice(0, 200) : context.conversationState.confusionPoint,
  })
}

export function serializeAliceRuntimeContext(context: AliceContext, decision: AliceDialogueDecision): string {
  const goal = context.activeGoal
  const sceneMemory = Array.isArray(context.sceneMemory)
    ? context.sceneMemory.join('\n')
    : JSON.stringify(context.sceneMemory)
  return `${context.relationship.prompt}\n\n【场景运行上下文】\nCURRENT LOCAL TIME: ${getCurrentTimeContext()}\nTIMEZONE: ${Intl.DateTimeFormat().resolvedOptions().timeZone}\n${JSON.stringify({
    scene: context.scene,
    goal: goal ? { id: goal.id, name: goal.title, description: goal.description, progress: goal.progress } : undefined,
    currentTask: context.activeTask?.title,
    currentTopic: context.currentTopic,
    completedTasks: goal?.dailyTasks?.filter(t => t.completed).map(t => t.title) || [],
    pendingTasks: goal?.dailyTasks?.filter(t => !t.completed).map(t => t.title) || [],
    globalMemory: context.scene === 'GOAL' ? context.globalMemory.slice(0, 3) : [],
    sceneMemory: context.scene === 'GOAL' ? sceneMemory.slice(0, 600) : '',
    conversationState: context.conversationState,
    decision,
  }, null, 2)}\n动态关系上下文估算为 ${context.relationship.tokenEstimate} tokens，禁止在后续拼装中扩大。严格执行 decision 的 objective、dialogueAct、responseDepth 与 initiativeLevel。HOME 中 ACCOMPANY/UNDERSTAND 时先接住，不主动给方案；WAIT/TINY 只回自然短句。推断不是事实，要保留不确定性。思考可以复杂，最终表达要简单。不要向用户展示这些内部字段。`
}
