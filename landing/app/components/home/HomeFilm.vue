<template>
    <section id="film" class="section film" aria-labelledby="film-title">
        <span id="demo" class="legacy-anchor" aria-hidden="true"></span>
        <div class="container film__inner">
            <div class="section-head section-head--center">
                <p class="eyebrow">The film</p>
                <h2 id="film-title" class="section-title">One phrase, all the way.</h2>
                <p class="lede">Follow “on the fence” from a subtitle line to a real conversation.</p>
            </div>

            <div class="player">
                <!-- Nothing heavy loads until the visitor asks: the poster is the whole section until then. -->
                <iframe
                    v-if="playing && filmYoutubeId"
                    class="player__media"
                    :src="`https://www.youtube-nocookie.com/embed/${filmYoutubeId}?autoplay=1&rel=0&modestbranding=1`"
                    title="Subturtle: from watching English to speaking it"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                ></iframe>
                <video v-else-if="playing && filmSrc" class="player__media" :src="filmSrc" poster="/img/poster.webp" controls autoplay playsinline></video>
                <template v-else>
                    <img
                        class="player__media"
                        src="/img/poster.webp"
                        width="1280"
                        height="720"
                        loading="lazy"
                        decoding="async"
                        alt="The film’s end card: “From watching English to speaking it.” in a subtitle bar, with “speaking it.” highlighted in rose."
                    />
                    <button v-if="canPlay" type="button" class="player__play" @click="play">
                        <span class="player__pill">
                            <span class="player__icon"><StIcon name="solar:play-bold" :size="22" /></span>
                            Watch the film
                        </span>
                    </button>
                </template>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
    import { StIcon } from 'subturtle-ui';

    const { filmYoutubeId, filmSrc } = useRuntimeConfig().public;
    const canPlay = Boolean(filmYoutubeId || filmSrc);
    const playing = ref(false);

    function play() {
        playing.value = true;
        track('film_played', { source: filmYoutubeId ? 'youtube' : 'file' });
    }
</script>

<style scoped>
    .film__inner {
        display: flex;
        flex-direction: column;
        gap: clamp(2rem, 4vw, 3rem);
    }

    .player {
        position: relative;
        width: 100%;
        max-width: 960px;
        margin-inline: auto;
        aspect-ratio: 16 / 9;
        overflow: hidden;
        border-radius: var(--radius-xl);
        background: rgb(var(--ink-100));
        box-shadow: var(--shadow-xl);
    }

    .player__media {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border: 0;
    }

    /* The whole poster is the button; the visible control is a pill in the corner, clear of the
       poster's own headline. */
    .player__play {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: flex-end;
        justify-content: flex-start;
        padding: clamp(12px, 3vw, 24px);
        border: 0;
        background: none;
        cursor: pointer;
    }

    .player__pill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 6px 18px 6px 6px;
        border-radius: var(--radius-pill);
        background: rgb(var(--ink-950) / 0.88);
        color: #fff;
        font-weight: 800;
        font-size: 1rem;
        box-shadow: var(--shadow-lg);
    }

    .player__icon {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        padding-left: 3px;
        border-radius: 50%;
        background: rgb(var(--rose-600));
        transition: transform var(--dur-base) var(--ease-spring);
    }

    .player__play:hover .player__icon {
        transform: scale(1.06);
    }
</style>
