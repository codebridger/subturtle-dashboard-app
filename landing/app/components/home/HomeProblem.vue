<template>
    <section class="section problem" aria-labelledby="problem-title">
        <div class="container problem__inner">
            <div class="section-head section-head--center">
                <p class="eyebrow">Sound familiar?</p>
                <h2 id="problem-title" class="section-title">You understand English on screen. Speaking it is harder.</h2>
            </div>
            <ol class="lines">
                <li><span class="line">You read and watch English every day.</span></li>
                <li><span class="line">You look words up.</span></li>
                <li><span class="line">By tomorrow, they’re gone.</span></li>
                <li><span class="line">When it’s your turn to speak, nothing comes.</span></li>
            </ol>
            <p class="resolve">
                Subturtle keeps the phrases you meet on pages and in shows, and helps you <span class="resolve__mark">say them out loud.</span>
            </p>
        </div>
    </section>
</template>

<style scoped>
    .problem {
        background: linear-gradient(rgb(var(--ink-100) / 0), rgb(var(--ink-100) / 0.9) 30%, rgb(var(--ink-100) / 0));
    }

    .problem__inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: clamp(2rem, 4vw, 3rem);
        text-align: center;
    }

    /* The "before": quiet lines, still without colour. */
    .lines {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 0;
        list-style: none;
    }

    .line {
        display: inline-block;
        padding: 0.3em 0.8em;
        border-radius: 12px;
        border: 1px solid rgb(var(--border-subtle));
        background: rgb(var(--white));
        box-shadow: var(--shadow-xs);
        color: rgb(var(--ink-700));
        font-weight: 800;
        font-size: clamp(1.0625rem, 2.4vw, 1.375rem);
        line-height: 1.45;
    }

    /* The last line lands: when it is your turn, the words do not come. */
    .lines li:last-child .line {
        color: rgb(var(--text-strong));
        border-color: rgb(var(--rose-200));
        background: rgb(var(--rose-50));
    }

    .resolve {
        max-width: 34rem;
        font-size: clamp(1.25rem, 2.6vw, 1.625rem);
        font-weight: 800;
        line-height: 1.4;
        color: rgb(var(--text-strong));
    }

    .resolve__mark {
        color: rgb(var(--rose-700));
    }
</style>
