<template>
  <div class="rte" :class="{ compact }">
    <div class="rte-toolbar" ref="toolbarEl" v-if="editor">
      <button type="button" class="rte-btn" :class="{ active: editor.isActive('bold') }" title="Bold (Ctrl+B)" @mousedown.prevent="editor.chain().focus().toggleBold().run()">
        <span class="glyph glyph-bold">B</span>
      </button>
      <button type="button" class="rte-btn" :class="{ active: editor.isActive('italic') }" title="Italic (Ctrl+I)" @mousedown.prevent="editor.chain().focus().toggleItalic().run()">
        <span class="glyph glyph-italic">I</span>
      </button>

      <span class="rte-divider" />

      <button type="button" class="rte-btn" :class="{ active: editor.isActive('bulletList') }" title="Bullet list" @mousedown.prevent="editor.chain().focus().toggleBulletList().run()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <circle cx="3.5" cy="6" r="1" fill="currentColor" stroke="none"/>
          <circle cx="3.5" cy="12" r="1" fill="currentColor" stroke="none"/>
          <circle cx="3.5" cy="18" r="1" fill="currentColor" stroke="none"/>
        </svg>
      </button>
      <button type="button" class="rte-btn" :class="{ active: editor.isActive('orderedList') }" title="Numbered list" @mousedown.prevent="editor.chain().focus().toggleOrderedList().run()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <line x1="9" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="9" y1="18" x2="21" y2="18"/>
          <text x="1" y="9" font-size="7" fill="currentColor" stroke="none">1</text>
          <text x="1" y="15" font-size="7" fill="currentColor" stroke="none">2</text>
          <text x="1" y="21" font-size="7" fill="currentColor" stroke="none">3</text>
        </svg>
      </button>
      <button type="button" class="rte-btn" title="Link" :class="{ active: editor.isActive('link') }" @mousedown.prevent="toggleLink">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      </button>

      <!-- Less-frequently-used tools. When there's room they flow inline as
           normal toolbar buttons (Teleport disabled, plain "contents" div).
           Once the toolbar itself gets too narrow (tracked by ResizeObserver
           as `isNarrow`, so it reacts to the composer's actual width rather
           than the viewport), the same markup is teleported to <body> and
           rendered as a real modal instead — an anchored dropdown has
           nowhere to grow on small screens and either overflows the
           viewport or can't scroll, a modal always has room. -->
      <Teleport to="body" :disabled="!isNarrow">
        <div
          v-if="!isNarrow || moreOpen"
          class="rte-toolbar-secondary"
          :class="{ 'is-modal': isNarrow }"
          @click.self="isNarrow && (moreOpen = false)"
        >
          <div class="rte-more-scroll">
            <div v-if="isNarrow" class="rte-more-header">
              <span class="rte-more-title">More formatting</span>
              <button type="button" class="rte-more-close" aria-label="Close" @mousedown.prevent="moreOpen = false">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <span class="rte-divider" />

            <button type="button" class="rte-btn" :class="{ active: editor.isActive('strike') }" title="Strikethrough" @mousedown.prevent="editor.chain().focus().toggleStrike().run()">
              <span class="glyph glyph-strike">S</span>
            </button>
            <button type="button" class="rte-btn" :class="{ active: editor.isActive('code') }" title="Inline code" @mousedown.prevent="editor.chain().focus().toggleCode().run()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"/>
                <polyline points="8 6 2 12 8 18"/>
              </svg>
            </button>
            <button type="button" class="rte-btn" :class="{ active: editor.isActive('blockquote') }" title="Quote" @mousedown.prevent="editor.chain().focus().toggleBlockquote().run()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 7h4v4a4 4 0 0 1-4 4H6"/><path d="M15 7h4v4a4 4 0 0 1-4 4h-1"/>
              </svg>
            </button>
            <button type="button" class="rte-btn" :class="{ active: editor.isActive('taskList') }" title="Checklist" @mousedown.prevent="editor.chain().focus().toggleTaskList().run()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="8 12 11 15 16 9"/>
              </svg>
            </button>
            <button type="button" class="rte-btn" title="Embed a link as a card" @mousedown.prevent="insertEmbed">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </button>

            <span class="rte-divider" />

            <select
              class="rte-select"
              title="Font size"
              :value="editor.getAttributes('textStyle').fontSize || ''"
              @change="onFontSizeChange"
            >
              <option value="">Normal</option>
              <option value="12px">Small</option>
              <option value="20px">Large</option>
              <option value="28px">Huge</option>
            </select>

            <span class="rte-color-group" title="Text color">
              <button
                type="button"
                class="rte-color-label"
                :style="{ borderBottomColor: textColor }"
                title="Apply text color"
                @mousedown.prevent="editor.chain().focus().setColor(textColor).run()"
              >A</button>
              <input type="color" class="rte-color" :value="textColor" title="Choose text color" @input="onTextColorInput" />
              <button type="button" class="rte-color-clear" title="Clear text color" @mousedown.prevent="editor.chain().focus().unsetColor().run()">✕</button>
            </span>
            <span class="rte-color-group" title="Highlight (background) color">
              <button
                type="button"
                class="rte-color-label"
                title="Apply highlight color"
                @mousedown.prevent="editor.chain().focus().setBackgroundColor(bgColor).run()"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ color: bgColor }">
                  <path d="M9 11l6-6 4 4-6 6"/><path d="M11 13l-5.5 5.5a1.5 1.5 0 0 1-2.1 0v0a1.5 1.5 0 0 1 0-2.1L9 11"/><path d="M4 20h4"/>
                </svg>
              </button>
              <input type="color" class="rte-color" :value="bgColor" title="Choose highlight color" @input="onBgColorInput" />
              <button type="button" class="rte-color-clear" title="Clear highlight color" @mousedown.prevent="editor.chain().focus().unsetBackgroundColor().run()">✕</button>
            </span>

            <span class="rte-divider" />

            <button type="button" class="rte-btn" title="Insert table" @mousedown.prevent="editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
              </svg>
            </button>

            <template v-if="editor.isActive('table')">
              <button type="button" class="rte-btn" title="Add column" @mousedown.prevent="editor.chain().focus().addColumnAfter().run()">+Col</button>
              <button type="button" class="rte-btn" title="Add row" @mousedown.prevent="editor.chain().focus().addRowAfter().run()">+Row</button>
              <button type="button" class="rte-btn" title="Delete column" @mousedown.prevent="editor.chain().focus().deleteColumn().run()">-Col</button>
              <button type="button" class="rte-btn" title="Delete row" @mousedown.prevent="editor.chain().focus().deleteRow().run()">-Row</button>
              <button type="button" class="rte-btn action-danger" title="Delete table" @mousedown.prevent="editor.chain().focus().deleteTable().run()">✕Tbl</button>
            </template>
          </div>
        </div>
      </Teleport>

      <button v-if="isNarrow" type="button" class="rte-btn rte-more-btn" title="More formatting options" :class="{ active: moreOpen }" @mousedown.prevent="moreOpen = !moreOpen">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>
        </svg>
      </button>

      <span class="rte-spacer" />

      <button type="button" class="rte-btn" title="Undo" :disabled="!editor.can().undo()" @mousedown.prevent="editor.chain().focus().undo().run()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
        </svg>
      </button>
      <button type="button" class="rte-btn" title="Redo" :disabled="!editor.can().redo()" @mousedown.prevent="editor.chain().focus().redo().run()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
        </svg>
      </button>
    </div>

    <editor-content class="rte-content" :editor="editor" />
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Node } from '@tiptap/core'
import { Fragment, Slice } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { TextStyle, Color, FontSize, BackgroundColor } from '@tiptap/extension-text-style'
import { getVideoEmbed, classifyEmbedProvider } from '../../utils/embedProviders'
import { resolveEmbed } from '../../utils/embedResolver'

// Renders a pasted/inserted bare URL as a static card (matching the composer's
// attachment-level embed card) instead of a plain autolinked text run — or,
// for a recognized video link, as a playable embed.
const LinkEmbed = Node.create({
  name: 'linkEmbed',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      href: { default: null, parseHTML: (el) => el.getAttribute('href') || el.getAttribute('data-href') },
      // Populated asynchronously after insertion by resolving the href
      // against /api/resolve-embed (see maybeResolveLinkEmbed below) — never
      // re-derived from href on render, only ever set once by that resolve
      // step, then persisted as-is in the note's stored HTML from then on.
      resolved: { default: false, parseHTML: (el) => el.getAttribute('data-resolved') === 'true' },
      kind: { default: null, parseHTML: (el) => el.getAttribute('data-kind') || null },
      title: { default: null, parseHTML: (el) => el.getAttribute('data-title') || null },
      description: { default: null, parseHTML: (el) => el.getAttribute('data-description') || null },
      thumbnail: { default: null, parseHTML: (el) => el.getAttribute('data-thumbnail') || null },
      authorName: { default: null, parseHTML: (el) => el.getAttribute('data-author-name') || null },
      authorHandle: { default: null, parseHTML: (el) => el.getAttribute('data-author-handle') || null },
      authorAvatar: { default: null, parseHTML: (el) => el.getAttribute('data-author-avatar') || null },
    }
  },

  parseHTML() {
    // Tiptap's Link *mark* (autolink: true) sets its own parseHTML priority
    // to 1000 specifically so it wins over ordinary node rules on `<a>`
    // elements — which otherwise silently eats our `<a data-link-embed>`
    // card, flattening it into a plain autolinked text span on reload. Both
    // rules need a priority above that to actually win the match.
    return [
      { tag: 'a[data-link-embed]', priority: 1001 },
      { tag: 'div[data-link-embed]', priority: 1001 },
    ]
  },

  renderHTML({ node }) {
    const href = node.attrs.href || ''
    const embed = getVideoEmbed(href)
    if (embed) {
      return ['div', { 'data-link-embed': '', 'data-href': href, class: `link-embed-video link-embed-video--${embed.provider}` },
        ['div', { class: 'link-embed-video-frame' },
          ['iframe', {
            src: embed.embedUrl,
            title: 'Embedded video',
            frameborder: '0',
            allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
            referrerpolicy: 'strict-origin-when-cross-origin',
            allowfullscreen: 'true',
          }],
        ],
      ]
    }

    let hostname = href
    try { hostname = new URL(href).hostname } catch { /* not a valid URL, show as-is */ }

    // Resolved rich cards store every scraped/API field as a `data-*`
    // attribute (in addition to rendering it visibly) purely so parseHTML
    // above can recover it when the note's saved HTML is loaded back into
    // the editor — otherwise reopening a note for inline-edit would silently
    // drop back to the unresolved plain card.
    const dataAttrs = {}
    if (node.attrs.resolved) dataAttrs['data-resolved'] = 'true'
    if (node.attrs.kind) dataAttrs['data-kind'] = node.attrs.kind
    if (node.attrs.title) dataAttrs['data-title'] = node.attrs.title
    if (node.attrs.description) dataAttrs['data-description'] = node.attrs.description
    if (node.attrs.thumbnail) dataAttrs['data-thumbnail'] = node.attrs.thumbnail
    if (node.attrs.authorName) dataAttrs['data-author-name'] = node.attrs.authorName
    if (node.attrs.authorHandle) dataAttrs['data-author-handle'] = node.attrs.authorHandle
    if (node.attrs.authorAvatar) dataAttrs['data-author-avatar'] = node.attrs.authorAvatar

    if (node.attrs.resolved && node.attrs.kind === 'tweet') {
      const header = [
        'span', { class: 'link-embed-tweet-header' },
      ]
      if (node.attrs.authorAvatar) header.push(['img', { class: 'link-embed-tweet-avatar', src: node.attrs.authorAvatar, alt: '' }])
      const names = ['span', { class: 'link-embed-tweet-names' }, ['span', { class: 'link-embed-tweet-name' }, node.attrs.authorName || 'Tweet']]
      if (node.attrs.authorHandle) names.push(['span', { class: 'link-embed-tweet-handle' }, `@${node.attrs.authorHandle}`])
      header.push(names)

      const body = ['span', { class: 'link-embed-body link-embed-tweet-body' }, header]
      if (node.attrs.description) body.push(['span', { class: 'link-embed-tweet-text' }, node.attrs.description])
      if (node.attrs.thumbnail) body.push(['img', { class: 'link-embed-tweet-media', src: node.attrs.thumbnail, alt: '' }])

      return ['a', { 'data-link-embed': '', href, target: '_blank', rel: 'noopener noreferrer', class: 'link-embed-card link-embed-tweet', ...dataAttrs },
        ['span', { class: 'link-embed-accent' }],
        body,
      ]
    }

    if (node.attrs.resolved && node.attrs.kind === 'article') {
      const body = ['span', { class: 'link-embed-body' }, ['span', { class: 'link-embed-host' }, hostname]]
      if (node.attrs.title) body.push(['span', { class: 'link-embed-title' }, node.attrs.title])
      if (node.attrs.description) body.push(['span', { class: 'link-embed-description' }, node.attrs.description])

      const children = [['span', { class: 'link-embed-accent' }]]
      if (node.attrs.thumbnail) children.push(['img', { class: 'link-embed-thumb', src: node.attrs.thumbnail, alt: '' }])
      children.push(body)

      return ['a', { 'data-link-embed': '', href, target: '_blank', rel: 'noopener noreferrer', class: 'link-embed-card link-embed-article', ...dataAttrs }, ...children]
    }

    // Plain fallback card — also doubles as the loading state while a
    // 'resolver'-classified href hasn't come back from /api/resolve-embed yet.
    return ['a', { 'data-link-embed': '', href, target: '_blank', rel: 'noopener noreferrer', class: 'link-embed-card' },
      ['span', { class: 'link-embed-accent' }],
      ['span', { class: 'link-embed-body' },
        ['span', { class: 'link-embed-host' }, hostname],
        ['span', { class: 'link-embed-url' }, href],
      ],
    ]
  },

  // Fallback for platforms where a paste never surfaces as a real `paste` DOM
  // event with readable clipboardData — notably some mobile browsers, which
  // deliver pasted text as a plain text insertion indistinguishable (to the
  // DOM) from typing. handlePaste above never sees that, so the URL would
  // otherwise sit there as a normal autolinked hyperlink with no embed. This
  // watches for a paragraph whose *entire* content becomes a bare URL in one
  // sizeable insertion — gated on insertion size so that typing a URL out
  // character-by-character doesn't get yanked into an atom node mid-typing,
  // since every partial prefix of a URL still parses as a valid URL.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          const pastedLikely = transactions.some((tr) =>
            tr.getMeta('paste') ||
            tr.getMeta('uiEvent') === 'paste' ||
            tr.steps.some((step) => step.slice && step.slice.content.size > 8)
          )
          if (!pastedLikely) return null

          let match = null
          newState.doc.descendants((node, pos) => {
            if (match || node.type.name !== 'paragraph') return
            if (node.childCount !== 1 || !node.firstChild.isText) return
            const text = node.firstChild.text
            if (text === text.trim() && isUrl(text)) match = { pos, node }
          })
          if (!match) return null
          maybeResolveLinkEmbed(match.node.firstChild.text)
          return newState.tr.replaceWith(
            match.pos,
            match.pos + match.node.nodeSize,
            newState.schema.nodes.linkEmbed.create({ href: match.node.firstChild.text })
          )
        },
      }),
    ]
  },
})

function isUrl(str) {
  try {
    const u = new URL(str)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Write a note…' },
  compact: { type: Boolean, default: false },
  autofocus: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'update:text', 'update:empty', 'submit', 'image-paste'])

const editor = useEditor({
  content: props.modelValue,
  autofocus: props.autofocus ? 'end' : false,
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      protocols: ['http', 'https', 'mailto'],
      HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
    }),
    Placeholder.configure({ placeholder: props.placeholder }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    TextStyle,
    Color,
    FontSize,
    BackgroundColor,
    LinkEmbed,
  ],
  editorProps: {
    // Plain-text clipboard data often carries a trailing (or leading) newline
    // (e.g. Notepad, terminals), which ProseMirror otherwise turns into a
    // phantom empty paragraph and visibly inflates the editor's height.
    transformPastedText(text) {
      return text.replace(/^\s*\n+/, '').replace(/\n+\s*$/, '')
    },
    // HTML clipboard data (e.g. from web pages, other apps) often encodes
    // blank lines as several stacked <br> inside one paragraph rather than
    // as separate paragraphs, which stacks up line-height and produces a
    // visibly huge empty block. Collapse those runs and drop paragraphs
    // that are empty as a result, plus any leading/trailing empty ones.
    transformPastedHTML(html) {
      const EMPTY_P = '<p[^>]*>(?:\\s|<br\\s*/?>)*</p>'
      return html
        .replace(/(?:\s*<br\s*\/?>\s*){2,}/gi, '<br>')
        .replace(new RegExp(`^(?:${EMPTY_P})+`, 'i'), '')
        .replace(new RegExp(`(?:${EMPTY_P})+$`, 'i'), '')
    },
    // Last line of defense: pasting a partial selection (e.g. a single word
    // selected and copied out of this same editor) hands ProseMirror a
    // slice that has to be split/refitted at the copy boundary. That
    // refitting can itself invent a stray leading/trailing hardBreak inside
    // the boundary paragraph — an artifact that never existed in the
    // clipboard HTML, so transformPastedHTML above can't see it. Collapse
    // those here, on the already-parsed slice, right before it's inserted.
    transformPasted(slice) {
      const collapseBreaks = (fragment) => {
        const nodes = []
        let breakRun = 0
        fragment.forEach((node) => {
          if (node.type.name === 'hardBreak') {
            breakRun += 1
            if (breakRun > 1) return
          } else {
            breakRun = 0
          }
          nodes.push(node.content.childCount ? node.copy(collapseBreaks(node.content)) : node)
        })
        while (nodes.length && nodes[0].type.name === 'hardBreak') nodes.shift()
        while (nodes.length && nodes[nodes.length - 1].type.name === 'hardBreak') nodes.pop()
        return Fragment.fromArray(nodes)
      }
      return new Slice(collapseBreaks(slice.content), slice.openStart, slice.openEnd)
    },
    handleKeyDown(_view, event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        const ed = editor.value
        // Inside multi-item contexts, Enter should behave normally (new item/line);
        // otherwise a checklist or table could never grow past one entry via the keyboard.
        const inMultiItemContext = ed && (
          ed.isActive('listItem') ||
          ed.isActive('taskItem') ||
          ed.isActive('tableCell') ||
          ed.isActive('tableHeader') ||
          ed.isActive('codeBlock')
        )
        if (inMultiItemContext) return false
        emit('submit')
        return true
      }
      return false
    },
    handlePaste(_view, event) {
      const items = Array.from(event.clipboardData?.items ?? [])
      const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'))
      if (imageItem) {
        const file = imageItem.getAsFile()
        if (file) emit('image-paste', file)
        return true
      }

      const text = event.clipboardData?.getData('text/plain')?.trim()
      if (text && isUrl(text)) {
        editor.value?.chain().focus().insertContent({ type: 'linkEmbed', attrs: { href: text } }).run()
        maybeResolveLinkEmbed(text)
        return true
      }

      return false
    },
    handleDOMEvents: {
      click(_view, event) {
        // The embed card is a real <a> so it reads correctly in the read-only
        // (v-html) view, but clicking it while editing shouldn't navigate away.
        if (event.target.closest?.('[data-link-embed]')) {
          event.preventDefault()
          return true
        }
        return false
      },
    },
  },
  onCreate({ editor: ed }) {
    emit('update:text', ed.getText())
    emit('update:empty', ed.isEmpty)
    retryUnresolvedLinkEmbeds(ed)
  },
  onUpdate({ editor: ed }) {
    emit('update:modelValue', ed.isEmpty ? '' : ed.getHTML())
    emit('update:text', ed.getText())
    emit('update:empty', ed.isEmpty)
  },
})

// A link pasted while offline never gets a resolver response, so it would
// otherwise stay the plain fallback card forever. On mount (covers both the
// composer and inline-edit, which each create a fresh editor instance),
// sweep once for any not-yet-resolved 'resolver'-classified nodes and retry.
function retryUnresolvedLinkEmbeds(ed) {
  if (!navigator.onLine) return
  const hrefs = new Set()
  ed.state.doc.descendants((node) => {
    if (node.type.name !== 'linkEmbed' || node.attrs.resolved) return
    if (classifyEmbedProvider(node.attrs.href) !== 'resolver') return
    hrefs.add(node.attrs.href)
  })
  hrefs.forEach((href) => maybeResolveLinkEmbed(href))
}

// Tracks in-flight /api/resolve-embed calls so a note submitted (Enter, or
// the composer's send button) a moment after pasting a link doesn't
// permanently bake in the plain fallback card — see waitForPendingEmbeds
// below, which the composer awaits before it actually reads out the
// editor's HTML to save.
const pendingResolves = new Set()

// Resolves a freshly-inserted (or still-unresolved) href via the Worker's
// /api/resolve-embed and, if it comes back with data, patches the matching
// node's attrs in place — fire-and-forget from every insertion call site
// (paste handler, toolbar button, mobile-paste fallback) plus the retry
// sweep above, so they all funnel through the same logic.
async function maybeResolveLinkEmbed(href) {
  if (classifyEmbedProvider(href) !== 'resolver') return
  const task = resolveAndApply(href)
  pendingResolves.add(task)
  try {
    await task
  } finally {
    pendingResolves.delete(task)
  }
}

async function resolveAndApply(href) {
  const data = await resolveEmbed(href)
  if (!data) return
  const ed = editor.value
  if (!ed) return

  let pos = null
  ed.state.doc.descendants((node, p) => {
    if (pos !== null) return
    if (node.type.name === 'linkEmbed' && node.attrs.href === href && !node.attrs.resolved) pos = p
  })
  if (pos === null) return

  const node = ed.state.doc.nodeAt(pos)
  if (!node) return
  const tr = ed.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...data, resolved: true })
  ed.view.dispatch(tr)
}

// Awaited by the composer right before it reads out the editor's HTML to
// save — bounded so a slow/stuck resolve can't hang submission indefinitely.
function waitForPendingEmbeds() {
  if (pendingResolves.size === 0) return Promise.resolve()
  const settled = Promise.allSettled([...pendingResolves])
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000))
  return Promise.race([settled, timeout])
}

watch(
  () => props.modelValue,
  (val) => {
    const ed = editor.value
    if (!ed) return
    const incoming = val || ''
    if (incoming !== ed.getHTML()) {
      ed.commands.setContent(incoming, false)
    }
  }
)

function toggleLink() {
  const ed = editor.value
  if (!ed) return
  if (ed.isActive('link')) {
    ed.chain().focus().unsetLink().run()
    return
  }
  const url = window.prompt('Link URL')
  if (!url) return
  ed.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
}

function insertEmbed() {
  const ed = editor.value
  if (!ed) return
  const url = window.prompt('Embed a link as a card (URL)')
  if (!url) return
  ed.chain().focus().insertContent({ type: 'linkEmbed', attrs: { href: url } }).run()
  maybeResolveLinkEmbed(url)
}

function onFontSizeChange(e) {
  const ed = editor.value
  if (!ed) return
  const val = e.target.value
  if (!val) ed.chain().focus().unsetFontSize().run()
  else ed.chain().focus().setFontSize(val).run()
}

const textColor = ref('#f2f3f5')
const bgColor = ref('#5865f2')

function onTextColorInput(e) {
  textColor.value = e.target.value
  editor.value?.chain().focus().setColor(e.target.value).run()
}

function onBgColorInput(e) {
  bgColor.value = e.target.value
  editor.value?.chain().focus().setBackgroundColor(e.target.value).run()
}

function focus() {
  editor.value?.chain().focus('end').run()
}

defineExpose({ focus, waitForPendingEmbeds })

const toolbarEl = ref(null)
const moreOpen = ref(false)
const isNarrow = ref(false)

// Once the toolbar itself is too narrow for every button, the overflow
// tools move into a real modal (see template) instead of an inline
// dropdown — a dropdown anchored to a toolbar button has nowhere to grow
// on small screens and either overflows the viewport or can't scroll.
let resizeObserver
watch(toolbarEl, (el) => {
  resizeObserver?.disconnect()
  if (!el) return
  resizeObserver = new ResizeObserver(([entry]) => {
    isNarrow.value = entry.contentRect.width < 340
  })
  resizeObserver.observe(el)
}, { immediate: true })

function onDocumentKeydown(e) {
  if (e.key === 'Escape') moreOpen.value = false
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown)
  resizeObserver?.disconnect()
  editor.value?.destroy()
})
</script>

<style scoped>
.rte {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.rte-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
  padding-bottom: 2px;
  position: relative;
}

/* Wide toolbar: the secondary tools flow inline as ordinary flex children
   (the wrapper divs are transparent to layout via `display: contents`). */
.rte-toolbar-secondary,
.rte-more-scroll {
  display: contents;
}

.rte-more-header {
  display: none;
}

/* Narrow toolbar: the same markup is teleported to <body> and rendered as
   a real modal (fixed backdrop + scrollable panel) instead of an inline
   dropdown, so it always has room to lay out and can scroll if it's tall. */
.rte-toolbar-secondary.is-modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  padding: var(--sp-4);
  z-index: 100;
}

.rte-toolbar-secondary.is-modal .rte-more-scroll {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 4px;
  width: min(320px, 100%);
  max-height: min(480px, calc(100vh - 4rem));
  overflow-y: auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-lg);
  padding: var(--sp-3);
}

.rte-toolbar-secondary.is-modal .rte-divider {
  display: none;
}

.rte-toolbar-secondary.is-modal .rte-select {
  width: 100%;
}

.rte-toolbar-secondary.is-modal .rte-more-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-bottom: var(--sp-2);
  margin-bottom: 2px;
  border-bottom: 1px solid var(--border);
}

.rte-more-title {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-primary);
}

.rte-more-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--r-sm);
  color: var(--text-muted);
  transition: color var(--t-fast), background var(--t-fast);
}

.rte-more-close:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

@media (hover: none) {
  .rte-more-close {
    width: 32px;
    height: 32px;
  }
}

.rte-divider {
  width: 1px;
  align-self: stretch;
  background: var(--border);
  margin: 2px 2px;
}

.rte-spacer {
  flex: 1;
}

.rte-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 4px;
  border-radius: var(--r-sm);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  transition: color var(--t-fast), background var(--t-fast);
}

.rte-btn:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.rte-btn.active {
  color: var(--accent);
  background: rgba(88, 101, 242, 0.14);
}

.rte-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.rte-btn.action-danger:hover {
  color: var(--accent-danger);
  background: rgba(218, 55, 60, 0.12);
}

.rte-select {
  height: 24px;
  padding: 0 2px;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--text-xs);
  border: 1px solid transparent;
}

.rte-select:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.rte-color-group {
  display: flex;
  align-items: center;
  gap: 1px;
}

.rte-color-label {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  border-bottom: 2px solid var(--text-muted);
  line-height: 1;
  padding-bottom: 1px;
  border-radius: var(--r-sm);
  transition: background var(--t-fast);
}

.rte-color-label:hover {
  background: var(--bg-hover);
}

.rte-color {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: var(--r-sm);
  background: none;
  cursor: pointer;
}

.rte-color::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.rte-color::-webkit-color-swatch {
  border: 1px solid var(--border-strong);
  border-radius: 3px;
}

.rte-color-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 9px;
  color: var(--text-muted);
  border-radius: var(--r-sm);
}

.rte-color-clear:hover {
  color: var(--accent-danger);
  background: rgba(218, 55, 60, 0.12);
}

@media (hover: none) {
  .rte-btn {
    min-width: 34px;
    height: 34px;
  }

  .rte-select {
    height: 34px;
  }

  .rte-color-label {
    width: 22px;
    height: 22px;
  }

  .rte-color {
    width: 28px;
    height: 28px;
  }

  .rte-color-clear {
    width: 22px;
    height: 22px;
  }
}

.glyph-italic {
  font-style: italic;
}

.glyph-strike {
  text-decoration: line-through;
}

.rte.compact .rte-toolbar {
  padding-bottom: 0;
}

/* ── Editable content area ── */
.rte-content {
  min-height: 22px;
}

.rte-content :deep(.ProseMirror) {
  outline: none;
  font-size: var(--text-base);
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
  overflow-x: auto;
}

.rte.compact .rte-content :deep(.ProseMirror) {
  max-height: 300px;
}

.rte-content :deep(.ProseMirror p) {
  min-height: 1.5em;
}

.rte-content :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: var(--text-muted);
  float: left;
  height: 0;
  pointer-events: none;
}

.rte-content :deep(.ProseMirror ul),
.rte-content :deep(.ProseMirror ol) {
  padding-left: 1.4em;
}

.rte-content :deep(.ProseMirror blockquote) {
  border-left: 3px solid var(--border-strong);
  padding-left: var(--sp-3);
  color: var(--text-secondary);
}

.rte-content :deep(.ProseMirror code) {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  background: var(--bg-input);
  padding: 1px 4px;
  border-radius: var(--r-sm);
}

.rte-content :deep(.ProseMirror pre) {
  background: var(--bg-input);
  padding: var(--sp-3);
  border-radius: var(--r-md);
  overflow-x: auto;
}

.rte-content :deep(.ProseMirror pre code) {
  background: none;
  padding: 0;
}

.rte-content :deep(.ProseMirror table) {
  border-collapse: collapse;
  table-layout: fixed;
  width: 100%;
  /* !important: Tiptap bakes its own inline min-width (from column-resize
     metadata, e.g. "min-width: 75px") directly onto the <table> element,
     which otherwise beats this stylesheet rule regardless of specificity. */
  min-width: 360px !important;
  margin: var(--sp-1) 0;
}

.rte-content :deep(.ProseMirror td),
.rte-content :deep(.ProseMirror th) {
  border: 1px solid var(--border-strong);
  padding: var(--sp-1) var(--sp-2);
  vertical-align: top;
  position: relative;
}

.rte-content :deep(.ProseMirror th) {
  background: var(--bg-hover);
  font-weight: 600;
  text-align: left;
}

.rte-content :deep(.ProseMirror .selectedCell) {
  background: rgba(88, 101, 242, 0.16);
}

.rte-content :deep(.ProseMirror ul[data-type="taskList"]) {
  list-style: none;
  padding-left: 0;
}

.rte-content :deep(.ProseMirror ul[data-type="taskList"] li) {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
}

.rte-content :deep(.ProseMirror ul[data-type="taskList"] li > label) {
  flex-shrink: 0;
  margin-top: 3px;
  user-select: none;
}

.rte-content :deep(.ProseMirror ul[data-type="taskList"] li > div) {
  flex: 1;
}

.rte-content :deep(.ProseMirror ul[data-type="taskList"] input[type="checkbox"]) {
  cursor: pointer;
}

.rte-content :deep(.link-embed-card) {
  display: flex;
  max-width: min(432px, 100%);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  overflow: hidden;
  text-decoration: none;
  margin: var(--sp-1) 0;
  cursor: default;
}

.rte-content :deep(.link-embed-accent) {
  width: 4px;
  background: var(--accent);
  flex-shrink: 0;
}

.rte-content :deep(.link-embed-body) {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-3) var(--sp-4);
  overflow: hidden;
}

.rte-content :deep(.link-embed-host) {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.rte-content :deep(.link-embed-url) {
  font-size: var(--text-sm);
  color: var(--text-link);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rte-content :deep(.link-embed-video) {
  display: block;
  max-width: min(480px, 100%);
  margin: var(--sp-1) 0;
}

.rte-content :deep(.link-embed-video-frame) {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: var(--r-lg);
  overflow: hidden;
  background: var(--bg-input);
}

.rte-content :deep(.link-embed-video-frame iframe) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: none;
}

/* TikTok clips are portrait, unlike YouTube's 16:9 */
.rte-content :deep(.link-embed-video--tiktok) {
  max-width: min(325px, 100%);
}

.rte-content :deep(.link-embed-video--tiktok .link-embed-video-frame) {
  aspect-ratio: 9 / 16;
}

/* Generic resolved article card: a small thumbnail beside the title/host/description. */
.rte-content :deep(.link-embed-thumb) {
  width: 96px;
  height: 96px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--bg-input);
}

.rte-content :deep(.link-embed-title) {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.rte-content :deep(.link-embed-description) {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Resolved tweet card: avatar/author header, tweet text, optional media —
   stacked vertically inside the body, unlike the article card's side thumbnail. */
.rte-content :deep(.link-embed-tweet-body) {
  gap: var(--sp-2);
}

.rte-content :deep(.link-embed-tweet-header) {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.rte-content :deep(.link-embed-tweet-avatar) {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.rte-content :deep(.link-embed-tweet-names) {
  display: flex;
  align-items: baseline;
  gap: var(--sp-1);
  overflow: hidden;
}

.rte-content :deep(.link-embed-tweet-name) {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rte-content :deep(.link-embed-tweet-handle) {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  white-space: nowrap;
}

.rte-content :deep(.link-embed-tweet-text) {
  font-size: var(--text-sm);
  color: var(--text-primary);
  white-space: pre-wrap;
}

.rte-content :deep(.link-embed-tweet-media) {
  width: 100%;
  max-height: 240px;
  object-fit: cover;
  border-radius: var(--r-lg);
}
</style>
