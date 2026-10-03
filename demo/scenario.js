// Deterministic PRODUCT DEMO content. Never seeded into SQLite or used as an API fallback.
export const demoNow = '2026-10-01T15:00:00+08:00';
export const scenario = {
  subjects: [
    { id: 'demo-cpp', name: 'C++' },
    { id: 'demo-math', name: '高等数学' },
  ],
  conversations: [
    { id: 'cpp-erase', subject_space_id: 'demo-cpp', title: 'vector erase 后 iterator 为什么失效？', updated_at: '2026-10-01T14:20:00+08:00', kind: 'learning' },
    { id: 'cpp-template', subject_space_id: 'demo-cpp', title: '模板参数推导为什么失败？', updated_at: '2026-10-01T10:35:00+08:00', kind: 'learning' },
    { id: 'cpp-virtual', subject_space_id: 'demo-cpp', title: '虚析构为什么需要 virtual？', updated_at: '2026-09-30T19:10:00+08:00', kind: 'learning' },
  ],
  messages: {
    'cpp-erase': [
      ['user', '我在 vector 里循环 erase，删掉一个元素后再 ++it 就出错了。原来的 iterator 为什么不能继续用？'],
      ['assistant', 'erase 会使被删位置及之后的 iterator 失效，因为后面的元素会向前移动。它会返回删除位置之后的新 iterator；不要再使用旧的 it。'],
      ['user', '失效范围我懂了。但在循环里，删完还要不要再 ++it？'],
      ['assistant', '删除时用 it = v.erase(it)，不再额外递增；未删除时才 ++it。更新 iterator 的两个分支要分开，否则会跳过紧接着的元素。'],
    ],
    'cpp-template': [
      ['user', '我把 T 写在 typename T::value_type 里，编译器为什么推不出 T？'],
      ['assistant', '这是非推导上下文。编译器不能从一个嵌套类型反推出它属于哪个 T。可以显式给出 T，或让参数里也出现能直接推导 T 的位置。'],
    ],
    'cpp-virtual': [
      ['user', '通过 Base* delete 一个 Derived 对象，为什么基类析构函数要 virtual？'],
      ['assistant', '如果基类会被多态地删除，虚析构让删除过程调用派生类析构，再调用基类析构。若基类析构非虚，这种删除会导致未定义行为。'],
    ],
  },
  resources: [{ id: 'cpp-stl', subjectId: 'demo-cpp', name: 'STL 容器与迭代器.pdf', preview: '示例节选\nvector 删除元素会移动后续元素。erase 返回删除位置之后的 iterator。\n循环删除：删除分支接住返回值，保留分支再递增。' }],
  states: {
    'demo-cpp': '最近在学习 STL 容器、模板和多态。能说明 vector::erase 的失效范围，循环删除时 iterator 的更新方式还需要结合代码确认。模板的非推导上下文是下一次想继续看的问题。',
    'demo-math': '尚未整理当前学科的学习现状。',
  },
  memory: [
    { id: 'template-deduction', subjectId: 'demo-cpp', title: '非推导上下文', content: '嵌套类型不能反推出 T，想继续比较显式模板参数与可推导参数的写法。', active: true, sourceIds: ['cpp-template'] },
    { id: 'iterator-rule', subjectId: 'demo-cpp', title: '迭代器失效范围', content: '已经能说明 erase 会使被删位置及之后的 iterator 失效。', active: false, sourceIds: ['cpp-erase'] },
  ],
};

// Fixture evidence explicitly supplies status; clicking keep never supplies it.
export function recapFixture(sourceIds) {
  const erase = sourceIds.includes('cpp-erase');
  const template = sourceIds.includes('cpp-template');
  const virtual = sourceIds.includes('cpp-virtual');
  return {
    assistant: erase
      ? '你已经解释清楚失效范围。再对照循环的两个分支：删除时接住 erase 的返回值，未删除时才递增。下一步可以自己写出连续删除两个相邻元素的过程。'
      : template ? '这次可以对照两种写法：显式指定 T，以及让参数直接包含可推导的 T。重点是辨认哪里属于非推导上下文。'
        : virtual ? '这次可以从 delete Base* 的调用顺序检查虚析构的作用，再比较没有多态删除的情况。'
          : '本次没有选择学习记录。可以先写下你想回顾的问题；这组演示没有为它预设学习点候选。',
    candidates: erase ? [
      { id: 'iterator-loop', title: '循环删除时的迭代器更新', content: '你已经理解 erase 的失效范围，但循环删除时 iterator 的更新方式仍容易混淆。删除分支接住返回值，未删除分支才递增。', active: true, evidence: '原对话仍在询问循环删除的更新方式。', sourceIds: ['cpp-erase'] },
      { id: 'iterator-rule', title: '迭代器失效范围', content: '已理解失效范围：erase 会使被删位置及之后的 iterator 失效。', active: false, evidence: '原对话明确说“失效范围我懂了”，本次没有新的待解决问题。', sourceIds: ['cpp-erase'] },
    ] : template ? [
      { id: 'template-deduction', title: '非推导上下文', content: '继续比较显式给出 T 与让参数能够直接推导 T 的两种写法。', active: true, evidence: '模板原对话的问题仍待用代码比较。', sourceIds: ['cpp-template'] },
    ] : [],
  };
}
