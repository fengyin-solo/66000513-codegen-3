<template>
  <div class="panel batch-panel">
    <h3>📦 批量分析清单</h3>

    <div class="batch-editor">
      <div v-if="rows.length" class="editor-header">
        <span class="col-index"></span>
        <span>调制方式</span>
        <span>样本数</span>
        <span>SNR(dB)</span>
        <span></span>
      </div>
      <div v-for="(row, idx) in rows" :key="idx" class="editor-row">
        <span class="col-index">#{{ idx + 1 }}</span>
        <el-select v-model="row.modulation" size="small">
          <el-option v-for="m in MODULATION_TYPES" :key="m" :label="m" :value="m" />
        </el-select>
        <el-input-number v-model="row.samples" :min="256" :max="8192" :step="256" size="small" />
        <el-input-number v-model="row.snr" :min="0" :max="40" :step="5" size="small" />
        <el-button size="small" type="danger" text @click="removeRow(idx)">删除</el-button>
      </div>
      <div class="batch-actions">
        <el-button size="small" @click="addRow">＋ 添加一组参数</el-button>
        <el-button size="small" type="primary" :loading="store.batchLoading" @click="submit">🚀 提交批量分析</el-button>
        <el-button size="small" text :disabled="!rows.length" @click="clearRows">清空清单</el-button>
      </div>
    </div>

    <div class="batch-results">
      <el-empty
        v-if="!store.batchResult"
        :image-size="60"
        description="尚未提交批量分析：在上方添加一组或多组参数并提交后，每组结果会列在这里"
      />
      <el-empty
        v-else-if="!store.batchResult.items.length"
        :image-size="60"
        description="整批没有数据：本次提交的清单为空，请至少添加一组参数后重新提交"
      />
      <template v-else>
        <div class="batch-summary">
          <el-tag size="small">共 {{ store.batchResult.total }} 组</el-tag>
          <el-tag size="small" type="success">成功 {{ store.batchResult.successCount }} 组</el-tag>
          <el-tag v-if="failedCount" size="small" type="danger">失败 {{ failedCount }} 组</el-tag>
          <el-tag size="small" type="info">平均耗时 {{ store.batchResult.avgDurationMs }} ms</el-tag>
        </div>
        <div class="result-grid result-header">
          <span>#</span><span>调制方式</span><span>样本数</span><span>SNR(dB)</span>
          <span>状态</span><span>耗时</span><span>结果 / 失败原因</span><span>操作</span>
        </div>
        <div v-for="item in store.batchResult.items" :key="item.index" class="result-grid result-row">
          <span>{{ item.index + 1 }}</span>
          <span>{{ item.modulation }}</span>
          <span>{{ item.samples }}</span>
          <span>{{ item.snr }}</span>
          <span>
            <el-tag size="small" :type="item.success ? 'success' : 'danger'">
              {{ item.success ? '成功' : '失败' }}
            </el-tag>
          </span>
          <span>{{ item.durationMs }} ms</span>
          <span :class="{ 'error-text': !item.success }">
            {{ item.success ? `识别为 ${item.detectedType}（置信度 ${Math.round((item.confidence || 0) * 100)}%）` : item.error }}
          </span>
          <span>
            <el-button
              v-if="!item.success"
              size="small"
              type="warning"
              text
              :loading="rerunning === item.index"
              @click="rerun(item.index)"
            >重跑</el-button>
            <span v-else class="muted">-</span>
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useSignalStore } from '../store/signal'
import { MODULATION_TYPES } from '../types'
import type { BatchParams } from '../types'

const store = useSignalStore()
const DEFAULT_ROW: BatchParams = { modulation: 'QPSK', samples: 1024, snr: 20 }

const rows = ref<BatchParams[]>(store.batchParams.map(p => ({ ...p })))
const rerunning = ref<number | null>(null)

// 参数清单一有变动就同步进 store 并写入本地缓存
watch(rows, v => store.setBatchParams(v.map(p => ({ ...p }))), { deep: true })

const failedCount = computed(() =>
  store.batchResult ? store.batchResult.total - store.batchResult.successCount : 0
)

function addRow() { rows.value.push({ ...DEFAULT_ROW }) }
function removeRow(idx: number) { rows.value.splice(idx, 1) }
function clearRows() { rows.value = [] }

async function submit() {
  try {
    await store.analyzeBatch(rows.value.map(p => ({ ...p })))
  } catch {
    ElMessage.error('批量分析请求失败，请检查后端服务是否已启动')
  }
}

async function rerun(index: number) {
  rerunning.value = index
  try {
    await store.rerunBatchItem(index)
  } catch {
    ElMessage.error(`第 ${index + 1} 条重跑失败，请稍后重试`)
  } finally {
    rerunning.value = null
  }
}
</script>

<style scoped>
.panel { background:#1a2332; border-radius:8px; padding:16px; border:1px solid #2a3a4a }
.batch-panel { margin-top:16px }
.panel h3 { margin-bottom:12px; color:#90caf9; font-size:14px }
.batch-editor { margin-bottom:12px }
.editor-header, .editor-row { display:flex; align-items:center; gap:12px; margin-bottom:8px }
.editor-header { font-size:12px; color:#8899aa; margin-bottom:4px }
.editor-header span, .editor-row > span.col-index { width:36px }
.editor-header span:nth-child(2) { width:110px }
.editor-header span:nth-child(3), .editor-header span:nth-child(4) { width:130px }
.col-index { color:#8899aa; font-size:12px }
.editor-row .el-select { width:110px }
.editor-row .el-input-number { width:130px }
.batch-actions { display:flex; gap:8px; margin-top:4px }
.batch-summary { display:flex; gap:8px; margin-bottom:10px }
.result-grid { display:grid; grid-template-columns:36px 90px 80px 70px 70px 90px 1fr 60px; gap:8px; align-items:center; padding:6px 8px }
.result-header { font-size:12px; color:#8899aa; border-bottom:1px solid #2a3a4a }
.result-row { font-size:13px; color:#e0e0e0; border-bottom:1px solid #22303f }
.result-row:last-child { border-bottom:none }
.error-text { color:#ef5350 }
.muted { color:#55677a }
</style>
