(function () {
  function now() {
    return performance && typeof performance.now === 'function' ? performance.now() : Date.now()
  }

  function average(values) {
    if (!values.length) return 0
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }

  function percentile(values, p) {
    if (!values.length) return 0
    const sorted = values.slice().sort((a, b) => a - b)
    const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))
    return sorted[index]
  }

  function pushCapped(list, value, cap) {
    if (Number.isFinite(value)) list.push(value)
    while (list.length > cap) list.shift()
  }

  class AIOperaPerformanceMonitor {
    constructor({
      panelId = 'perfPanel',
      sampleCap = 600,
      renderIntervalMs = 500,
    } = {}) {
      this.panelId = panelId
      this.sampleCap = sampleCap
      this.renderIntervalMs = renderIntervalMs
      this.sessionStartedAt = null
      this.lastRenderAt = 0
      this.lastFrameAt = null
      this.frameTimes = []
      this.frameDurations = []
      this.faceMeshDurations = []
      this.handsDurations = []
      this.drawDurations = []
      this.gestureDurations = []
      this.triggerLatencies = []
      this.backendDurations = []
      this.events = []
      this.triggerCounts = {}
      this.backendJobs = {}
      this.frameCount = 0
      this.successfulTriggers = 0
      this.failedTriggers = 0
      this.panel = null
      this.boundExport = () => this.exportCsv()
      this.boundJsonExport = () => this.exportJson()
      this.bindPanel()
    }

    bindPanel() {
      this.panel = document.getElementById(this.panelId)
      const exportButton = document.getElementById('perfExportCsvBtn')
      const exportJsonButton = document.getElementById('perfExportJsonBtn')
      if (exportButton) exportButton.addEventListener('click', this.boundExport)
      if (exportJsonButton) exportJsonButton.addEventListener('click', this.boundJsonExport)
    }

    startSession() {
      this.sessionStartedAt = now()
      this.lastFrameAt = null
      this.recordEvent('session_start')
      this.render(true)
    }

    stopSession() {
      this.recordEvent('session_stop')
      this.render(true)
    }

    reset() {
      this.sessionStartedAt = now()
      this.lastFrameAt = null
      this.frameTimes = []
      this.frameDurations = []
      this.faceMeshDurations = []
      this.handsDurations = []
      this.drawDurations = []
      this.gestureDurations = []
      this.triggerLatencies = []
      this.backendDurations = []
      this.events = []
      this.triggerCounts = {}
      this.backendJobs = {}
      this.frameCount = 0
      this.successfulTriggers = 0
      this.failedTriggers = 0
      this.recordEvent('reset')
      this.render(true)
    }

    recordEvent(type, data = {}) {
      const timestamp = Date.now()
      const event = {
        type,
        timestamp,
        elapsedMs: this.sessionStartedAt ? Math.round(now() - this.sessionStartedAt) : 0,
        ...data,
      }
      this.events.push(event)
      while (this.events.length > this.sampleCap) this.events.shift()
      return event
    }

    beginFrame() {
      const startedAt = now()
      if (this.lastFrameAt !== null) {
        pushCapped(this.frameTimes, startedAt - this.lastFrameAt, this.sampleCap)
      }
      this.lastFrameAt = startedAt
      this.frameCount += 1
      return { startedAt }
    }

    endFrame(token) {
      if (!token) return
      pushCapped(this.frameDurations, now() - token.startedAt, this.sampleCap)
      this.render()
    }

    measureAsync(label, promiseFactory) {
      const startedAt = now()
      return Promise.resolve()
        .then(promiseFactory)
        .finally(() => {
          const duration = now() - startedAt
          if (label === 'faceMesh') pushCapped(this.faceMeshDurations, duration, this.sampleCap)
          if (label === 'hands') pushCapped(this.handsDurations, duration, this.sampleCap)
        })
    }

    recordDraw(durationMs) {
      pushCapped(this.drawDurations, durationMs, this.sampleCap)
      this.render()
    }

    recordGestureEvaluation(durationMs, result = {}) {
      pushCapped(this.gestureDurations, durationMs, this.sampleCap)
      if (result.triggered) {
        const type = result.triggerType || 'unknown'
        this.triggerCounts[type] = (this.triggerCounts[type] || 0) + 1
        this.recordEvent('gesture_trigger', { triggerType: type })
      }
      this.render()
    }

    recordMaskSwitch(triggerType) {
      this.successfulTriggers += 1
      this.recordEvent('mask_switch', { triggerType: triggerType || 'unknown' })
      this.render(true)
    }

    recordBackendJobCreated(kind, job) {
      if (!job || !job.jobId) return
      this.backendJobs[job.jobId] = {
        kind,
        jobId: job.jobId,
        createdAt: now(),
        lastStatus: job.status || 'queued',
      }
      this.recordEvent('backend_job_created', { kind, jobId: job.jobId, status: job.status || 'queued' })
      this.render(true)
    }

    recordBackendStatus(kind, job) {
      if (!job || !job.jobId) return
      const cached = this.backendJobs[job.jobId] || {
        kind,
        jobId: job.jobId,
        createdAt: now(),
      }
      cached.lastStatus = job.status || cached.lastStatus
      cached.metrics = job.metrics || cached.metrics
      this.backendJobs[job.jobId] = cached
      this.recordEvent('backend_status', { kind, jobId: job.jobId, status: cached.lastStatus })
      this.render()
    }

    recordBackendJobFinished(kind, job) {
      if (!job || !job.jobId) return
      const cached = this.backendJobs[job.jobId] || {
        kind,
        jobId: job.jobId,
        createdAt: now(),
      }
      const duration = job.metrics?.durationMs || (now() - cached.createdAt)
      pushCapped(this.backendDurations, Number(duration), this.sampleCap)
      cached.lastStatus = job.status || cached.lastStatus
      cached.metrics = job.metrics || cached.metrics
      cached.finishedAt = now()
      this.backendJobs[job.jobId] = cached
      this.recordEvent('backend_job_finished', {
        kind,
        jobId: job.jobId,
        status: job.status,
        durationMs: Math.round(Number(duration)),
      })
      this.render(true)
    }

    summarize() {
      const avgFrameGap = average(this.frameTimes)
      const fps = avgFrameGap > 0 ? 1000 / avgFrameGap : 0
      const totalTriggers = Object.values(this.triggerCounts).reduce((sum, count) => sum + count, 0)
      const activeBackendJobs = Object.values(this.backendJobs).filter(
        (job) => !['done', 'failed', 'cancelled'].includes(job.lastStatus),
      ).length

      return {
        fps,
        avgFrameMs: average(this.frameDurations),
        p95FrameMs: percentile(this.frameDurations, 0.95),
        avgFaceMeshMs: average(this.faceMeshDurations),
        avgHandsMs: average(this.handsDurations),
        avgDrawMs: average(this.drawDurations),
        avgGestureMs: average(this.gestureDurations),
        totalTriggers,
        successfulTriggers: this.successfulTriggers,
        activeBackendJobs,
        avgBackendMs: average(this.backendDurations),
        frameCount: this.frameCount,
      }
    }

    render(force = false) {
      const t = now()
      if (!force && t - this.lastRenderAt < this.renderIntervalMs) return
      this.lastRenderAt = t
      if (!this.panel) this.bindPanel()

      const summary = this.summarize()
      const setText = (id, value) => {
        const element = document.getElementById(id)
        if (element) element.textContent = value
      }

      setText('perfFps', summary.fps ? summary.fps.toFixed(1) : '--')
      setText('perfFrameMs', summary.avgFrameMs ? `${summary.avgFrameMs.toFixed(1)} ms` : '--')
      setText('perfP95Ms', summary.p95FrameMs ? `${summary.p95FrameMs.toFixed(1)} ms` : '--')
      setText('perfFaceMs', summary.avgFaceMeshMs ? `${summary.avgFaceMeshMs.toFixed(1)} ms` : '--')
      setText('perfHandsMs', summary.avgHandsMs ? `${summary.avgHandsMs.toFixed(1)} ms` : '--')
      setText('perfDrawMs', summary.avgDrawMs ? `${summary.avgDrawMs.toFixed(1)} ms` : '--')
      setText('perfGestureMs', summary.avgGestureMs ? `${summary.avgGestureMs.toFixed(2)} ms` : '--')
      setText('perfTriggers', String(summary.totalTriggers))
      setText('perfBackendMs', summary.avgBackendMs ? `${Math.round(summary.avgBackendMs)} ms` : '--')
      setText('perfBackendJobs', String(summary.activeBackendJobs))
    }

    toCsvRows() {
      const rows = [['type', 'timestamp', 'elapsedMs', 'status', 'triggerType', 'jobId', 'durationMs']]
      for (const event of this.events) {
        rows.push([
          event.type || '',
          event.timestamp || '',
          event.elapsedMs || '',
          event.status || '',
          event.triggerType || '',
          event.jobId || '',
          event.durationMs || '',
        ])
      }
      return rows
    }

    download(filename, text, type) {
      const blob = new Blob([text], { type })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    }

    exportCsv() {
      const csv = this.toCsvRows()
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n')
      this.download(`ai-opera-performance-${Date.now()}.csv`, csv, 'text/csv;charset=utf-8')
    }

    exportJson() {
      const payload = {
        summary: this.summarize(),
        triggerCounts: this.triggerCounts,
        backendJobs: this.backendJobs,
        events: this.events,
      }
      this.download(
        `ai-opera-performance-${Date.now()}.json`,
        JSON.stringify(payload, null, 2),
        'application/json;charset=utf-8',
      )
    }
  }

  window.AIOperaPerformanceMonitor = AIOperaPerformanceMonitor
})()
