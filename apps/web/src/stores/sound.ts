import { ref } from 'vue'
import { defineStore } from 'pinia'

const SOUND_KEY = 'shuangpin-next:sound'

function readEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== '0'
  } catch {
    return true
  }
}

/**
 * Web Audio 合成音效：不依赖音频资源，默认开启，开关持久化。
 * 音量固定为清晰但不刺耳的档位；音效由实际输入事件触发。
 */
export const useSoundStore = defineStore('sound', () => {
  const enabled = ref(readEnabled())
  let context: AudioContext | null = null
  let noiseBuffer: AudioBuffer | null = null
  let lastKeyAt = 0

  function persist(): void {
    try {
      localStorage.setItem(SOUND_KEY, enabled.value ? '1' : '0')
    } catch {
      /* 隐私模式下本次会话仍生效 */
    }
  }

  function ensureContext(): AudioContext | null {
    if (!enabled.value || typeof window === 'undefined') return null
    if (!context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      context = new Ctor()
    }
    return context
  }

  /**
   * 浏览器自动播放策略会让首次按键时 AudioContext 处于 suspended；
   * 直接在 suspended 状态下调度声音会被丢弃。先等 resume() 成功，再调度。
   */
  /** 首次用户手势时提前解锁 AudioContext，避免第一个按键被自动播放策略吞掉。 */
  function unlock(): void {
    const ctx = ensureContext()
    if (ctx?.state === 'suspended') void ctx.resume()
  }

  function withContext(callback: (ctx: AudioContext) => void): void {
    const ctx = ensureContext()
    if (!ctx) return
    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') callback(ctx)
        })
        .catch(() => {
          /* 无音频权限时静默降级 */
        })
      return
    }
    callback(ctx)
  }

  function getNoise(ctx: AudioContext): AudioBuffer {
    if (noiseBuffer) return noiseBuffer
    const length = Math.floor(ctx.sampleRate * 0.035)
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length)
    }
    noiseBuffer = buffer
    return buffer
  }

  function click(ctx: AudioContext, whenOffset = 0, pitch = 145, level = 0.055): void {
    const now = ctx.currentTime + whenOffset
    const duration = 0.04

    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(pitch, now)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, pitch * 0.55), now + duration)
    gain.gain.setValueAtTime(level, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(now)
    oscillator.stop(now + duration + 0.01)

    const noise = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const noiseGain = ctx.createGain()
    noise.buffer = getNoise(ctx)
    filter.type = 'highpass'
    filter.frequency.value = 1200
    noiseGain.gain.setValueAtTime(0.026, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025)
    noise.connect(filter).connect(noiseGain).connect(ctx.destination)
    noise.start(now)
  }

  function playKey(): void {
    // 同一个物理按键可能同时触发键位图和 Hero 键帽，做极短的去重。
    const now = performance.now()
    if (now - lastKeyAt < 12) return
    lastKeyAt = now
    withContext((ctx) => click(ctx, 0, 145 + Math.random() * 18))
  }

  /** 错误音：明确区别于短促敲击声的低频下降音，不使用噪声瞬态。 */
  function playError(): void {
    withContext((ctx) => {
      const now = ctx.currentTime

      const oscillator = ctx.createOscillator()
      const filter = ctx.createBiquadFilter()
      const gain = ctx.createGain()
      oscillator.type = 'sawtooth'
      filter.type = 'lowpass'
      filter.frequency.setValueAtTime(900, now)
      filter.Q.value = 0.8
      oscillator.frequency.setValueAtTime(235, now)
      oscillator.frequency.exponentialRampToValueAtTime(145, now + 0.16)
      gain.gain.setValueAtTime(0.001, now)
      gain.gain.linearRampToValueAtTime(0.07, now + 0.008)
      gain.gain.setValueAtTime(0.07, now + 0.09)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
      oscillator.connect(filter).connect(gain).connect(ctx.destination)
      oscillator.start(now)
      oscillator.stop(now + 0.2)
    })
  }

  /** 完成音：上方三音上行琶音，和键盘敲击声拉开明显区别。 */
  function playComplete(): void {
    withContext((ctx) => {
      const now = ctx.currentTime
      for (const [offset, frequency] of [
        [0, 523.25],
        [0.07, 659.25],
        [0.14, 783.99],
      ] as const) {
        const oscillator = ctx.createOscillator()
        const gain = ctx.createGain()
        oscillator.type = 'triangle'
        oscillator.frequency.setValueAtTime(frequency, now + offset)
        gain.gain.setValueAtTime(0.001, now + offset)
        gain.gain.linearRampToValueAtTime(0.06, now + offset + 0.012)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2)
        oscillator.connect(gain).connect(ctx.destination)
        oscillator.start(now + offset)
        oscillator.stop(now + offset + 0.22)
      }
    })
  }

  function toggle(): void {
    enabled.value = !enabled.value
    persist()
    if (enabled.value) playKey()
  }

  return { enabled, toggle, unlock, playKey, playError, playComplete }
})
