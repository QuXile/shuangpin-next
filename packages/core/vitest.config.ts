import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // 词库/课程契约测试需要读取并解析全量数据，CI 机器上明显更慢
    testTimeout: 20000,
  },
})
