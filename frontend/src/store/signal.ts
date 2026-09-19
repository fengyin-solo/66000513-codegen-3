import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type { AnalysisResult, BatchItemResult, BatchParams, BatchResponse, BatchSummary } from '@/types'

const BATCH_CACHE_KEY = 'rf-batch-results'

export const useSignalStore = defineStore('signal', () => {
  const loading = ref(false)
  const result = ref<AnalysisResult | null>(null)
  const activeView = ref('spectrum')

  // ---- 批量分析清单 ----
  const batchLoading = ref(false)
  const batchItems = ref<BatchItemResult[]>([])
  const batchSummary = ref<BatchSummary | null>(null)

  function saveBatchCache() {
    localStorage.setItem(BATCH_CACHE_KEY, JSON.stringify({
      items: batchItems.value,
      summary: batchSummary.value
    }))
  }

  function loadBatchCache() {
    try {
      const raw = localStorage.getItem(BATCH_CACHE_KEY)
      if (!raw) return
      const cached = JSON.parse(raw)
      batchItems.value = cached.items || []
      batchSummary.value = cached.summary || null
    } catch { /* 缓存损坏时忽略，保持空清单 */ }
  }

  function recomputeBatchSummary() {
    const items = batchItems.value
    const total = items.length
    const success = items.filter(i => i.success).length
    const avg = total ? items.reduce((s, i) => s + i.durationMs, 0) / total : 0
    batchSummary.value = total
      ? { total, success, failed: total - success, avgDurationMs: Math.round(avg * 10) / 10 }
      : null
  }

  async function analyzeBatch(paramsList: BatchParams[]) {
    batchLoading.value = true
    try {
      const { data } = await axios.post<BatchResponse>('/api/batch', { items: paramsList })
      // 同一批参数再次提交时整体覆盖上一次结果
      batchItems.value = data.items
      batchSummary.value = data.summary
      saveBatchCache()
      return data
    } finally { batchLoading.value = false }
  }

  async function rerunBatchItem(index: number) {
    const target = batchItems.value[index]
    if (!target) return
    const { data } = await axios.post<BatchResponse>('/api/batch', { items: [target.params] })
    batchItems.value.splice(index, 1, { ...data.items[0], index })
    recomputeBatchSummary()
    saveBatchCache()
  }

  function clearBatch() {
    batchItems.value = []
    batchSummary.value = null
    localStorage.removeItem(BATCH_CACHE_KEY)
  }

  loadBatchCache()

  async function analyze(params: { modulation: string; samples: number; snr: number }) {
    loading.value = true
    try {
      const { data } = await axios.post('/api/generate', params)
      result.value = data
    } finally { loading.value = false }
  }

  async function importCSV(formData: FormData) {
    loading.value = true
    try {
      const { data } = await axios.post('/api/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      result.value = data
    } finally { loading.value = false }
  }

  return {
    loading, result, activeView, analyze, importCSV,
    batchLoading, batchItems, batchSummary,
    analyzeBatch, rerunBatchItem, clearBatch
  }
})
