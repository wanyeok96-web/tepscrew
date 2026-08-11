/**
 * TEPS Guide hub — overview / prep / app how-to
 */

import { getState } from './state.js';
import { escapeHtml } from './utils.js';
import { navigate } from './router.js';

function renderBlock(block) {
  if (!block || !block.type) return '';
  switch (block.type) {
    case 'h3':
      return `<h3 class="guide-h3">${escapeHtml(block.text || '')}</h3>`;
    case 'p':
      return `<p class="guide-p">${escapeHtml(block.text || '')}</p>`;
    case 'ul':
      return `<ul class="guide-list">${(block.items || [])
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ul>`;
    case 'ol':
      return `<ol class="guide-list guide-list-ol">${(block.items || [])
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ol>`;
    case 'callout':
      return `<aside class="guide-callout guide-callout-${escapeHtml(
        block.variant || 'notice'
      )}" role="note"><p>${escapeHtml(block.text || '')}</p></aside>`;
    default:
      return '';
  }
}

function renderCtas(ctas = []) {
  if (!ctas.length) return '';
  return `
    <div class="guide-cta-row btn-row wrap">
      ${ctas
        .map(
          (cta) => `
        <button
          type="button"
          class="btn ${cta.primary ? 'btn-primary' : 'btn-secondary'}"
          data-nav="${escapeHtml(cta.nav || 'home')}"
        >${escapeHtml(cta.label || '이동')}</button>`
        )
        .join('')}
    </div>
  `;
}

export function renderGuide() {
  const guide = getState().content?.guide;
  if (!guide?.sections?.length) {
    return `
      <section class="page">
        <div class="empty-state card">
          <p class="empty-title">가이드를 불러오지 못했습니다.</p>
          <button type="button" class="btn btn-primary" data-nav="home">홈으로</button>
        </div>
      </section>
    `;
  }

  const sections = guide.sections;
  return `
    <section class="page guide-page">
      <header class="guide-hero">
        <p class="eyebrow">TEPS Crew</p>
        <h1>${escapeHtml(guide.title || 'TEPS 가이드')}</h1>
        <p class="guide-lede muted">${escapeHtml(guide.lede || '')}</p>
        <nav class="guide-jump" aria-label="가이드 섹션">
          ${sections
            .map(
              (s) => `
            <button type="button" class="guide-jump-chip" data-jump="${escapeHtml(
              s.id
            )}">${escapeHtml(s.navLabel || s.title)}</button>`
            )
            .join('')}
        </nav>
      </header>

      ${
        guide.officialUrl
          ? `<aside class="guide-official">
              <p>시험 일정·접수·규정은 공식 안내를 따릅니다.</p>
              <a class="btn btn-secondary" href="${escapeHtml(
                guide.officialUrl
              )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
                guide.officialLabel || '공식 TEPS 사이트'
              )}</a>
            </aside>`
          : ''
      }

      ${sections
        .map(
          (section) => `
        <section
          class="guide-section"
          id="guide-section-${escapeHtml(section.id)}"
          aria-labelledby="guide-heading-${escapeHtml(section.id)}"
        >
          <h2 id="guide-heading-${escapeHtml(section.id)}">${escapeHtml(section.title)}</h2>
          <div class="guide-body">
            ${(section.blocks || []).map(renderBlock).join('')}
          </div>
          ${renderCtas(section.ctas)}
        </section>`
        )
        .join('')}
    </section>
  `;
}

export function bindGuide(root) {
  root.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigate(btn.getAttribute('data-nav') || 'home');
    });
  });

  root.querySelectorAll('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-jump');
      const target = root.querySelector(`#guide-section-${CSS.escape(id || '')}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

