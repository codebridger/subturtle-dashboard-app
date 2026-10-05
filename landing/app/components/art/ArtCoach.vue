<template>
    <!-- The coach is a voice, drawn as rose sound rings: no face, no robot. Its deck is the visitor's own
         saved phrases, turning jade as they are practiced. -->
    <div class="coach">
        <div class="deck">
            <span class="card card--done">on the fence</span>
            <span class="card card--done">fair enough</span>
            <span class="card card--done">to be fair</span>
            <span class="card">hang out</span>
        </div>
        <div class="talk">
            <div class="voice">
                <span class="ring ring--1"></span>
                <span class="ring ring--2"></span>
                <span class="orb"><span></span><span></span><span></span><span></span><span></span></span>
                <span class="voice__label mono">Coach · voice</span>
            </div>
            <div class="bubbles">
                <p class="bubble bubble--coach">So… did you take the new job?</p>
                <p class="help"><span lang="es">indeciso</span> = on the fence</p>
                <p class="bubble bubble--you">Honestly, I’m still <strong>on the fence.</strong></p>
            </div>
        </div>
    </div>
</template>

<style scoped>
    .coach {
        display: flex;
        flex-direction: column;
        gap: 26px;
        width: 100%;
        max-width: 560px;
    }

    .deck {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
    }

    .card {
        position: relative;
        padding: 6px 14px;
        border-radius: 12px;
        border: 1px solid rgb(var(--border-subtle));
        background: rgb(var(--white));
        box-shadow: var(--shadow-sm);
        font-weight: 800;
        font-size: 0.875rem;
        color: rgb(var(--ink-800));
    }

    .card--done {
        border-color: rgb(var(--jade-300));
        background: rgb(var(--jade-50));
        color: rgb(var(--jade-700));
    }

    .card--done::after {
        content: '✓';
        position: absolute;
        top: -8px;
        right: -8px;
        display: grid;
        place-items: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgb(var(--jade-500));
        color: #fff;
        font-size: 0.6875rem;
        box-shadow: 0 0 0 2px #fff;
    }

    .talk {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: 18px;
    }

    .voice {
        position: relative;
        display: grid;
        place-items: center;
        width: clamp(110px, 24vw, 150px);
        aspect-ratio: 1;
    }

    .ring {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 2px solid rgb(var(--rose-500) / 0.25);
        animation: pulse 2.6s var(--ease-out) infinite;
    }

    .ring--2 {
        inset: 14%;
        border-color: rgb(var(--rose-500) / 0.4);
        animation-delay: 0.6s;
    }

    .orb {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        width: 54%;
        aspect-ratio: 1;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 30%, #fb6f96, #f91e5a 60%, #e30b4b);
        box-shadow: var(--shadow-primary);
    }

    .orb span {
        width: 4px;
        border-radius: 2px;
        background: #fff;
        height: 30%;
    }

    .orb span:nth-child(2),
    .orb span:nth-child(4) {
        height: 44%;
    }

    .orb span:nth-child(3) {
        height: 56%;
    }

    .voice__label {
        position: absolute;
        bottom: -22px;
        font-size: 0.6875rem;
        color: rgb(var(--ink-600));
        white-space: nowrap;
    }

    .bubbles {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
    }

    .bubble {
        padding: 10px 16px;
        border-radius: 18px;
        font-weight: 800;
        line-height: 1.35;
        box-shadow: var(--shadow-sm);
    }

    .bubble--coach {
        border-top-left-radius: 6px;
        background: rgb(var(--white));
        border: 1px solid rgb(var(--border-subtle));
        color: rgb(var(--ink-900));
    }

    .bubble--you {
        align-self: flex-end;
        border-top-right-radius: 6px;
        background: rgb(var(--rose-50));
        border: 1px solid rgb(var(--rose-200));
        color: rgb(var(--ink-900));
    }

    .bubble--you strong {
        color: rgb(var(--rose-700));
    }

    .help {
        padding: 4px 12px;
        border-radius: 999px;
        background: rgb(var(--sky-100));
        color: rgb(var(--ink-800));
        font-size: 0.8125rem;
        font-weight: 800;
    }

    @keyframes pulse {
        0% {
            transform: scale(0.92);
            opacity: 0.9;
        }
        70% {
            transform: scale(1.06);
            opacity: 0.35;
        }
        100% {
            transform: scale(0.92);
            opacity: 0.9;
        }
    }
</style>
