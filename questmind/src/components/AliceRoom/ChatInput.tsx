import { useRef, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ChatInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = '与艾莉丝交谈...',
}: ChatInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  // 发送后自动聚焦输入框
  useEffect(() => {
    if (!disabled) {
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [disabled])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !disabled) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div
      className="relative mx-auto flex items-center gap-2"
      style={{
        width: 'min(88%, 720px)',
      }}
    >
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 rounded-xl border-none px-4 py-2.5 text-sm focus:ring-1 focus:ring-pink-300/50"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(12px)',
          color: 'rgba(80, 50, 40, 0.9)',
          caretColor: 'rgba(220, 120, 140, 0.8)',
        }}
      />
      <Button
        onClick={onSend}
        disabled={disabled || !value.trim()}
        className="shrink-0 rounded-xl px-4 h-10 border-0"
        style={{
          background: disabled
            ? 'rgba(220, 180, 170, 0.3)'
            : 'linear-gradient(135deg, #e8899a, #d4708a)',
          color: 'white',
        }}
      >
        {disabled ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </Button>
    </div>
  )
}
