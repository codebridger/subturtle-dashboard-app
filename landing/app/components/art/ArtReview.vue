<template>
    <!-- The review stairs: each tread longer than the last (1·2·4·8·16 days), and on the higher steps the
         phrase comes back as a gap in its own sentence. -->
    <div class="review">
        <div class="cloze">
            <span>I’m still</span>
            <span class="gap">on</span>
            <span class="gap">the</span>
            <span class="gap">fence</span>
            <span>about it.</span>
            <span class="tick">✓</span>
        </div>
        <div class="stairs">
            <span class="pool">Pool</span>
            <span v-for="(d, i) in DAYS" :key="d" class="step" :style="{ '--i': i }">
                <span class="mono">{{ d }}d</span>
            </span>
        </div>
    </div>
</template>

<script setup lang="ts">
    const DAYS = [1, 2, 4, 8, 16];
</script>

<style scoped>
    .review {
        display: flex;
        flex-direction: column;
        gap: 22px;
        width: 100%;
        max-width: 480px;
    }

    .cloze {
        position: relative;
        align-self: flex-end;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 6px 8px;
        max-width: 90%;
        padding: 14px 20px;
        border-radius: var(--radius-md);
        border: 1.5px solid rgb(var(--jade-300));
        background: rgb(var(--jade-50));
        box-shadow: var(--shadow-accent);
        font-size: 1.125rem;
        font-weight: 800;
        color: rgb(var(--ink-900));
        transform: rotate(-1deg);
    }

    .gap {
        color: rgb(var(--jade-700));
        border-bottom: 3px solid rgb(var(--jade-500));
        line-height: 1.25;
    }

    .tick {
        position: absolute;
        top: -12px;
        right: -12px;
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: rgb(var(--jade-500));
        color: #fff;
        font-size: 1rem;
        box-shadow: 0 0 0 3px #fff;
    }

    .stairs {
        display: flex;
        align-items: flex-end;
        gap: 4px;
        height: 190px;
    }

    .pool {
        display: grid;
        place-items: center;
        flex: 1.2 1 0;
        height: 22px;
        border-radius: 999px;
        background: rgb(var(--sky-100));
        color: rgb(var(--ink-800));
        font-size: 0.6875rem;
        font-weight: 800;
    }

    /* Treads grow with the interval; risers climb evenly. */
    .step {
        flex: calc(1 + var(--i) * var(--i) * 0.45) 1 0;
        height: calc(22% + var(--i) * 19%);
        padding: 8px;
        border-radius: 10px 10px 4px 4px;
        border: 1px solid rgb(var(--border-subtle));
        background: linear-gradient(rgb(var(--white)), rgb(var(--ink-100)));
        box-shadow: var(--shadow-sm);
        font-size: 0.75rem;
        color: rgb(var(--ink-700));
    }
</style>
