<template>
    <!-- The three kinds of source, invented and never a real site's interface. The web page leads: it is
         where people meet English most often. -->
    <div class="sources">
        <div class="tile tile--page">
            <div class="page">
                <div class="page__bar"><i></i><i></i><i></i><span>Any web page</span></div>
                <div class="page__body">
                    <span class="page__mast">The Weekly Byte</span>
                    <span class="page__text">It’s <mark>a long shot</mark>, but the new plan is worth a try.</span>
                    <span class="page__line"></span>
                    <span class="page__line page__line--short"></span>
                </div>
            </div>
            <span class="label">A web page · The Weekly Byte</span>
        </div>
        <div class="tile tile--show">
            <div class="tv tv--show">
                <span class="tv__sun"></span>
                <span class="cap">I’m still <b>on the fence</b>.</span>
            </div>
            <span class="label">A show · Rooftop Nights</span>
        </div>
        <div class="tile tile--talk">
            <div class="tv tv--talk">
                <span class="tv__slide"><i></i><i></i><i></i></span>
                <span class="cap">Let’s <b>touch base</b>.</span>
            </div>
            <span class="label">A talk · Dev Talks</span>
        </div>
    </div>
</template>

<style scoped>
    .sources {
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-areas: 'page page' 'show talk';
        gap: 16px;
        width: 100%;
        max-width: 460px;
    }

    .tile {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }

    .tile--page {
        grid-area: page;
    }

    .tile--show {
        grid-area: show;
    }

    .tile--talk {
        grid-area: talk;
    }

    /* The page: a light browser window with a selected phrase. */
    .page {
        overflow: hidden;
        border-radius: 16px;
        border: 1px solid rgb(var(--border-subtle));
        background: rgb(var(--white));
        box-shadow: var(--shadow-md);
    }

    .page__bar {
        display: flex;
        align-items: center;
        gap: 5px;
        height: 30px;
        padding: 0 12px;
        border-bottom: 1px solid rgb(var(--border-subtle));
        background: rgb(var(--ink-50));
    }

    .page__bar i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgb(var(--ink-200));
    }

    .page__bar span {
        margin-inline-start: 8px;
        padding: 1px 10px;
        border-radius: 999px;
        border: 1px solid rgb(var(--border-subtle));
        background: rgb(var(--white));
        font-size: 0.6875rem;
        font-weight: 700;
        color: rgb(var(--ink-600));
    }

    .page__body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px 16px 16px;
    }

    .page__mast {
        font-size: 0.625rem;
        font-weight: 800;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: rgb(var(--ink-600));
    }

    .page__text {
        font-size: 1rem;
        font-weight: 700;
        line-height: 1.5;
        color: rgb(var(--ink-800));
    }

    mark {
        padding: 0 0.12em;
        border-radius: 4px;
        background: rgb(var(--rose-100));
        color: rgb(var(--rose-800));
    }

    .page__line {
        height: 6px;
        border-radius: 3px;
        background: rgb(var(--ink-100));
    }

    .page__line--short {
        width: 64%;
    }

    /* The videos: light frames in the brand's dusk tints, with a small caption bar. */
    .tv {
        position: relative;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        aspect-ratio: 16 / 10;
        padding: 0 6px 9%;
        overflow: hidden;
        border-radius: 16px;
        border: 1px solid rgb(var(--border-subtle));
        box-shadow: var(--shadow-md);
    }

    .tv--show {
        background: linear-gradient(180deg, #fde9f0, #ecdff0);
    }

    .tv--talk {
        background: linear-gradient(180deg, #e9f4fd, #e2e8f6);
    }

    .tv__sun {
        position: absolute;
        top: 16%;
        right: 14%;
        width: 18%;
        aspect-ratio: 1;
        border-radius: 50%;
        background: #fff3e6;
        box-shadow: 0 0 26px 8px rgb(255 214 189 / 0.6);
    }

    /* A talk reads as a slide: a title bar and two lines. */
    .tv__slide {
        position: absolute;
        top: 14%;
        left: 18%;
        right: 18%;
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding: 9px 10px;
        border-radius: 8px;
        background: rgb(255 255 255 / 0.85);
    }

    .tv__slide i {
        height: 5px;
        border-radius: 3px;
        background: rgb(var(--sky-500) / 0.45);
    }

    .tv__slide i:first-child {
        width: 60%;
        height: 7px;
        background: rgb(var(--ink-700) / 0.55);
    }

    .tv__slide i:last-child {
        width: 75%;
    }

    .cap {
        position: relative;
        padding: 0.15em 0.45em;
        border-radius: 6px;
        background: rgb(39 31 45 / 0.8);
        color: #fff;
        font-weight: 800;
        font-size: 0.75rem;
        line-height: 1.45;
        text-align: center;
    }

    .cap b {
        padding: 0 0.12em;
        border-radius: 4px;
        background: rgb(var(--rose-600));
    }

    .label {
        font-size: 0.8125rem;
        font-weight: 800;
        color: rgb(var(--ink-700));
    }
</style>
