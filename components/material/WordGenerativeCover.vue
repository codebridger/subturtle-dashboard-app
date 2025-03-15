<script setup lang="ts">
const props = defineProps<{
  words: string[];
  classes: string[];
}>();

function getUrl() {
  return (
    "/wordcloud/index.html?words=" +
    encodeURIComponent(JSON.stringify(props.words))
  );
}
</script>

<template>
  <iframe
    ref="container"
    :class="[...props.classes, 'bg-blue-400']"
    :src="getUrl()"
  />
</template>
