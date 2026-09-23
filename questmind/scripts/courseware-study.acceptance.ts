import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { buildFallbackCoursewareAnalysis, normalizeCoursewareAnalysis, splitCoursewareSlides } from '../src/courseware/analyzer'
import { extractPptxTextFromArrayBuffer } from '../src/lib/fileExtractor'
import { buildPageLecturePrompt } from '../src/courseware/pageLecture'

const source = `--- Slide 1 ---
第一章 条件概率
学习目标
理解条件概率的含义

--- Slide 2 ---
贝叶斯公式
P(A|B)=P(B|A)P(A)/P(B)

--- Slide 3 ---
医学检测案例
假阳性与后验概率

--- Slide 4 ---
常见错误
把 P(A|B) 与 P(B|A) 混淆`

const slides = splitCoursewareSlides(source)
assert.equal(slides.length, 4, '必须保留逐页课件结构')
assert.equal(slides[1].number, 2)
assert.ok(slides[1].text.includes('贝叶斯公式'))
const pageLecturePrompt = buildPageLecturePrompt('条件概率与贝叶斯公式', source, 2)
assert.ok(pageLecturePrompt.includes('本页重点知识点') && pageLecturePrompt.includes('这页在整节课中的作用'), '逐页精讲必须覆盖知识重点与教学作用')
assert.ok(pageLecturePrompt.includes('医学检测案例') && pageLecturePrompt.includes('学习目标'), '逐页精讲必须带入前后页语境')

const fallback = buildFallbackCoursewareAnalysis('概率论 Week 3.pptx', source)
assert.ok(fallback.learningObjectives.length >= 1, '离线时也必须产出学习目标')
assert.ok(fallback.knowledgePoints.length >= 3, '离线时也必须拆出多个知识点')
assert.ok(fallback.sections.every(section => section.knowledgePointIds.length > 0), '每个大纲模块必须连接到知识点')
assert.ok(fallback.knowledgePoints.every(point => point.checkQuestion && point.checkAnswer), '每个知识点必须有理解检查')

const normalized = normalizeCoursewareAnalysis({
  title: '条件概率与贝叶斯公式',
  courseHint: '概率论',
  summary: '从条件概率推导贝叶斯公式并用于医学检测。',
  learningObjectives: ['解释条件概率', '使用贝叶斯公式'],
  sections: [{ title: '贝叶斯推断', summary: '从证据更新概率', knowledgePoints: ['贝叶斯公式'] }],
  knowledgePoints: [{
    title: '贝叶斯公式',
    summary: '由先验概率和似然得到后验概率',
    explanation: '它描述了获得新证据后如何更新原有判断。',
    whyItMatters: '它连接先验信息与观测证据。',
    sourceSlides: [2, 3],
    prerequisites: ['条件概率'],
    commonMistakes: ['条件方向写反'],
    checkQuestion: '为什么不能交换两个条件概率？',
    checkAnswer: '条件事件改变了样本空间。',
  }],
}, '概率论 Week 3.pptx', source)

assert.equal(normalized.knowledgePoints.length, 1)
assert.deepEqual(normalized.knowledgePoints[0].sourceSlides, [2, 3])
assert.equal(normalized.sections[0].knowledgePointIds[0], normalized.knowledgePoints[0].id, '大纲必须引用稳定知识点 ID')
assert.equal(normalized.knowledgePoints[0].progress, 'NOT_STARTED')

const repeated = normalizeCoursewareAnalysis({
  title: '条件概率与贝叶斯公式',
  sections: [{ title: '贝叶斯推断', knowledgePoints: ['贝叶斯公式'] }],
  knowledgePoints: [{ title: '贝叶斯公式', sourceSlides: [2] }],
}, '概率论 Week 3.pptx', source)
assert.equal(repeated.knowledgePoints[0].id, normalized.knowledgePoints[0].id, '同一课件同一知识点必须获得稳定 ID')

const zip = new JSZip()
zip.file('ppt/slides/slide2.xml', '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>第二页 &amp; 例题</a:t></p:sld>')
zip.file('ppt/slides/slide1.xml', '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>第一页标题</a:t><a:t>核心概念</a:t></p:sld>')
const pptxText = await extractPptxTextFromArrayBuffer(await zip.generateAsync({ type: 'arraybuffer' }))
assert.ok(pptxText.indexOf('Slide 1') < pptxText.indexOf('Slide 2'), 'PPTX 必须按页码排序')
assert.ok(pptxText.includes('第二页 & 例题'), 'PPTX 必须正确解码 XML 文本')

console.log(`courseware study acceptance: ok (${slides.length} slides, ${fallback.knowledgePoints.length} fallback points)`)
