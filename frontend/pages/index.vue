<template>
    <div>
        <h1>Home</h1>
    </div>
</template>

<script setup lang="ts">
    definePageMeta({
        layout: 'default',
        title: 'Starter Page',
        // @ts-ignore
        middleware: ['auth'],
    });
</script>
