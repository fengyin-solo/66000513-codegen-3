import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import type { AnalysisResult, BatchParams, BatchResult } from '@/types'

const BATCH_RESULT_KEY = 'rf-batch-result'
const BATCH_PARAMS_KEY = 'rf-batch-params'

function loadJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
  } catch { return null }
}

export const useSignalStore = defineStore('signal', () => {
  const loading = ref(false)
  const result = ref<AnalysisResult | null>(null)
  const activeView = ref('spectrum')

  const batchLoading = ref(false)
  const batchParams = ref<BatchParams[]>(loadJSON<BatchParams[]>(BATCH_PARAMS_KEY) ?? [])
  const batchResult = ref<BatchResult | null>(loadJSON<BatchResult>(BATCH_RESULT_KEY))

  function persistBatch() {
    localStorage.setItem(BATCH_PARAMS_KEY, JSON.stringify(batchParams.value))
    if (batchResult.value) localStorage.setItem(BATCH_RESULT_KEY, JSON.stringify(batchResult.value))
    else localStorage.removeItem(BATCH_RESULT_KEY)
  }

  function refreshBatchSummary() {
    if (!batchResult.value) return
    const items = batchResult.value.items
    const ok = items.filter(i => i.success)
    batchResult.value.total = items.length
    batchResult.value.successCount = ok.length
    batchResult.value.avgDurationMs = ok.length
      ? Math.round(ok.reduce((s, i) => s + i.durationMs, 0) / ok.length * 10) / 10
      : 0
  }

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

  // 提交整批参数：结果整体覆盖上一次，并同步更新本地缓存
  async function analyzeBatch(items: BatchParams[]) {
    batchLoading.value = true
    try {
      const { data } = await axios.post('/api/batch', { items })
      batchResult.value = data
      persistBatch()
    } finally { batchLoading.value = false }
  }

  // 单独重跑某一条：只更新该条目并重新汇总，缓存同步
  async function rerunBatchItem(index: number) {
    const item = batchResult.value?.items[index]
    if (!item) return
    const { data } = await axios.post('/api/batch', {
      items: [{ modulation: item.modulation, samples: item.samples, snr: item.snr }]
    })
    batchResult.value!.items[index] = { ...data.items[0], index }
    refreshBatchSummary()
    persistBatch()
  }

  function setBatchParams(params: BatchParams[]) {
    batchParams.value = params
    persistBatch()
  }

  return {
    loading, result, activeView, analyze, importCSV,
    batchLoading, batchParams, batchResult, analyzeBatch, rerunBatchItem, setBatchParams
  }
})
