export interface SignalData {
  i: number[]
  q: number[]
  sampleRate: number
  centerFreq: number
}

export interface SpectrumData {
  frequencies: number[]
  magnitudes: number[]
}

export interface WaterfallRow {
  time: number
  values: number[]
}

export interface ConstellationPoint {
  i: number
  q: number
}

export interface ModulationResult {
  type: string
  confidence: number
  candidates: { type: string; score: number }[]
  symbolRate: number | null
  frequencyOffset: number | null
}

export interface AnalysisResult {
  spectrum: SpectrumData
  waterfall: WaterfallRow[]
  constellation: ConstellationPoint[]
  modulation: ModulationResult
}

export interface BatchParams {
  modulation: string
  samples: number
  snr: number
}

export interface BatchItemResult {
  index: number
  params: BatchParams
  success: boolean
  detectedType: string | null
  confidence: number | null
  durationMs: number
  error: string | null
}

export interface BatchSummary {
  total: number
  success: number
  failed: number
  avgDurationMs: number
}

export interface BatchResponse {
  items: BatchItemResult[]
  summary: BatchSummary
}

export const MODULATION_TYPES = ['AM', 'FM', 'BPSK', 'QPSK', '16QAM']