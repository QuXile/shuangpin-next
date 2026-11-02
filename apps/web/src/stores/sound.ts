/**
 * 音效开关（持久化）+ WebAudio 引擎转发；合成实现见 lib/audio.ts。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { createAudioEngine } from '@/lib/audio'
import { STORAGE_KEYS, readString, writeString } from '@/lib/storage'

export const useSoundStore = defineStore('sound', () => {
  /** 默认开启；只有显式写入 '0' 才视为关闭。 */
  const enabled = ref(readString(STORAGE_KEYS.sound) !== '0')
  const engine = createAudioEngine(() => enabled.value)

  function toggle(): void {
    enabled.value = !enabled.value
    writeString(STORAGE_KEYS.sound, enabled.value ? '1' : '0')
    if (enabled.value) engine.playKey()
  }

  return {
    enabled,
    toggle,
    unlock: engine.unlock,
    playKey: engine.playKey,
    playError: engine.playError,
    playComplete: engine.playComplete,
  }
})
