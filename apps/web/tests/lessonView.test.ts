import { describe, expect, it } from 'vitest'
import type { ChapterView } from '@/lib/lessonView'
import { completedChapterIds } from '@/lib/lessonView'

function chapter(id: string, states: Array<'passed' | 'available'>): ChapterView {
  return {
    id,
    order: 1,
    title: id,
    subtitle: '',
    lessons: states.map((state, index) => ({ id: `${id}-${index + 1}`, state })),
  } as unknown as ChapterView
}

describe('completedChapterIds', () => {
  it('只返回有课程且全部通过的章节', () => {
    const chapters = [
      chapter('empty', []),
      chapter('partial', ['passed', 'available']),
      chapter('done', ['passed', 'passed']),
    ]
    expect(completedChapterIds(chapters)).toEqual(['done'])
  })
})
