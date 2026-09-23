import { invoke } from '@tauri-apps/api/core'

const UPLOAD_CHUNK_SIZE = 512 * 1024

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)))
  }
  return btoa(binary)
}

export function canRenderPptxPreview(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function renderPptxPreview(file: File, previewId: string): Promise<number> {
  if (!canRenderPptxPreview()) throw new Error('原始幻灯片画面仅支持 QuestMind Windows App。')
  try {
    await invoke('begin_courseware_preview', { previewId })
    for (let offset = 0; offset < file.size; offset += UPLOAD_CHUNK_SIZE) {
      const bytes = new Uint8Array(await file.slice(offset, offset + UPLOAD_CHUNK_SIZE).arrayBuffer())
      await invoke('append_courseware_preview_chunk', { previewId, chunkBase64: bytesToBase64(bytes) })
    }
    return await invoke<number>('finish_courseware_preview', { previewId })
  } catch (error) {
    void invoke('delete_courseware_preview', { previewId }).catch(() => undefined)
    throw error
  }
}

export async function loadPptxPreviewPage(previewId: string, pageNumber: number): Promise<string> {
  return invoke<string>('get_courseware_preview_page', { previewId, pageNumber })
}

export function deletePptxPreview(previewId: string): void {
  if (!canRenderPptxPreview()) return
  void invoke('delete_courseware_preview', { previewId }).catch(() => undefined)
}
