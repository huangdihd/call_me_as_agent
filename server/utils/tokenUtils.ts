export const estimateTokens = (text: string): number => {
  text = (text || '').trim()
  if (!text) return 0
  const asciiTokens = text.split(/\s+/).length
  const cjkChars = (text.match(/[\u4e00-\u9fff]/g) || []).length
  return Math.max(asciiTokens, 1) + Math.floor(cjkChars / 2)
}

export const extractContextText = (data: any): string => {
  const inputPayload = data.input || data.messages || data.instructions || data.system
  if (typeof inputPayload === 'string') return inputPayload.trim()
  const chunks: string[] = []

  const visit = (node: any) => {
    if (node == null) return
    if (typeof node === 'string') {
      if (node.trim()) chunks.push(node.trim())
      return
    }
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (typeof node === 'object') {
      if (['user', 'assistant', 'system', 'developer'].includes(node.role)) {
        visit(node.content)
        return
      }
      if (typeof node.text === 'string') {
        chunks.push(node.text.trim())
        return
      }
      if (typeof node.content === 'string' || Array.isArray(node.content) || typeof node.content === 'object') {
        visit(node.content)
        return
      }
      Object.values(node).forEach(visit)
    }
  }

  visit(inputPayload)
  return chunks.filter(Boolean).join('\n').trim()
}
