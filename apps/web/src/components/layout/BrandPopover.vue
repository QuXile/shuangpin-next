<script setup lang="ts">
/** 顶栏品牌区与项目信息浮层（hover / focus 展开）。 */
import { RouterLink } from 'vue-router'
import webPackage from '../../../package.json'
</script>

<template>
        <div class="brand-wrap">
          <RouterLink
            to="/"
            class="brand"
            aria-label="双拼 NEXT 学习路线"
            aria-describedby="brand-project-info"
          >
            <span class="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32">
                <defs>
                  <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" class="brand-grad-start" />
                    <stop offset="1" class="brand-grad-end" />
                  </linearGradient>
                </defs>
                <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="url(#brandGrad)" />
                <g class="brand-glyph">
                  <rect x="7.4" y="8.4" width="7.4" height="6.6" rx="2" opacity=".95" />
                  <rect x="17.2" y="8.4" width="7.4" height="6.6" rx="2" opacity=".55" />
                  <rect x="7.4" y="17" width="7.4" height="6.6" rx="2" opacity=".55" />
                  <rect x="17.2" y="17" width="7.4" height="6.6" rx="2" opacity=".95" />
                </g>
              </svg>
            </span>
            <span class="brand-name">双拼</span>
            <span class="brand-tag">NEXT</span>
          </RouterLink>
          <aside id="brand-project-info" class="brand-popover" aria-label="项目信息">
            <div class="brand-popover-head">
              <span>双拼 NEXT</span>
              <span class="count-badge">开源项目</span>
            </div>
            <p>面向全拼熟练者的结构化双拼学习与练习应用。</p>
            <dl>
              <div>
                <dt>版本</dt>
                <dd>v{{ webPackage.version }}</dd>
              </div>
              <div>
                <dt>作者</dt>
                <dd><a href="https://github.com/QuXile" target="_blank" rel="noopener noreferrer">QuXile</a></dd>
              </div>
              <div>
                <dt>开源协议</dt>
                <dd>
                  <a href="https://github.com/QuXile/shuangpin-next/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">
                    GPL-3.0-only
                  </a>
                </dd>
              </div>
              <div>
                <dt>开源地址</dt>
                <dd>
                  <a href="https://github.com/QuXile/shuangpin-next" target="_blank" rel="noopener noreferrer">
                    github.com/QuXile/shuangpin-next
                  </a>
                </dd>
              </div>
              <div>
                <dt>在线体验</dt>
                <dd>
                  <a href="https://quxile.github.io/shuangpin-next/" target="_blank" rel="noopener noreferrer">
                    quxile.github.io/shuangpin-next
                  </a>
                </dd>
              </div>
            </dl>
          </aside>
        </div>
</template>

<style scoped>
.brand {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 9px;
  font-weight: 800;
  font-size: var(--text-md);
}
.brand-mark {
  width: 30px;
  height: 30px;
  display: block;
}
.brand-mark svg {
  width: 100%;
  height: 100%;
  display: block;
}
.brand-grad-start {
  stop-color: var(--brand);
}
.brand-grad-end {
  stop-color: var(--brand-fill-hover);
}
.brand-glyph {
  fill: var(--on-accent);
}
.brand-name {
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.brand-tag {
  padding: 2px 6px;
  border-radius: var(--r-xs);
  background: var(--brand-soft);
  color: var(--brand-ink);
  font-size: var(--text-2xs);
  font-weight: 800;
  letter-spacing: 0.12em;
  line-height: 1.5;
}

.brand-wrap {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
}
.brand-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 40;
  width: min(290px, calc(100vw - 2 * var(--page-pad-x)));
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-card);
  background: var(--surface);
  box-shadow: var(--shadow-md);
  color: var(--ink-3);
  font-size: var(--text-xs);
  line-height: 1.6;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateY(-4px);
  transition: opacity var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease),
    visibility var(--dur-fast) var(--ease);
}
/* 品牌与浮层之间的鼠标桥，避免从品牌移到浮层时浮层先消失 */
.brand-popover::before {
  content: '';
  position: absolute;
  right: 0;
  bottom: 100%;
  left: 0;
  height: 10px;
}
.brand-wrap:hover .brand-popover,
.brand-wrap:focus-within .brand-popover {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transform: translateY(0);
}
.brand-popover-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--ink);
  font-size: var(--text-sm);
  font-weight: 800;
}
.brand-popover p {
  margin: 6px 0 10px;
  color: var(--ink-3);
  font-size: var(--text-xs);
}
.brand-popover dl {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}
.brand-popover dl > div {
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 8px;
}
.brand-popover dt {
  color: var(--ink-4);
  font-weight: 650;
}
.brand-popover dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
.brand-popover a {
  color: var(--brand-ink);
  font-weight: 650;
  text-decoration: none;
}
.brand-popover a:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}


@media (max-width: 640px) {
  .brand {
    gap: 8px;
  }
  .brand-mark {
    width: 26px;
    height: 26px;
  }
  .brand-name {
    font-size: var(--text-base);
  }
  .brand-tag {
    display: none;
  }
}
</style>
