import { splitCoursewareSlides } from './analyzer'

export function buildPageLecturePrompt(title: string, source: string, pageNumber: number): string {
  const slides = splitCoursewareSlides(source)
  const index = slides.findIndex(slide => slide.number === pageNumber)
  if (index < 0) throw new Error('没有找到这一页的原文，请重新读取课件。')
  const page = slides[index]
  const outline = slides.map(slide => `第${slide.number}页：${slide.text.split('\n').filter(Boolean).slice(0, 2).join(' / ').slice(0, 120)}`).join('\n')
  return `请逐页精讲《${title}》的第 ${page.number} 页。当前课件解析到 ${slides.length} 页。
整节课的页面脉络（用于判断教学作用，不是本页原文）：
${outline.slice(0, 18000)}

上一页：${slides[index - 1]?.text.slice(0, 2200) || '这是开篇，没有上一页'}
本页原文（讲解的主要依据）：
${page.text.slice(0, 14000) || '本页未提取到可读文字，可能是图片或空白页。'}
下一页：${slides[index + 1]?.text.slice(0, 2200) || '这是课件最后一页'}

请按以下 Markdown 小标题输出，所有解释必须针对第 ${page.number} 页：
### 本页重点知识点
逐项说明本页真正出现的概念、公式或方法，解释含义、条件和一个简短例子，不只罗列术语。
### 这页在整节课中的作用
明确它在引入问题、建立概念、推导、示范、练习、过渡或总结中的作用，说明它为整课主线解决了什么问题。教学意图属于推断时注明“从前后页看”。
### 与前后页的连接
说明承接了什么、为后面铺垫什么；不要把相邻页内容冒充本页内容。
### 学完这页应当会什么
给出具体可检验的能力，再给一道简短理解检查及参考答案。

封面、目录、过渡和总结页也必须解释教学作用，不硬造知识点。缺少可读文字、图表或公式信息时明确说明，不能猜图。通用补充知识必须标明。只讲当前页，不跳页，也不编造页码。`
}
