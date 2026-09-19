<template>
  <div class="panel batch-panel">
    <div class="batch-header">
      <h3>📋 批量分析清单</h3>
      <div class="batch-actions">
        <el-button size="small" @click="addRow">➕ 添加参数组</el-button>
        <el-button size="small" type="primary" :loading="store.batchLoading" @click="submit">🚀 提交批量分析</el-button>
        <el-button v-if="store.batchItems.length" size="small" text type="danger" @click="clear">清空结果</el-button>
      </div>
    </div>

    <div class="rows-editor">
      <div v-for="(row, i) in rows" :key="i" class="param-row">
        <span class="row-no">#{{ i + 1 }}</span>
        <el-select v-model="row.modulation" size="small" style="width:100px">
          <el-option v-for="m in MODULATION_TYPES" :key="m" :label="m" :value="m" />
        </el-select>
        <el-input-number v-model="row.samples" size="small" :min="256" :max="8192" :step="256" />
        <el-input-number v-model="row.snr" size="small" :min="0" :max="40" :step="5" />
        <el-button size="small" text type="danger" @click="rows.splice(i, 1)">删除</el-button>
      </div>
      <div v-if="!rows.length" class="editor-empty">尚未添加参数组，点击「添加参数组」开始。</div>
    </div>

    <div v-if="store.batchSummary" class="summary-bar">
      <el-tag>共 {{ store.batchSummary.total }} 组</el-tag>
      <el-tag type="success">成功 {{ store.batchSummary.success }} 条</el-tag>
      <el-tag v-if="store.batchSummary.failed" type="danger">失败 {{ store.batchSummary.failed }} 条</el-tag>
      <el-tag type="info">平均耗时 {{ store.batchSummary.avgDurationMs }} ms</el-tag>
    </div>

    <el-table v-if="store.batchItems.length" :data="store.batchItems" size="small">
      <el-table-column type="index" label="#" width="50" />
      <el-table-column label="调制方式" width="100">
        <template #default="scope">{{ scope.row.params.modulation }}</template>
      </el-table-column>
      <el-table-column label="样本数" width="90">
        <template #default="scope">{{ scope.row.params.samples }}</template>
      </el-table-column>
      <el-table-column label="SNR(dB)" width="80">
        <template #default="scope">{{ scope.row.params.snr }}</template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="scope">
          <el-tag size="small" :type="scope.row.success ? 'success' : 'danger'">
            {{ scope.row.success ? '成功' : '失败' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="识别结果" width="130">
        <template #default="scope">
          <span v-if="scope.row.success">
            {{ scope.row.detectedType }}（{{ Math.round((scope.row.confidence || 0) * 100) }}%）
          </span>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="耗时" width="90">
        <template #default="scope">{{ scope.row.durationMs }} ms</template>
      </el-table-column>
      <el-table-column label="失败原因" min-width="160">
        <template #default="scope">
          <span v-if="scope.row.error" class="error-text">{{ scope.row.error }}</span>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90">
        <template #default="scope">
          <el-button
            v-if="!scope.row.success"
            size="small"
            type="warning"
            :loading="rerunning === scope.$index"
            @click="rerun(scope.$index)"
          >重跑</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty
      v-else
      :image-size="60"
      description="暂无批量分析数据：请在上方添加参数组并提交，每组的调制方式、样本数与执行结果将在此列出。"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useSignalStore } from '../store/signal'
import { MODULATION_TYPES } from '../types'
import type { BatchParams } from '../types'

const store = useSignalStore()
const rows = reactive<BatchParams[]>([{ modulation: 'QPSK', samples: 1024, snr: 20 }])
const rerunning = ref<number | null>(null)

function addRow() { rows.push({ modulation: 'QPSK', samples: 1024, snr: 20 }) }

async function submit() {
  if (!rows.length) {
    ElMessage.warning('批量参数为空：请先添加至少一组参数再提交。')
    return
  }
  try {
    const res = await store.analyzeBatch(rows.map(r => ({ ...r })))
    if (!res || !res.items.length) {
      ElMessage.info('本批没有数据：未返回任何分析结果。')
    } else {
      ElMessage.success(`批量分析完成：成功 ${res.summary.success}/${res.summary.total} 条，平均耗时 ${res.summary.avgDurationMs} ms`)
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '批量分析失败，请检查后端服务')
  }
}

async function rerun(index: number) {
  rerunning.value = index
  try {
    await store.rerunBatchItem(index)
    const item = store.batchItems[index]
    if (item?.success) ElMessage.success(`第 ${index + 1} 条重跑成功`)
    else ElMessage.error(`第 ${index + 1} 条重跑仍失败：${item?.error || '未知原因'}`)
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '重跑失败，请检查后端服务')
  } finally { rerunning.value = null }
}

function clear() { store.clearBatch() }
</script>

<style scoped>
.batch-panel { margin-top: 16px }
.panel { background:#1a2332; border-radius:8px; padding:16px; border:1px solid #2a3a4a }
.batch-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px }
.batch-header h3 { color:#90caf9; font-size:14px }
.rows-editor { margin-bottom:12px }
.param-row { display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap }
.row-no { width:28px; color:#8899aa; font-size:12px }
.editor-empty { color:#8899aa; font-size:13px; padding:8px 0 }
.summary-bar { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap }
.error-text { color:#ef5350; font-size:12px }
:deep(.el-table) {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: #0d1520;
  --el-table-text-color: #e0e0e0;
  --el-table-header-text-color: #90caf9;
  --el-table-border-color: #2a3a4a;
  --el-table-row-hover-bg-color: #223148;
}
</style>
