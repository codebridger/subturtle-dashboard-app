<template>
    <div class="meaning">
        <div class="wbw">
            <span class="wbw__label">Word by word</span>
            <span class="wbw__chips"><span>on</span><span>the</span><span>fence</span></span>
            <span class="wbw__joke">…sitting on a fence?</span>
        </div>
        <div class="pcard">
            <div class="pcard__head">
                <span class="pcard__phrase">on the fence</span>
                <span class="pcard__tags"><span class="tag tag--rose">idiom</span><span class="tag">informal</span></span>
            </div>
            <p class="pcard__say">on de fens <span class="pcard__say-label">said in your alphabet</span></p>
            <p class="pcard__meaning"><strong lang="es">indeciso</strong> · not decided yet</p>
            <p class="pcard__quote">“Honestly, I’m still <span>on the fence</span> about it.”</p>
        </div>
        <span class="float float--a" lang="tr">kararsız</span>
        <span class="float float--b" lang="fa" dir="rtl">دودل</span>
        <span class="float float--c" lang="ko">망설이는</span>
        <span class="float float--d" lang="ru">в раздумьях</span>
    </div>
</template>

<style scoped>
    .meaning {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 18px;
        width: 100%;
        max-width: 440px;
        padding-block: 26px;
    }

    .wbw {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 10px;
    }

    .wbw__label {
        width: 100%;
        font-family: var(--font-mono);
        font-size: 0.6875rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgb(var(--ink-600));
    }

    .wbw__chips {
        display: flex;
        gap: 6px;
    }

    .wbw__chips span {
        padding: 4px 10px;
        border-radius: 10px;
        border: 1px solid rgb(var(--border-subtle));
        background: rgb(var(--white));
        font-weight: 700;
        color: rgb(var(--ink-600));
        text-decoration: line-through rgb(var(--rose-400) / 0.7);
    }

    .wbw__joke {
        font-size: 0.875rem;
        font-style: italic;
        color: rgb(var(--ink-600));
    }

    .pcard {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 20px 22px;
        border-radius: var(--radius-lg);
        background: rgb(var(--white));
        box-shadow: var(--shadow-xl);
        transform: rotate(-1.2deg);
    }

    .pcard__head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 12px;
    }

    .pcard__phrase {
        font-size: 1.75rem;
        font-weight: 900;
        letter-spacing: -0.015em;
        color: rgb(var(--text-strong));
    }

    .pcard__tags {
        display: flex;
        gap: 6px;
    }

    .tag {
        padding: 2px 9px;
        border-radius: 999px;
        background: rgb(var(--ink-100));
        color: rgb(var(--ink-700));
        font-size: 0.6875rem;
        font-weight: 800;
    }

    .tag--rose {
        background: rgb(var(--rose-100));
        color: rgb(var(--rose-700));
    }

    .pcard__say {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 2px 10px;
        font-size: 1.125rem;
        font-weight: 800;
        color: rgb(var(--ink-800));
    }

    .pcard__say-label {
        font-family: var(--font-mono);
        font-size: 0.6875rem;
        font-weight: 500;
        color: rgb(var(--ink-600));
    }

    .pcard__meaning {
        color: rgb(var(--ink-700));
    }

    .pcard__meaning strong {
        font-size: 1.375rem;
        font-weight: 900;
        color: rgb(var(--text-strong));
    }

    .pcard__quote {
        font-size: 0.875rem;
        font-style: italic;
        color: rgb(var(--ink-600));
    }

    .pcard__quote span {
        color: rgb(var(--rose-700));
        font-weight: 700;
    }

    .float {
        position: absolute;
        padding: 3px 11px;
        border-radius: 999px;
        border: 1px solid rgb(var(--border-subtle));
        background: rgb(var(--white));
        box-shadow: var(--shadow-sm);
        font-size: 0.8125rem;
        font-weight: 800;
        color: rgb(var(--ink-700));
    }

    .float--a {
        top: 0;
        right: 4%;
    }

    .float--b {
        bottom: 0;
        left: 42%;
    }

    .float--c {
        bottom: 4px;
        right: 2%;
    }

    .float--d {
        bottom: 2px;
        left: 0;
    }
</style>
