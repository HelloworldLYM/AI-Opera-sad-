(function () {
  function tokenize(text) {
    return String(text || '')
      .toLowerCase()
      .split(/[\s,，。；;:：、/\\|]+/)
      .filter(Boolean)
  }

  function getFaces() {
    return window.FaceKnowledgeData || {}
  }

  function faceText(face) {
    return [
      face.title,
      face.role,
      face.tagline,
      face.paintKit,
      ...(face.aliases || []),
      ...(face.story || []),
      ...(face.process || []),
      ...(face.processSteps || []),
    ].join(' ')
  }

  function search(query, { limit = 6 } = {}) {
    const tokens = tokenize(query)
    const entries = Object.entries(getFaces()).map(([key, face]) => {
      const text = faceText(face)
      const lower = text.toLowerCase()
      const score = tokens.reduce((sum, token) => {
        if (face.title === token || (face.aliases || []).includes(token)) return sum + 6
        if (lower.includes(token)) return sum + 2
        return sum
      }, 0)
      return { key, face, score }
    })

    return entries
      .filter((item) => (tokens.length ? item.score > 0 : true))
      .sort((a, b) => b.score - a.score || a.face.title.localeCompare(b.face.title, 'zh-CN'))
      .slice(0, limit)
  }

  function recommend({ color, role, mood, limit = 4 } = {}) {
    const query = [color, role, mood].filter(Boolean).join(' ')
    const results = search(query, { limit })
    if (results.length) return results
    return search('', { limit })
  }

  function answer(query) {
    const [best] = search(query, { limit: 1 })
    if (!best) {
      return {
        answer: '暂时没有匹配到对应脸谱资料，可以换一个角色、颜色或剧目关键词再试。',
        matches: [],
      }
    }

    const face = best.face
    const story = (face.story || [])[0] || ''
    const process = (face.processSteps || face.process || [])[0] || ''
    return {
      answer: `${face.title}属于${face.role || '传统脸谱谱式'}。${story}${process ? ` 绘制上，${process}` : ''}`,
      matches: [best],
    }
  }

  function narration(faceKey) {
    const face = getFaces()[faceKey] || getFaces().guanyu
    if (!face) return ''
    const story = (face.story || []).slice(0, 2).join('')
    const process = (face.processSteps || face.process || []).slice(0, 2).join('')
    return `${face.title}，${face.role}。${story}${process ? `绘制时，${process}` : ''}`
  }

  window.CultureKnowledgeEngine = {
    search,
    recommend,
    answer,
    narration,
  }
})()
