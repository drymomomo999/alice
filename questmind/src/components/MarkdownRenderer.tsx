/**
 * 轻量 Markdown 渲染组件
 *
 * 用于渲染 AI 返回的 markdown 内容（大纲摘要、学习指南、聊天回复等）。
 * 支持 GitHub Flavored Markdown（表格、删除线、任务列表等）。
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn(
      'prose prose-sm max-w-none',
      // 标题
      'prose-headings:text-foreground prose-headings:font-bold',
      'prose-h1:text-base prose-h1:mt-3 prose-h1:mb-1.5',
      'prose-h2:text-sm prose-h2:mt-2.5 prose-h2:mb-1',
      'prose-h3:text-xs prose-h3:mt-2 prose-h3:mb-1',
      // 段落
      'prose-p:text-foreground prose-p:leading-relaxed prose-p:my-1',
      // 列表
      'prose-ul:text-foreground prose-ul:my-1 prose-ul:pl-4',
      'prose-ol:text-foreground prose-ol:my-1 prose-ol:pl-4',
      'prose-li:my-0.5',
      // 强调
      'prose-strong:text-foreground prose-strong:font-bold',
      'prose-em:text-foreground',
      // 链接
      'prose-a:text-sakura-pink prose-a:no-underline hover:prose-a:underline',
      // 代码
      'prose-code:text-peach prose-code:bg-sakura-pale/40 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[11px] prose-code:before:content-none prose-code:after:content-none',
      'prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-lg prose-pre:p-3 prose-pre:text-[11px] prose-pre:overflow-x-auto',
      // 引用
      'prose-blockquote:border-l-sakura-pink prose-blockquote:border-l-2 prose-blockquote:pl-3 prose-blockquote:text-muted-foreground prose-blockquote:my-1.5',
      // 表格
      'prose-table:text-xs',
      'prose-th:text-foreground prose-th:font-bold prose-th:border prose-th:border-sakura-light/30 prose-th:px-2 prose-th:py-1',
      'prose-td:border prose-td:border-sakura-light/30 prose-td:px-2 prose-td:py-1',
      // 分割线
      'prose-hr:border-sakura-light/30 prose-hr:my-2',
      className
    )}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        // 自定义渲染：确保文本大小一致
        p: ({ children }) => <p className="text-xs leading-relaxed my-1">{children}</p>,
        li: ({ children }) => <li className="text-xs leading-relaxed my-0.5">{children}</li>,
        code: ({ className: codeClassName, children, ...props }) => {
          const isInline = !codeClassName
          if (isInline) {
            return <code className="text-peach bg-sakura-pale/40 px-1 py-0.5 rounded text-[11px]" {...props}>{children}</code>
          }
          return <code className={codeClassName} {...props}>{children}</code>
        },
      }}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
