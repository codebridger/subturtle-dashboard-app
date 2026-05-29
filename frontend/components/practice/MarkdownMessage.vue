<template>
    <!-- dir="auto" so each message picks LTR/RTL from its own content. -->
    <div class="markdown-message" dir="auto" v-html="rendered" />
</template>

<script setup lang="ts">
// Renders a live-session chat bubble's content as markdown. Shared by the voice
// and text practice pages so both render identically.
import MarkdownIt from 'markdown-it';

const props = defineProps<{ content: string }>();

// Chat-message markdown:
//  - html: false  → raw HTML in the source is escaped (XSS-safe for AI/user text)
//  - linkify      → bare URLs become links
//  - breaks       → single newlines become <br>, so messages read naturally
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

// Open links in a new tab with a safe rel.
const defaultLinkOpen =
    md.renderer.rules.link_open ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
    return defaultLinkOpen(tokens, idx, options, env, self);
};

const rendered = computed(() => md.render(props.content || ''));
</script>

<style scoped>
/* Inherit the bubble's color/size; keep spacing tight for chat. Logical
   properties (inline-start) keep it correct under RTL via dir="auto". */
.markdown-message {
    color: inherit;
    font-size: inherit;
    line-height: 1.5;
    word-break: break-word;
}

.markdown-message :deep(p) {
    margin: 0;
}

.markdown-message :deep(p + p) {
    margin-top: 0.5rem;
}

.markdown-message :deep(ul),
.markdown-message :deep(ol) {
    margin: 0.25rem 0;
    padding-inline-start: 1.25rem;
}

.markdown-message :deep(ul) {
    list-style: disc;
}

.markdown-message :deep(ol) {
    list-style: decimal;
}

.markdown-message :deep(li) {
    margin: 0.125rem 0;
}

.markdown-message :deep(a) {
    text-decoration: underline;
}

.markdown-message :deep(strong) {
    font-weight: 700;
}

.markdown-message :deep(em) {
    font-style: italic;
}

.markdown-message :deep(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.85em;
    padding: 0.1em 0.3em;
    border-radius: 0.25rem;
    background: rgba(128, 128, 128, 0.2);
}

.markdown-message :deep(pre) {
    margin: 0.5rem 0;
    padding: 0.6rem 0.75rem;
    border-radius: 0.5rem;
    background: rgba(128, 128, 128, 0.2);
    overflow-x: auto;
}

.markdown-message :deep(pre code) {
    background: transparent;
    padding: 0;
    font-size: 0.85em;
}

.markdown-message :deep(blockquote) {
    margin: 0.25rem 0;
    padding-inline-start: 0.75rem;
    border-inline-start: 2px solid currentColor;
    opacity: 0.75;
}

.markdown-message :deep(h1),
.markdown-message :deep(h2),
.markdown-message :deep(h3) {
    margin: 0.5rem 0 0.25rem;
    font-weight: 700;
    font-size: 1em;
}
</style>
