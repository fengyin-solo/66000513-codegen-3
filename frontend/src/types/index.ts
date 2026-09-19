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

export interface BatchItemResult extends BatchParams {
  index: number
  success: boolean
  error: string | null
  durationMs: number
  detectedType: string | null
  confidence: number | null
}

export interface BatchResult {
  items: BatchItemResult[]
  total: number
  successCount: number
  avgDurationMs: number
}

export const MODULATION_TYPES = ['AM', 'FM', 'BPSK', 'QPSK', '16QAM']