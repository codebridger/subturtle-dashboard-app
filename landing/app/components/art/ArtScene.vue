<template>
    <!-- One coordinate system for the boxes and the threads: the stage is 520×340 units, HTML parts are
         placed in % of it and sized in cqw, and the SVG threads share the same viewBox. -->
    <div class="stage">
        <svg class="threads" viewBox="0 0 520 340" preserveAspectRatio="none">
            <defs>
                <marker :id="`${id}-tip`" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M0 0 L10 5 L0 10 z" fill="#f91e5a" />
                </marker>
            </defs>
            <path d="M332 72 C 280 72, 268 118, 214 118" :marker-end="`url(#${id}-tip)`" />
            <path d="M332 184 C 280 184, 268 183, 214 183" :marker-end="`url(#${id}-tip)`" />
            <path d="M332 278 C 280 278, 268 248, 214 248" :marker-end="`url(#${id}-tip)`" />
        </svg>

        <div class="bundle">
            <span class="bundle__name">Rooftop Nights S1</span>
        </div>
        <span class="chip" style="top: 30%">on the fence</span>
        <span class="chip" style="top: 49%">touch base</span>
        <span class="chip" style="top: 68%">figure it out</span>

        <div class="src" style="top: 8%">
            <span class="src__tv"><span class="src__cap"></span></span>
            <span class="src__label">Rooftop Nights · S1E4</span>
        </div>
        <div class="src" style="top: 41%">
            <span class="src__tv src__tv--talk"><span class="src__cap"></span></span>
            <span class="src__label">Dev Talks · Ep. 12</span>
        </div>
        <div class="src" style="top: 73%">
            <span class="src__page"><span></span><span></span><span></span></span>
            <span class="src__label">The Weekly Byte</span>
        </div>
    </div>
</template>

<script setup lang="ts">
    const id = useId();
</script>

<style scoped>
    .stage {
        position: relative;
        width: 100%;
        max-width: 520px;
        aspect-ratio: 520 / 340;
        container-type: inline-size;
    }

    .threads {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
    }

    .threads path {
        fill: none;
        stroke: #f91e5a;
        stroke-width: 2;
        stroke-dasharray: 5 6;
        vector-effect: non-scaling-stroke;
    }

    .bundle {
        position: absolute;
        left: 2%;
        top: 13%;
        width: 41%;
        height: 80%;
        border-radius: 5cqw;
        border: 1px solid rgb(var(--border-subtle));
        background: linear-gradient(176deg, rgb(var(--white)), rgb(var(--ink-100)));
        box-shadow: var(--shadow-md);
    }

    .bundle__name {
        position: absolute;
        top: -3.6cqw;
        left: 3cqw;
        padding: 1.2cqw 2.6cqw;
        border-radius: 999px;
        background: rgb(var(--rose-100));
        color: rgb(var(--rose-800));
        font-size: 2.9cqw;
        font-weight: 800;
        white-space: nowrap;
    }

    .chip {
        position: absolute;
        left: 6.5%;
        width: 32%;
        padding: 1.6cqw 2.4cqw;
        border-radius: 2.4cqw;
        background: rgb(var(--white));
        box-shadow: var(--shadow-sm);
        border: 1px solid rgb(var(--border-subtle));
        font-size: 3.2cqw;
        font-weight: 800;
        color: rgb(var(--text-strong));
        white-space: nowrap;
    }

    .src {
        position: absolute;
        left: 64.5%;
        width: 33%;
        display: flex;
        flex-direction: column;
        gap: 1.2cqw;
    }

    .src__tv {
        position: relative;
        display: block;
        aspect-ratio: 16 / 8;
        border-radius: 2.4cqw;
        border: 1px solid rgb(var(--border-subtle));
        background: linear-gradient(180deg, #fde9f0, #ecdff0);
        box-shadow: var(--shadow-md);
    }

    .src__tv--talk {
        background: linear-gradient(180deg, #e9f4fd, #e2e8f6);
    }

    .src__cap {
        position: absolute;
        left: 22%;
        right: 22%;
        bottom: 14%;
        height: 12%;
        border-radius: 1cqw;
        background: rgb(var(--rose-400));
    }

    .src__page {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 1.4cqw;
        aspect-ratio: 16 / 6;
        padding: 0 3cqw;
        border-radius: 2.4cqw;
        border: 1px solid rgb(var(--border-subtle));
        background: rgb(var(--white));
        box-shadow: var(--shadow-sm);
    }

    .src__page span {
        height: 1.3cqw;
        border-radius: 1cqw;
        background: rgb(var(--ink-200));
    }

    .src__page span:nth-child(2) {
        width: 55%;
        background: rgb(var(--rose-500));
    }

    .src__label {
        font-size: 2.7cqw;
        font-weight: 800;
        color: rgb(var(--ink-700));
        white-space: nowrap;
    }
</style>
